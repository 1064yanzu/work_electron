import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { app } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { Logger } from "../../logging/types";

function getHomeSkillsRootDir() {
	const home = app.getPath("home");
	return path.join(home, ".claude", "skills");
}

async function ensureDir(dir: string) {
	await fsp.mkdir(dir, { recursive: true });
}

/**
 * Claude Agent SDK 的 Skill tool 会扫描 cwd/.claude/skills（project settings）等目录。
 * 我们当前的技能库在 ~/.claude/skills（home）。为避免 SDK 执行 Skill 时提示“不可用”，
 * 在每次启动 agent 前，把 home skills 增量同步到 cwd/.claude/skills。
 */
async function syncSkillsToCwd(cwd: string, stderr: (msg: string) => void) {
	const srcRoot = getHomeSkillsRootDir();
	const destRoot = path.join(cwd, ".claude", "skills");

	try {
		await ensureDir(destRoot);
	} catch (e) {
		stderr(
			`[agent_sdk_start] Failed to ensure project skills dir: ${destRoot}. ${e instanceof Error ? e.message : String(e)}`,
		);
		return;
	}

	let entries: Array<import("node:fs").Dirent> = [];
	try {
		entries = await fsp.readdir(srcRoot, { withFileTypes: true });
	} catch {
		// 没有 home skills 目录就不做同步
		return;
	}

	for (const ent of entries) {
		if (!ent.isDirectory()) continue;
		const srcDir = path.join(srcRoot, ent.name);
		const destDir = path.join(destRoot, ent.name);
		try {
			await fsp.access(destDir);
			// 已存在则不覆盖，避免破坏 project 侧自定义
			continue;
		} catch {
			// dest 不存在 -> copy
		}

		try {
			await fsp.cp(srcDir, destDir, {
				recursive: true,
				dereference: true,
				errorOnExist: false,
			});
		} catch (e) {
			stderr(
				`[agent_sdk_start] Failed to sync skill '${ent.name}' to project skills dir. ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}
}

type AgentSdkStartInput = IPCSchema["agent_sdk_start"]["input"];
type AgentSdkStartOutput = IPCSchema["agent_sdk_start"]["output"];
type AgentSdkAbortInput = IPCSchema["agent_sdk_abort"]["input"];
type AgentSdkAbortOutput = IPCSchema["agent_sdk_abort"]["output"];

type AgentSdkEventPayload = {
	runId: string;
	type: string;
	message?: unknown;
	result?: unknown;
	error?: string;
	events?: unknown;
};

type GetMainWindow = () => BrowserWindow | null;

const running = new Map<
	string,
	{
		abortController: AbortController;
	}
>();

function emit(getMainWindow: GetMainWindow, payload: AgentSdkEventPayload) {
	const win = getMainWindow();
	if (!win) return;
	win.webContents.send("agent-sdk-event", payload);
}

function toUIEvents(message: any): any[] {
	const events: any[] = [];
	if (!message || typeof message !== "object") return events;

	if (message.type === "assistant" || message.type === "user") {
		const beta = message.message;
		const blocks = Array.isArray(beta?.content) ? beta.content : [];
		for (const b of blocks) {
			if (b?.type === "tool_result" && b?.tool_use_id) {
				events.push({
					type: "tool_call_end",
					id: String(b.tool_use_id),
					output: b.content,
					isError:
						Boolean(b.is_error) ||
						String(b.content ?? "").includes("<tool_use_error>"),
				});
			}
		}
	}

	if (message.type === "stream_event") {
		const ev = message.event;
		if (
			ev?.type === "content_block_delta" &&
			ev?.delta?.type === "text_delta" &&
			typeof ev.delta.text === "string"
		) {
			events.push({ type: "text_delta", content: ev.delta.text });
		}
		if (
			ev?.type === "content_block_start" &&
			ev?.content_block?.type === "tool_use"
		) {
			events.push({
				type: "tool_call_start",
				id: String(ev.content_block.id),
				name: String(ev.content_block.name),
				input:
					ev.content_block.input && typeof ev.content_block.input === "object"
						? ev.content_block.input
						: {},
			});
		}
		if (ev?.type === "message_start" && ev?.message?.id) {
			events.push({
				type: "session_init",
				sessionId: String(ev.message.id),
			});
		}
	}

	if (message.type === "result") {
		const isError =
			Boolean((message as any).is_error) || message.subtype !== "success";
		events.push({
			type: "result",
			subtype: message.subtype,
			isError,
			result:
				typeof (message as any).result === "string"
					? (message as any).result
					: "",
		});
	}
	return events;
}

export function createAgentSdkHandlers(options: {
	getMainWindow: GetMainWindow;
	anthropicBaseUrl: string;
	logger: Logger;
}) {
	const require = createRequire(import.meta.url);
	const logger = options.logger;
	const agent_sdk_start = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkStartInput,
	): Promise<AgentSdkStartOutput> => {
		const runId = randomUUID();
		const abortController = new AbortController();
		running.set(runId, { abortController });

		(async () => {
			try {
				const sdk = await import("@anthropic-ai/claude-agent-sdk");
				const stderr = (data: string) => {
					logger.info({
						msg: "agent_sdk stderr",
						scope: "agent",
						runId,
						data:
							typeof data === "string" ? data.slice(0, 20000) : String(data),
					});
					emit(options.getMainWindow, { runId, type: "stderr", error: data });
				};

				let pathToClaudeCodeExecutable: string | undefined;
				try {
					const p = require.resolve("@anthropic-ai/claude-agent-sdk/cli.js");
					if (fs.existsSync(p)) pathToClaudeCodeExecutable = p;
				} catch {}

				const cwd =
					input.cwd && input.cwd.trim() ? input.cwd.trim() : process.cwd();

				logger.info({
					msg: "agent_sdk start",
					scope: "agent",
					runId,
					cwd,
					model: input.model,
					pathToClaudeCodeExecutable,
					allowed_tools: input.allowed_tools,
					has_system_prompt: !!input.system_prompt,
				});

				// 检查 skills 目录
				const skillsDir = path.join(cwd, ".claude", "skills");
				try {
					const skillEntries = await fsp.readdir(skillsDir, {
						withFileTypes: true,
					});
					const skillNames = skillEntries
						.filter((e) => e.isDirectory() && !e.name.startsWith("."))
						.map((e) => e.name);
					logger.info({
						msg: "agent_sdk skills directory",
						scope: "agent",
						runId,
						skillsDir,
						skillNames,
					});
				} catch (e) {
					logger.info({
						msg: "agent_sdk skills directory not accessible",
						scope: "agent",
						runId,
						skillsDir,
						error: e instanceof Error ? e.message : String(e),
					});
				}

				// 让 SDK 的 Skill tool 能在 project settings（cwd/.claude/skills）里发现 skills
				await syncSkillsToCwd(cwd, stderr);

				const allowed = Array.isArray(input.allowed_tools)
					? input.allowed_tools
					: [];
				const permissionMode =
					typeof input.permission_mode === "string" &&
					input.permission_mode.trim()
						? input.permission_mode.trim()
						: "acceptEdits";

				// 注意: SDK Options 不直接支持 skills 参数
				// Skills 通过 system prompt 和 syncSkillsToCwd 来处理

				const q = sdk.query({
					prompt: String(input.prompt ?? ""),
					options: {
						abortController,
						cwd,
						model: String(input.model ?? ""),
						permissionMode: permissionMode as any,
						pathToClaudeCodeExecutable,
						// CRITICAL: settingSources 告诉 SDK 从文件系统加载 skills
						// 必须包含 "user" 和 "project" 才能加载 ~/.claude/skills 和 .claude/skills
						settingSources: ["user", "project"] as any,
						tools:
							allowed.length > 0
								? allowed
								: { type: "preset", preset: "claude_code" },
						env: {
							...process.env,
							ANTHROPIC_BASE_URL: options.anthropicBaseUrl,
							ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "sk-noop",
						},
						stderr,
						includePartialMessages: true,
						// systemPrompt: 如果用户提供了自定义 prompt,使用 preset + append 模式
						// 这样既保留 Claude Code 默认能力,又能添加自定义指令
						systemPrompt: input.system_prompt
							? {
									type: "preset" as const,
									preset: "claude_code" as const,
									append: input.system_prompt,
								}
							: { type: "preset" as const, preset: "claude_code" as const },
						canUseTool: async (
							toolName: string,
							toolInput: any,
							extra: any,
						) => {
							if (abortController.signal.aborted || extra?.signal?.aborted) {
								return {
									behavior: "deny",
									message: "aborted",
								};
							}
							if (allowed.length > 0 && !allowed.includes(toolName)) {
								return {
									behavior: "deny",
									message: `Tool disabled: ${toolName}`,
								};
							}
							// 按照官方文档格式,返回 allow 时需要传递 updatedInput
							return { behavior: "allow", updatedInput: toolInput };
						},
					},
				});

				for await (const msg of q) {
					emit(options.getMainWindow, {
						runId,
						type: "sdk_message",
						message: msg,
					});
					const uiEvents = toUIEvents(msg as any);
					if (uiEvents.length > 0) {
						emit(options.getMainWindow, {
							runId,
							type: "transformed",
							events: uiEvents,
						});
					}
					if ((msg as any)?.type === "result") {
						emit(options.getMainWindow, { runId, type: "done", result: msg });
					}
				}
			} catch (e) {
				const error = e instanceof Error ? e.message : String(e);
				logger.error({
					msg: "agent_sdk runner error",
					scope: "agent",
					runId,
					error,
				});
				emit(options.getMainWindow, { runId, type: "error", error });
			} finally {
				running.delete(runId);
			}
		})();

		return runId;
	};

	const agent_sdk_abort = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkAbortInput,
	): Promise<AgentSdkAbortOutput> => {
		const run = running.get(input.runId);
		if (run) {
			run.abortController.abort();
			running.delete(input.runId);
		}
		return { success: true };
	};

	return { agent_sdk_start, agent_sdk_abort };
}
