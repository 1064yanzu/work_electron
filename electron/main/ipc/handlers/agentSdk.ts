import { randomUUID } from "node:crypto";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";

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
}) {
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
					emit(options.getMainWindow, { runId, type: "stderr", error: data });
				};

				const cwd =
					input.cwd && input.cwd.trim() ? input.cwd.trim() : process.cwd();
				const allowed = Array.isArray(input.allowed_tools)
					? input.allowed_tools
					: [];
				const permissionMode =
					typeof input.permission_mode === "string" &&
					input.permission_mode.trim()
						? input.permission_mode.trim()
						: "acceptEdits";

				const q = sdk.query({
					prompt: String(input.prompt ?? ""),
					options: {
						abortController,
						cwd,
						model: String(input.model ?? ""),
						permissionMode: permissionMode as any,
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
						systemPrompt: input.system_prompt,
						canUseTool: async (
							toolName: string,
							_toolInput: any,
							extra: any,
						) => {
							if (abortController.signal.aborted || extra?.signal?.aborted) {
								return {
									behavior: "deny",
									message: "aborted",
									interrupt: true,
								};
							}
							if (allowed.length > 0 && !allowed.includes(toolName)) {
								return {
									behavior: "deny",
									message: `Tool disabled: ${toolName}`,
									interrupt: false,
								};
							}
							return { behavior: "allow" };
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
