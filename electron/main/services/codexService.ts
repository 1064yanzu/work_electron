import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import type { CodexApprovalMode } from "../../shared/coding-workspace";
import { detectCliBinary, type DetectOptions } from "./cliBinaryDetector";

const execFileAsync = promisify(execFile);

/**
 * 异步检测 Codex CLI 二进制路径（跨平台）。
 * 内部委托给统一的 cliBinaryDetector 服务。
 */
export async function findCodexBinary(
	options?: DetectOptions,
): Promise<string | null> {
	const result = await detectCliBinary("codex", options);
	return result.path;
}

export async function getCodexVersion(binary?: string | null): Promise<string | null> {
	if (!binary) return null;
	try {
		const { stdout } = await execFileAsync(binary, ["--version"], {
			timeout: 10000,
			maxBuffer: 1024 * 1024,
		});
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

export interface CodexSessionOptions {
	prompt: string;
	cwd: string;
	model?: string;
	approvalMode?: CodexApprovalMode;
	resumeSessionId?: string;
	workspaceContext?: string;
}

export interface CodexOutputEvent {
	type:
		| "session_meta"
		| "reasoning"
		| "text_delta"
		| "tool_start"
		| "tool_end"
		| "tool_progress"
		| "turn_start"
		| "done"
		| "error"
		| "stderr";
	content?: string;
	sessionId?: string;
	itemId?: string;
	toolName?: string;
	toolInput?: Record<string, unknown>;
	toolOutput?: unknown;
	/** file_change 事件的文件变更列表 */
	fileChanges?: Array<{ path: string; kind: "add" | "delete" | "update" }>;
	/** file_change 的 patch 状态 */
	patchStatus?: "completed" | "failed";
	/** todo_list 事件的待办项 */
	todoItems?: Array<{ text: string; completed: boolean }>;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		cachedInputTokens?: number;
	};
	isError?: boolean;
}

type RawCodexEvent = {
	type: string;
	thread_id?: string;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cached_input_tokens?: number;
	};
	item?: {
		id?: string;
		type?: string;
		text?: string;
		command?: string;
		aggregated_output?: string;
		exit_code?: number | null;
		status?: string;
		// file_change 字段
		changes?: Array<{ path: string; kind: "add" | "delete" | "update" }>;
		// mcp_tool_call 字段
		server?: string;
		tool?: string;
		arguments?: unknown;
		result?: {
			content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
			structured_content?: unknown;
		};
		error?: { message: string };
		// web_search 字段
		query?: string;
		// todo_list 字段
		items?: Array<{ text: string; completed: boolean }>;
	};
	message?: string;
	error?: string;
};

function buildPrompt(prompt: string, workspaceContext?: string): string {
	const context = workspaceContext?.trim();
	if (!context) return prompt;
	return [
		"Repository instructions and workspace memory:",
		context,
		"",
		"User request:",
		prompt,
	].join("\n");
}

function buildApprovalArgs(approvalMode?: CodexApprovalMode): string[] {
	const mode = approvalMode ?? "on-request";
	const args = ["-c", `approval_policy="${mode}"`];
	if (mode === "never") {
		args.push("-c", 'sandbox_mode="danger-full-access"');
	} else {
		args.push("-c", 'sandbox_mode="workspace-write"');
	}
	return args;
}

function buildCodexArgs(options: CodexSessionOptions): string[] {
	const prompt = buildPrompt(options.prompt, options.workspaceContext);
	const baseArgs = ["--json", "--skip-git-repo-check"];
	const modelId = options.model?.trim();
	if (modelId) {
		baseArgs.push("-m", modelId);
	}
	baseArgs.push(...buildApprovalArgs(options.approvalMode));

	if (options.resumeSessionId) {
		return [
			"exec",
			"resume",
			...baseArgs,
			options.resumeSessionId,
			prompt,
		];
	}

	return ["exec", ...baseArgs, "--cd", options.cwd, prompt];
}

function parseRawEvent(line: string): RawCodexEvent | null {
	try {
		return JSON.parse(line) as RawCodexEvent;
	} catch {
		return null;
	}
}

function mapCodexEvent(raw: RawCodexEvent): CodexOutputEvent | null {
	switch (raw.type) {
		case "thread.started":
			return {
				type: "session_meta",
				sessionId: raw.thread_id,
			};

		case "turn.started":
			return { type: "turn_start" };

		case "turn.failed":
			return {
				type: "error",
				content: raw.error ?? raw.message ?? "Codex 回合执行失败",
				isError: true,
			};

		case "item.started": {
			const item = raw.item;
			if (!item) return null;

			if (item.type === "command_execution") {
				return {
					type: "tool_start",
					itemId: item.id,
					toolName: "Bash",
					toolInput: { command: item.command },
				};
			}
			if (item.type === "file_change") {
				return {
					type: "tool_start",
					itemId: item.id,
					toolName: "FileChange",
					toolInput: {},
				};
			}
			if (item.type === "mcp_tool_call") {
				const qualifiedName = item.server && item.tool
					? `${item.server}/${item.tool}`
					: item.tool ?? "MCPTool";
				return {
					type: "tool_start",
					itemId: item.id,
					toolName: qualifiedName,
					toolInput: typeof item.arguments === "object" && item.arguments !== null
						? item.arguments as Record<string, unknown>
						: {},
				};
			}
			return null;
		}

		case "item.updated": {
			const item = raw.item;
			if (!item?.id) return null;
			return {
				type: "tool_progress",
				itemId: item.id,
				toolName: item.type === "command_execution" ? "Bash"
					: item.type === "file_change" ? "FileChange"
					: item.type === "mcp_tool_call" ? (item.server && item.tool ? `${item.server}/${item.tool}` : "MCPTool")
					: item.type ?? "Unknown",
			};
		}

		case "item.completed": {
			const item = raw.item;
			if (!item) return null;

			if (item.type === "reasoning") {
				return {
					type: "reasoning",
					itemId: item.id,
					content: item.text,
				};
			}
			if (item.type === "agent_message") {
				return {
					type: "text_delta",
					itemId: item.id,
					content: item.text,
				};
			}
			if (item.type === "command_execution") {
				return {
					type: "tool_end",
					itemId: item.id,
					toolName: "Bash",
					toolOutput: {
						command: item.command,
						output: item.aggregated_output,
						exitCode: item.exit_code,
						status: item.status,
					},
					isError: typeof item.exit_code === "number" && item.exit_code !== 0,
				};
			}
			if (item.type === "file_change") {
				return {
					type: "tool_end",
					itemId: item.id,
					toolName: "FileChange",
					fileChanges: item.changes ?? [],
					patchStatus: (item.status as "completed" | "failed") ?? "completed",
					toolOutput: {
						changes: item.changes,
						status: item.status,
					},
					isError: item.status === "failed",
				};
			}
			if (item.type === "mcp_tool_call") {
				const qualifiedName = item.server && item.tool
					? `${item.server}/${item.tool}`
					: item.tool ?? "MCPTool";
				const resultText = item.result?.content
					?.filter((c) => c.type === "text" && c.text)
					.map((c) => c.text)
					.join("\n") ?? "";
				return {
					type: "tool_end",
					itemId: item.id,
					toolName: qualifiedName,
					toolOutput: item.error
						? { error: item.error.message }
						: { result: resultText || item.result?.structured_content },
					isError: !!item.error || item.status === "failed",
				};
			}
			if (item.type === "web_search") {
				return {
					type: "tool_end",
					itemId: item.id,
					toolName: "WebSearch",
					toolOutput: { query: item.query },
				};
			}
			if (item.type === "todo_list") {
				return {
					type: "tool_end",
					itemId: item.id,
					toolName: "TodoList",
					todoItems: item.items ?? [],
					toolOutput: { items: item.items },
				};
			}
			if (item.type === "error") {
				return {
					type: "error",
					itemId: item.id,
					content: item.text ?? "Codex 项目级错误",
					isError: true,
				};
			}
			return null;
		}

		case "turn.completed":
			return {
				type: "done",
				usage: raw.usage
					? {
						inputTokens: raw.usage.input_tokens ?? 0,
						outputTokens: raw.usage.output_tokens ?? 0,
						cachedInputTokens: raw.usage.cached_input_tokens ?? 0,
					}
					: undefined,
			};
		case "error":
			return {
				type: "error",
				content: raw.error ?? raw.message ?? "Codex 运行失败",
				isError: true,
			};
		default:
			return null;
	}
}

export function spawnCodexSession(
	binary: string,
	options: CodexSessionOptions,
	onEvent: (event: CodexOutputEvent) => void,
): ChildProcess {
	const args = buildCodexArgs(options);

	// 诊断日志：记录最终传给 CLI 的参数
	console.log(`[codex] spawn binary: ${binary}`);
	console.log(`[codex] spawn args: ${JSON.stringify(args)}`);
	console.log(`[codex] model param: ${options.model?.trim() || "(none - using CLI default)"}`);
	console.log(`[codex] cwd: ${options.cwd}`);
	console.log(`[codex] OPENAI_BASE_URL: ${process.env.OPENAI_BASE_URL || "(not set)"}`);
	console.log(`[codex] CODEX_API_KEY present: ${!!process.env.CODEX_API_KEY || !!process.env.OPENAI_API_KEY}`);

	const proc = spawn(binary, args, {
		cwd: options.cwd,
		env: {
			...process.env,
			TERM: "dumb",
			NO_COLOR: "1",
		},
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdoutBuffer = "";
	let stderrBuffer = "";
	let emittedDone = false;

	const flushStdout = (final = false) => {
		const lines = stdoutBuffer.split(/\r?\n/);
		stdoutBuffer = final ? "" : lines.pop() || "";
		for (const line of final ? lines.filter(Boolean) : lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const raw = parseRawEvent(trimmed);
			if (!raw) {
				onEvent({ type: "text_delta", content: trimmed });
				continue;
			}
			const mapped = mapCodexEvent(raw);
			if (mapped) {
				if (mapped.type === "done") emittedDone = true;
				onEvent(mapped);
			}
		}
	};

	proc.stdout?.on("data", (chunk: Buffer) => {
		stdoutBuffer += chunk.toString("utf-8");
		flushStdout(false);
	});

	proc.stderr?.on("data", (chunk: Buffer) => {
		stderrBuffer += chunk.toString("utf-8");
		const lines = stderrBuffer.split(/\r?\n/);
		stderrBuffer = lines.pop() || "";
		for (const line of lines) {
			const text = line.trim();
			if (!text) continue;
			// 检测模型不匹配：当 API 报告的模型与用户选择不同时给出诊断
			const modelMismatch = text.match(/(?:model|for model)\s+(\S+)/i);
			if (modelMismatch?.[1] && options.model?.trim() && modelMismatch[1] !== options.model.trim()) {
				console.warn(`[codex] 模型不匹配: 用户选择 "${options.model.trim()}" 但 CLI 请求 "${modelMismatch[1]}"`);
				onEvent({
					type: "stderr",
					content: `⚠ 模型不匹配: 您选择了 "${options.model.trim()}"，但 Codex CLI 实际请求了 "${modelMismatch[1]}"。请检查 Codex CLI 配置 (~/.codex/config.toml) 或 API 端点。`,
					isError: true,
				});
			}
			onEvent({ type: "stderr", content: text, isError: text.includes("ERROR") });
		}
	});

	proc.on("close", (code) => {
		flushStdout(true);
		if (stderrBuffer.trim()) {
			onEvent({ type: "stderr", content: stderrBuffer.trim() });
		}
		if (code !== 0) {
			onEvent({
				type: "error",
				content: `Codex 进程退出，代码: ${code}`,
				isError: true,
			});
			return;
		}
		if (!emittedDone) {
			onEvent({ type: "done" });
		}
	});

	proc.on("error", (error) => {
		onEvent({ type: "error", content: error.message, isError: true });
	});

	return proc;
}
