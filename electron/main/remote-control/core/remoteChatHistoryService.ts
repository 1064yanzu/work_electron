import { randomUUID } from "node:crypto";
import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import type { AgentSdkBusEvent } from "./agentSdkEventBus";
import type { RemoteChannelId } from "./types";
import { nowTs } from "./utils";

type PersistToolCallBlock = {
	type: "tool_call";
	taskId: string;
	toolCallId: string;
	toolType?: string;
	name?: string;
	status?: "pending" | "running" | "completed" | "error" | "cancelled";
	input?: Record<string, unknown>;
	output?: unknown;
	error?: string;
};

type PersistRunContext = {
	runId: string;
	agentSessionId: string;
	taskId: string;
	sandboxDir?: string;
	textParts: string[];
	toolOrder: string[];
	toolsById: Map<string, PersistToolCallBlock>;
	imagePaths: Set<string>;
};

function getChannelLabel(channelId: RemoteChannelId): string {
	const labels: Record<RemoteChannelId, string> = {
		feishu: "飞书",
		telegram: "Telegram",
		slack: "Slack",
		discord: "Discord",
		qqbot: "QQ Bot",
		wechat: "个人微信",
		generic_webhook: "Webhook",
	};
	return labels[channelId] ?? channelId;
}

function buildRemoteSessionTitle(
	channelId: RemoteChannelId,
	peerName?: string,
	peerId?: string,
): string {
	const channelLabel = getChannelLabel(channelId);
	const peerLabel = String(peerName || peerId || "未知来源").trim();
	return `远程 · ${channelLabel} · ${peerLabel}`;
}

function extractImagePathsFromOutput(output: unknown): string[] {
	if (!output || typeof output !== "object") return [];
	const imagePathsRaw = (output as { image_paths?: unknown }).image_paths;
	if (!Array.isArray(imagePathsRaw)) return [];
	return imagePathsRaw
		.map((item) => String(item || "").trim())
		.filter((item) => item.length > 0);
}

function extractTokenUsage(result?: Record<string, unknown>): {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
} | null {
	const usage = (result?.usage ?? null) as Record<string, unknown> | null;
	if (!usage || typeof usage !== "object") return null;
	const promptTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
	const completionTokens = Number(
		usage.output_tokens ?? usage.completion_tokens ?? 0,
	);
	const totalTokens = Number(
		usage.total_tokens ?? promptTokens + completionTokens,
	);
	if (
		!Number.isFinite(promptTokens) ||
		!Number.isFinite(completionTokens) ||
		!Number.isFinite(totalTokens)
	) {
		return null;
	}
	return {
		promptTokens: Math.max(0, Math.floor(promptTokens)),
		completionTokens: Math.max(0, Math.floor(completionTokens)),
		totalTokens: Math.max(0, Math.floor(totalTokens)),
	};
}

export class RemoteChatHistoryService {
	private readonly runContextById = new Map<string, PersistRunContext>();

	constructor(
		private readonly db: DbContext,
		private readonly logger: Logger,
	) {}

	private async createAgentSession(input: {
		title: string;
		channelId: RemoteChannelId;
		peerId: string;
		peerName?: string;
		remoteSessionId: string;
		taskId: string;
		sandboxDir?: string;
		prompt: string;
	}): Promise<string> {
		const sessionId = randomUUID();
		const now = nowTs();
		const configJson = JSON.stringify({
			source: "remote-control",
			channelId: input.channelId,
			peerId: input.peerId,
			peerName: input.peerName,
			remoteSessionId: input.remoteSessionId,
			taskId: input.taskId,
			sandboxDir: input.sandboxDir,
			prompt: input.prompt,
		});
		try {
			await this.db.client.execute({
				sql: `INSERT INTO agent_sessions (id, project_id, title, status, config_json, created_at, updated_at)
					VALUES (?, ?, ?, 'active', ?, ?, ?)`,
				args: [sessionId, null, input.title, configJson, now, now],
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!message.includes("no such column: project_id")) {
				throw error;
			}
			await this.db.client.execute({
				sql: `INSERT INTO agent_sessions (id, title, status, config_json, created_at, updated_at)
					VALUES (?, ?, 'active', ?, ?, ?)`,
				args: [sessionId, input.title, configJson, now, now],
			});
		}
		return sessionId;
	}

	private buildMessageContentJson(input: {
		id: string;
		role: "user" | "assistant";
		content: string;
		timestamp: number;
		metadata: Record<string, unknown>;
		blocks?: Array<Record<string, unknown>>;
	}): Record<string, unknown> {
		const blocks = Array.isArray(input.blocks)
			? input.blocks
			: [{ type: "text", text: input.content }];
		return {
			version: 1,
			chat_message: {
				id: input.id,
				role: input.role,
				content: input.content,
				timestamp: input.timestamp,
				metadata: input.metadata,
			},
			blocks,
		};
	}

	private async persistAgentMessage(input: {
		agentSessionId: string;
		taskId: string;
		role: "user" | "assistant";
		content: string;
		metadata: Record<string, unknown>;
		blocks?: Array<Record<string, unknown>>;
	}): Promise<void> {
		const now = nowTs();
		const messageId = randomUUID();
		const contentJson = this.buildMessageContentJson({
			id: messageId,
			role: input.role,
			content: input.content,
			timestamp: now,
			metadata: input.metadata,
			blocks: input.blocks,
		});
		await this.db.client.execute({
			sql: `INSERT INTO agent_messages (id, session_id, task_id, role, content_json, agent_session_id, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				messageId,
				input.agentSessionId,
				input.taskId,
				input.role,
				JSON.stringify(contentJson),
				input.agentSessionId,
				now,
				now,
			],
		});
		await this.db.client.execute({
			sql: `UPDATE agent_sessions SET updated_at = ? WHERE id = ?`,
			args: [now, input.agentSessionId],
		});
	}

	private buildBlocksForContext(
		ctx: PersistRunContext,
	): Array<Record<string, unknown>> {
		const blocks: Array<Record<string, unknown>> = [];
		for (const toolCallId of ctx.toolOrder) {
			const block = ctx.toolsById.get(toolCallId);
			if (block) blocks.push(block as unknown as Record<string, unknown>);
		}
		for (const path of ctx.imagePaths) {
			blocks.push({
				type: "image",
				path,
				title: "图片产物",
			});
		}
		return blocks;
	}

	async prepareRemoteChatRun(input: {
		channelId: RemoteChannelId;
		peerId: string;
		peerName?: string;
		remoteSessionId: string;
		taskId: string;
		prompt: string;
		sandboxDir?: string;
	}): Promise<{ agentSessionId: string; displayPrompt: string }> {
		const sessionTitle = buildRemoteSessionTitle(
			input.channelId,
			input.peerName,
			input.peerId,
		);
		const agentSessionId = await this.createAgentSession({
			title: sessionTitle,
			channelId: input.channelId,
			peerId: input.peerId,
			peerName: input.peerName,
			remoteSessionId: input.remoteSessionId,
			taskId: input.taskId,
			sandboxDir: input.sandboxDir,
			prompt: input.prompt,
		});
		const channelLabel = getChannelLabel(input.channelId);
		const peerDisplay = input.peerName || input.peerId || "未知来源";
		const displayPrompt = `[${channelLabel} · ${peerDisplay}] ${input.prompt}`;
		await this.persistAgentMessage({
			agentSessionId,
			taskId: input.taskId,
			role: "user",
			content: displayPrompt,
			metadata: {
				attachedFiles: [],
				taskId: input.taskId,
				sandboxDir: input.sandboxDir,
			},
			blocks: [{ type: "text", text: displayPrompt }],
		});
		return {
			agentSessionId,
			displayPrompt,
		};
	}

	registerRunContext(input: {
		runId: string;
		agentSessionId: string;
		taskId: string;
		sandboxDir?: string;
	}): void {
		this.runContextById.set(input.runId, {
			runId: input.runId,
			agentSessionId: input.agentSessionId,
			taskId: input.taskId,
			sandboxDir: input.sandboxDir,
			textParts: [],
			toolOrder: [],
			toolsById: new Map(),
			imagePaths: new Set(),
		});
	}

	async persistRunStartFailure(input: {
		agentSessionId: string;
		taskId: string;
		sandboxDir?: string;
		errorText: string;
	}): Promise<void> {
		await this.persistAgentMessage({
			agentSessionId: input.agentSessionId,
			taskId: input.taskId,
			role: "assistant",
			content: `❌ 远程任务出错: ${input.errorText}`,
			metadata: {
				taskId: input.taskId,
				sandboxDir: input.sandboxDir,
				blocks: [],
			},
			blocks: [{ type: "text", text: `❌ 远程任务出错: ${input.errorText}` }],
		});
	}

	private async handleTransformedEvent(
		ctx: PersistRunContext,
		eventsRaw: unknown,
	): Promise<void> {
		if (!Array.isArray(eventsRaw)) return;
		for (const eventItem of eventsRaw) {
			const eventType =
				typeof (eventItem as { type?: unknown })?.type === "string"
					? ((eventItem as { type: string }).type as string)
					: "";
			if (eventType === "text_delta") {
				const content = (eventItem as { content?: unknown })?.content;
				if (typeof content === "string") {
					ctx.textParts.push(content);
				}
				continue;
			}
			if (eventType === "tool_call_start") {
				const toolCallId = String(
					(eventItem as { id?: unknown })?.id ?? "",
				).trim();
				if (!toolCallId) continue;
				if (!ctx.toolsById.has(toolCallId)) {
					ctx.toolOrder.push(toolCallId);
				}
				const input =
					(eventItem as { input?: unknown })?.input &&
					typeof (eventItem as { input?: unknown }).input === "object"
						? ((eventItem as { input: Record<string, unknown> }).input ?? {})
						: {};
				ctx.toolsById.set(toolCallId, {
					type: "tool_call",
					taskId: ctx.taskId,
					toolCallId,
					toolType:
						typeof (eventItem as { name?: unknown })?.name === "string"
							? ((eventItem as { name: string }).name as string)
							: undefined,
					name:
						typeof (eventItem as { name?: unknown })?.name === "string"
							? ((eventItem as { name: string }).name as string)
							: undefined,
					status: "running",
					input,
				});
				continue;
			}
			if (eventType === "tool_input_complete") {
				const toolCallId = String(
					(eventItem as { id?: unknown })?.id ?? "",
				).trim();
				if (!toolCallId) continue;
				const current = ctx.toolsById.get(toolCallId);
				if (!current) continue;
				const input =
					(eventItem as { input?: unknown })?.input &&
					typeof (eventItem as { input?: unknown }).input === "object"
						? ((eventItem as { input: Record<string, unknown> }).input ?? {})
						: current.input || {};
				ctx.toolsById.set(toolCallId, {
					...current,
					input,
				});
				continue;
			}
			if (eventType === "tool_call_end") {
				const toolCallId = String(
					(eventItem as { id?: unknown })?.id ?? "",
				).trim();
				if (!toolCallId) continue;
				const current = ctx.toolsById.get(toolCallId);
				if (!current) continue;
				const isError = Boolean(
					(eventItem as { isError?: unknown })?.isError ?? false,
				);
				const output = (eventItem as { output?: unknown })?.output;
				ctx.toolsById.set(toolCallId, {
					...current,
					status: isError ? "error" : "completed",
					output,
					error: isError ? "工具调用失败" : undefined,
				});
				for (const path of extractImagePathsFromOutput(output)) {
					ctx.imagePaths.add(path);
				}
			}
		}
	}

	private async persistFinalAssistantMessage(input: {
		ctx: PersistRunContext;
		content: string;
		result?: Record<string, unknown>;
	}): Promise<void> {
		const blocks = this.buildBlocksForContext(input.ctx);
		const tokenUsage = extractTokenUsage(input.result);
		const metadata: Record<string, unknown> = {
			taskId: input.ctx.taskId,
			sandboxDir: input.ctx.sandboxDir,
			blocks,
		};
		if (tokenUsage) metadata.tokenUsage = tokenUsage;
		await this.persistAgentMessage({
			agentSessionId: input.ctx.agentSessionId,
			taskId: input.ctx.taskId,
			role: "assistant",
			content: input.content,
			metadata,
			blocks: [{ type: "text", text: input.content }, ...blocks],
		});
	}

	async handleAgentEvent(event: AgentSdkBusEvent): Promise<void> {
		const runId = String(event?.runId || "").trim();
		if (!runId) return;
		const ctx = this.runContextById.get(runId);
		if (!ctx) return;
		try {
			if (event.type === "transformed") {
				await this.handleTransformedEvent(ctx, event.events);
				return;
			}
			if (event.type === "done") {
				const result =
					event.result && typeof event.result === "object"
						? (event.result as Record<string, unknown>)
						: undefined;
				const resultText =
					typeof result?.result === "string" ? String(result.result) : "";
				const finalContent =
					ctx.textParts.join("") || resultText || "（远程任务已完成）";
				await this.persistFinalAssistantMessage({
					ctx,
					content: finalContent,
					result,
				});
				this.runContextById.delete(runId);
				return;
			}
			if (event.type === "error") {
				const errorText = String(event.error || "未知错误");
				const current = ctx.textParts.join("");
				const content = current
					? `${current}\n\n❌ 错误: ${errorText}`
					: `❌ 远程任务出错: ${errorText}`;
				await this.persistFinalAssistantMessage({
					ctx,
					content,
				});
				this.runContextById.delete(runId);
			}
		} catch (error) {
			this.logger.error({
				msg: "remote chat history persist failed",
				runId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
