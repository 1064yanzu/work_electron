/**
 * 桥接层 —— 把「另一个 AI 入口」变成一次可调用、可超时、可审计的函数调用。
 *
 * 这是整个 Hub 从「聚合」走向「协作」的关键：各入口的独占能力（Web 端订阅制的
 * 联网/深度研究、Gemini 的超长上下文、Claude Code 的代码改写）互相开放，
 * 谁擅长什么就让谁干。
 *
 * 三种目标：
 * - `cli`：起子进程跑 headless 模式（`claude -p` / `codex exec` / `gemini -p`）
 * - `web`：内嵌 WebContentsView 注入 → 发送 → 等回答稳定 → 提取
 * - `app`：本应用自己的 LLM 调用层
 *
 * 三条硬规则：
 * 1. **一定有超时**。子进程和网页都可能永远不返回，没有超时的桥接会挂死调用方。
 * 2. **失败就是失败**。不返回编造的答案、不用别的入口的结果顶替，
 *    `ok=false` + 具体 error 原文交给调用方判断。
 * 3. **每次调用都落审计行**（`harness_bridge_calls`），谁调了谁、花了多久、
 *    成没成，事后可查。
 */
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type { DbContext } from "../db/client";
import { invokeLlm } from "../llm/invoke";
import { createLogger } from "../logging/logger";
import { getAiHubViewService } from "../services/aiHubViewService";
import { harnessRuntimeMonitor } from "./automation/runtimeMonitor";
import {
	DEFAULT_HARNESS_HUB_SETTINGS,
	loadHarnessHubSettings,
} from "./settings";
import { findWebSite, loadWebSites } from "./webSites";
import type {
	BridgeCallRequest,
	BridgeCallResult,
	BridgeTargetKind,
} from "./types";

const logger = createLogger();

/** CLI 子进程默认超时（headless agent 干一件事通常在 1–3 分钟量级）。 */
const DEFAULT_CLI_TIMEOUT_MS = 300_000;
/** Web 站点默认超时。 */
const DEFAULT_WEB_TIMEOUT_MS = 180_000;
/** 本应用 LLM 默认超时。 */
const DEFAULT_APP_TIMEOUT_MS = 120_000;

/** 子进程 stdout 上限，防止 agent 刷屏把主进程内存撑爆。 */
const MAX_STDOUT_BYTES = 8 * 1024 * 1024;

/**
 * 留给失败分类器的输出上限。
 * 只需要够看清报错，不必留全文——全文已经在 answer / 审计行里了。
 */
const MAX_TRACKED_OUTPUT_CHARS = 20_000;

/**
 * PATH 兜底目录：GUI 启动的 Electron 拿不到用户 shell 的完整 PATH。
 * 与 detect.ts 同一份口径（那边用于 which，这里用于 spawn 的 env）。
 */
const EXTRA_PATH_DIRS = [
	path.join(homedir(), ".local", "bin"),
	path.join(homedir(), ".npm-global", "bin"),
	"/opt/homebrew/bin",
	"/usr/local/bin",
	path.join(homedir(), ".bun", "bin"),
	path.join(homedir(), ".volta", "bin"),
];

function spawnEnv(): NodeJS.ProcessEnv {
	return {
		...process.env,
		PATH: `${process.env.PATH ?? ""}:${EXTRA_PATH_DIRS.join(":")}`,
		// 关掉各家 CLI 的彩色输出，避免 ANSI 序列混进返回文本
		NO_COLOR: "1",
		FORCE_COLOR: "0",
	};
}

/**
 * 各 CLI 的 headless 调用规格。
 *
 * 参数集中在这里，是因为这些 flag 会随 CLI 版本变动——出问题时只改这一处，
 * 且设置面板可以覆盖（见 `BridgeOptions.extraArgs`）。
 *
 * **默认只读**：桥接调用是程序自动发起的，用户没有逐条审阅的机会，
 * 默认给写权限等于让一个后台调用随时改用户的代码。要写必须显式开
 * （`allowWrite`），这是安全边界不是保守。
 */
interface CliExecSpec {
	bin: string;
	/**
	 * 构造参数。
	 * @param prompt     问题
	 * @param allowWrite 是否允许目标 agent 改文件
	 * @param outFile    若 CLI 支持把最终答案写文件，则给出路径（更干净的取值方式）
	 */
	buildArgs: (options: {
		prompt: string;
		allowWrite: boolean;
		outFile: string | null;
		cwd: string | null;
	}) => string[];
	/** 该 CLI 是否支持把最终答案单独写到文件 */
	supportsOutFile: boolean;
	/** 从 stdout 里提取答案（不支持 outFile 时用） */
	extract?: (stdout: string) => string;
}

export const CLI_EXEC_SPECS: Record<string, CliExecSpec> = {
	"claude-code": {
		bin: "claude",
		supportsOutFile: false,
		buildArgs: ({ prompt, allowWrite }) => [
			"-p",
			prompt,
			"--output-format",
			"text",
			// 显式列出允许的工具 = 这些工具自动放行，其余会被拒；
			// 非交互模式下没人能应答权限询问，不给 allowedTools 会直接卡死
			"--allowedTools",
			allowWrite
				? "Read Grep Glob WebFetch Edit Write Bash"
				: "Read Grep Glob WebFetch",
		],
	},
	codex: {
		bin: "codex",
		supportsOutFile: true,
		buildArgs: ({ prompt, allowWrite, outFile, cwd }) => [
			"exec",
			"--color",
			"never",
			"--skip-git-repo-check",
			"-s",
			allowWrite ? "workspace-write" : "read-only",
			...(cwd ? ["-C", cwd] : []),
			...(outFile ? ["-o", outFile] : []),
			prompt,
		],
	},
	"gemini-cli": {
		bin: "gemini",
		supportsOutFile: false,
		buildArgs: ({ prompt, allowWrite }) => [
			"-p",
			prompt,
			"--approval-mode",
			allowWrite ? "auto_edit" : "plan",
		],
	},
};

/** 该 harness 能否作为工具被调用。 */
export function canBridgeCli(harness: string): boolean {
	return Boolean(CLI_EXEC_SPECS[harness]);
}

/** 可作为工具调用的 CLI 清单（供 UI 与 MCP 工具描述用）。 */
export function bridgeableClis(): string[] {
	return Object.keys(CLI_EXEC_SPECS);
}

export interface BridgeOptions {
	/** 允许目标 agent 改文件（默认 false，只读） */
	allowWrite?: boolean;
	/** 追加到 CLI 命令行的额外参数（设置面板可配） */
	extraArgs?: string[];
	/** 模型覆盖（app 目标用） */
	model?: string;
	/**
	 * 完全覆盖 CLI 参数构造。
	 *
	 * 自动化守护重试时要跑的是「续接上次那段会话」而不是重发原始指令，
	 * 参数形态与常规调用不同（见 runner.ts）。这里开一个口子让调用方自己拼，
	 * 而不是把重试逻辑塞进 CLI_EXEC_SPECS —— 那张表的定位是「各 CLI 的标准
	 * headless 规格」，混入调用场景会让它很快变得没法维护。
	 */
	buildArgsOverride?: (context: {
		prompt: string;
		allowWrite: boolean;
		cwd: string | null;
	}) => string[];
	/** 实时输出回调（每收到一段 stdout/stderr 调一次），用于运行态监测 */
	onProgress?: (chunk: string) => void;
	/** 外部中止信号。守护判定卡死时用它掐掉子进程 */
	signal?: AbortSignal;
	/** 由自动化任务发起时关联的 run id */
	jobRunId?: string | null;
}

// ============================================================
// 审计
// ============================================================

async function openCallRecord(
	db: DbContext,
	req: BridgeCallRequest,
): Promise<string> {
	const id = randomUUID();
	await db.client.execute({
		sql: `INSERT INTO harness_bridge_calls
		        (id, caller, target, target_kind, prompt, cwd, response, status, error, duration_ms, created_at, finished_at)
		      VALUES (?, ?, ?, ?, ?, ?, NULL, 'running', NULL, 0, ?, NULL)`,
		args: [
			id,
			req.caller ?? "ipo-sdk",
			req.target,
			req.kind,
			req.prompt.slice(0, 20_000),
			req.cwd ?? null,
			Date.now(),
		],
	});
	return id;
}

async function closeCallRecord(
	db: DbContext,
	id: string,
	result: {
		status: "succeeded" | "failed" | "timeout";
		response?: string;
		error?: string | null;
		durationMs: number;
	},
): Promise<void> {
	await db.client.execute({
		sql: `UPDATE harness_bridge_calls
		      SET status = ?, response = ?, error = ?, duration_ms = ?, finished_at = ?
		      WHERE id = ?`,
		args: [
			result.status,
			result.response?.slice(0, 200_000) ?? null,
			result.error ?? null,
			result.durationMs,
			Date.now(),
			id,
		],
	});
}

// ============================================================
// CLI
// ============================================================

/** 起一个 CLI 子进程跑 headless 问答。 */
async function askCli(
	harness: string,
	prompt: string,
	options: {
		cwd: string | null;
		timeoutMs: number;
		allowWrite: boolean;
		extraArgs: string[];
		buildArgsOverride?: BridgeOptions["buildArgsOverride"];
		onProgress?: (chunk: string) => void;
		signal?: AbortSignal;
	},
): Promise<{
	ok: boolean;
	answer: string;
	error: string | null;
	exitCode: number | null;
	/** 混合的 stdout+stderr 原文，供失败分类器判定 */
	rawOutput: string;
}> {
	const spec = CLI_EXEC_SPECS[harness];
	if (!spec) {
		return {
			ok: false,
			answer: "",
			error: `${harness} 不支持作为工具被调用（没有已验证的 headless 模式）`,
			exitCode: null,
			rawOutput: "",
		};
	}

	// 支持 -o 的 CLI 走临时文件取最终答案，比从混着日志的 stdout 里扒干净得多
	let tempDir: string | null = null;
	let outFile: string | null = null;
	if (spec.supportsOutFile) {
		try {
			tempDir = await mkdtemp(path.join(tmpdir(), "aihub-bridge-"));
			outFile = path.join(tempDir, "answer.txt");
		} catch {
			outFile = null;
		}
	}

	const args = options.buildArgsOverride
		? options.buildArgsOverride({
				prompt,
				allowWrite: options.allowWrite,
				cwd: options.cwd,
			})
		: [
				...spec.buildArgs({
					prompt,
					allowWrite: options.allowWrite,
					outFile,
					cwd: options.cwd,
				}),
				...options.extraArgs,
			];

	// stdout + stderr 的原文。CLI 常把 `API Error: 429` 打在 stderr 上却以 0 退出，
	// 只看 stdout 或只看退出码都会把一次失败当成功。
	let rawOutput = "";
	let exitCode: number | null = null;

	try {
		const stdout = await new Promise<string>((resolve, reject) => {
			const child = execFile(
				spec.bin,
				args,
				{
					cwd: options.cwd ?? undefined,
					env: spawnEnv(),
					timeout: options.timeoutMs,
					maxBuffer: MAX_STDOUT_BYTES,
					signal: options.signal,
					// 部分 CLI 在没有 TTY 时会等 stdin，显式给个空输入
					windowsHide: true,
				},
				(error, out, errOut) => {
					if (error) {
						const err = error as NodeJS.ErrnoException & {
							killed?: boolean;
							code?: number | string;
						};
						exitCode = typeof err.code === "number" ? err.code : null;
						const aborted = err.name === "AbortError";
						reject(
							new Error(
								aborted
									? `${spec.bin} 已被中止`
									: err.killed
										? `${spec.bin} 执行超时（${Math.round(options.timeoutMs / 1000)}s）`
										: `${spec.bin} 执行失败：${String(errOut || error.message).slice(0, 2000)}`,
							),
						);
						return;
					}
					exitCode = 0;
					resolve(String(out ?? ""));
				},
			);
			// 流式镜像：让运行态监测能实时看到它在干什么，而不是等几分钟后
			// 一次性拿到全部输出——中途报错就永远发现不了。
			const mirror = (chunk: unknown) => {
				const text = String(chunk ?? "");
				if (!text) return;
				rawOutput = `${rawOutput}${text}`.slice(-MAX_TRACKED_OUTPUT_CHARS);
				options.onProgress?.(text);
			};
			child.stdout?.on("data", mirror);
			child.stderr?.on("data", mirror);
			// 立刻关掉 stdin：`codex exec` 在 stdin 是管道且不关闭时会一直等输入
			child.stdin?.end();
		});

		let answer = "";
		if (outFile) {
			answer = await readFile(outFile, "utf-8").catch(() => "");
		}
		if (!answer.trim()) {
			answer = spec.extract ? spec.extract(stdout) : stdout;
		}
		answer = answer.trim();

		if (!answer) {
			return {
				ok: false,
				answer: "",
				error: `${spec.bin} 没有产出任何内容`,
				exitCode,
				rawOutput,
			};
		}
		return { ok: true, answer, error: null, exitCode, rawOutput };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			answer: "",
			error: message,
			exitCode,
			// 把错误消息一并交给分类器：超时/中止这类信息只存在于这里
			rawOutput: `${rawOutput}\n${message}`.slice(-MAX_TRACKED_OUTPUT_CHARS),
		};
	} finally {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true }).catch(
				() => undefined,
			);
		}
	}
}

// ============================================================
// 统一入口
// ============================================================

/**
 * 执行一次桥接调用。
 *
 * 无论成败都会写审计行；异常不外抛，一律转成 `ok=false` 的结果——
 * 调用方多半是 MCP 工具，抛异常只会变成一句无信息量的 "tool error"。
 */
export async function runBridgeCall(
	db: DbContext,
	req: BridgeCallRequest,
	options: BridgeOptions = {},
): Promise<BridgeCallResult> {
	const started = Date.now();
	const kind: BridgeTargetKind = req.kind;
	const callId = await openCallRecord(db, req).catch(() => randomUUID());

	// 内部中止句柄：既接外部传进来的 signal（守护判定卡死时掐掉），
	// 也让运行监视面板上的「中止」按钮有东西可按。
	const abortController = new AbortController();
	if (options.signal) {
		if (options.signal.aborted) abortController.abort();
		else
			options.signal.addEventListener("abort", () => abortController.abort(), {
				once: true,
			});
	}

	const finish = async (
		result: Omit<BridgeCallResult, "callId" | "durationMs" | "target" | "kind">,
	): Promise<BridgeCallResult> => {
		const durationMs = Date.now() - started;
		await closeCallRecord(db, callId, {
			status: result.ok ? "succeeded" : "failed",
			response: result.answer,
			error: result.error,
			durationMs,
		}).catch(() => undefined);
		return {
			...result,
			callId,
			target: req.target,
			kind,
			durationMs,
		};
	};

	const prompt = req.prompt.trim();
	if (!prompt) {
		return await finish({
			ok: false,
			answer: "",
			error: "prompt 为空",
			partial: false,
		});
	}

	// 调用方没给超时/写权限时，用用户在设置面板里配的值，而不是硬编码常量。
	// 读失败（DB 异常）就落到模块默认值，不能因为读不到配置就不干活。
	const settings = await loadHarnessHubSettings(db).catch(
		() => DEFAULT_HARNESS_HUB_SETTINGS,
	);
	const allowWrite = options.allowWrite ?? settings.bridgeAllowWrite;

	// 登记到运行态监测。cli 目标有流式输出可看，web / app 目标只能显示
	// 「在跑」——如实反映，不给后两者伪造进度。
	const runtimeId = harnessRuntimeMonitor.register({
		kind: "bridge",
		harness: req.target,
		label: `${req.target}（后台）`,
		cwd: req.cwd ?? null,
		jobRunId: options.jobRunId ?? null,
		bridgeCallId: callId,
		abort: kind === "cli" ? () => abortController.abort() : null,
		// web / app 目标拿不到增量输出，参与卡死判定必然被误判
		stallDetection: kind === "cli",
	});
	const finishRuntime = (
		result: Pick<BridgeCallResult, "ok" | "error">,
		exitCode: number | null,
		rawOutput: string,
	) => {
		harnessRuntimeMonitor.markExited(
			runtimeId,
			exitCode ?? (result.ok ? 0 : 1),
			rawOutput || result.error || "",
		);
	};

	try {
		if (kind === "cli") {
			const r = await askCli(req.target, prompt, {
				cwd: req.cwd ?? null,
				timeoutMs: req.timeoutMs ?? settings.bridgeCliTimeoutMs,
				allowWrite,
				extraArgs: options.extraArgs ?? [],
				buildArgsOverride: options.buildArgsOverride,
				onProgress: (chunk) => {
					harnessRuntimeMonitor.noteOutput(runtimeId, chunk);
					options.onProgress?.(chunk);
				},
				signal: abortController.signal,
			});
			finishRuntime(r, r.exitCode, r.rawOutput);
			return await finish({
				ok: r.ok,
				answer: r.answer,
				error: r.error,
				partial: false,
				exitCode: r.exitCode,
				rawOutput: r.rawOutput,
			});
		}

		if (kind === "web") {
			const sites = await loadWebSites(db);
			const site = findWebSite(sites, req.target);
			if (!site) {
				const error = `找不到站点 ${req.target}`;
				finishRuntime({ ok: false, error }, null, error);
				return await finish({
					ok: false,
					answer: "",
					error,
					partial: false,
				});
			}
			if (!site.enabled) {
				const error = `站点 ${site.label} 已被禁用，请在设置中启用后再调用`;
				finishRuntime({ ok: false, error }, null, error);
				return await finish({
					ok: false,
					answer: "",
					error,
					partial: false,
				});
			}
			const r = await getAiHubViewService().ask(site, prompt, {
				timeoutMs: req.timeoutMs ?? settings.bridgeWebTimeoutMs,
			});
			finishRuntime(r, null, r.answer || r.error || "");
			return await finish(r);
		}

		// app：本应用自己的 LLM 调用层
		const r = await invokeLlm(db, {
			model: options.model ?? "",
			prompt,
			temperature: 0.3,
		});
		const answer = r.content.trim();
		const appResult = {
			ok: Boolean(answer),
			answer,
			error: answer ? null : "本应用模型没有返回内容",
			partial: false,
		};
		finishRuntime(appResult, null, answer);
		return await finish(appResult);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn({
			msg: "桥接调用失败",
			target: req.target,
			kind,
			error: message,
		});
		finishRuntime({ ok: false, error: message }, null, message);
		return await finish({
			ok: false,
			answer: "",
			error: message,
			partial: false,
		});
	}
}

/** 超时默认值，供 UI 展示与设置面板回填。 */
export const BRIDGE_DEFAULT_TIMEOUTS = {
	cli: DEFAULT_CLI_TIMEOUT_MS,
	web: DEFAULT_WEB_TIMEOUT_MS,
	app: DEFAULT_APP_TIMEOUT_MS,
} as const;
