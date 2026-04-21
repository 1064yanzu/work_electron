import type { AgentSdkBusEvent } from "./agentSdkEventBus";
import type { RemoteChannelId, RemoteOutboundMessage } from "./types";
import type { RemoteSessionStore } from "../store/sessionStore";
import type { RemoteCommandRouter } from "./commandRouter";
import type { ChannelStreamingSession, ChannelTypingSession } from "../sdk";
import { mergeStreamingText } from "../sdk";
import { clampString, nowTs } from "./utils";

type StreamBuffer = {
	text: string;
	lastFlushAt: number;
};

type OutboundFingerprint = {
	fingerprint: string;
	timestamp: number;
};

/**
 * 每个 agent run 对应的流式态：
 * - 有 streamingSession: 走 SDK 流式卡片（飞书），文本从 deltas 拼起来流式推送
 * - 无 streamingSession: 走老路径 chunk 发送
 */
type RunStreamingState = {
	session: ChannelStreamingSession;
	accumulated: string;
	typing?: ChannelTypingSession;
};

function normalizeOutboundText(text: string): string {
	return String(text || "")
		.replace(/\r\n/g, "\n")
		.replace(/\s+/g, " ")
		.trim();
}

export type AgentEventMirrorDeps = {
	sessionStore: RemoteSessionStore;
	router: RemoteCommandRouter;
	sendToChannel: (message: RemoteOutboundMessage) => Promise<void>;
	/**
	 * 渠道能力解析 —— orchestrator 注入。
	 * 返回某渠道的 streaming / typing 工厂（不支持时为 null）。
	 */
	resolveChannelCapabilities?: (channelId: RemoteChannelId) => {
		streaming:
			| ((params: {
					targetId: string;
					threadId?: string;
					replyToMessageId?: string;
			  }) => ChannelStreamingSession)
			| null;
		typing:
			| ((params: {
					targetId: string;
					anchorMessageId?: string;
			  }) => ChannelTypingSession)
			| null;
		activeModelNote?: () => string | undefined;
	};
};

export class AgentEventMirror {
	private readonly streamBufferByRun = new Map<string, StreamBuffer>();
	private readonly lastOutboundByRun = new Map<string, OutboundFingerprint>();
	private readonly streamingByRun = new Map<string, RunStreamingState>();

	constructor(private readonly deps: AgentEventMirrorDeps) {}

	/**
	 * 给定 runId：如有 streaming 支持则开启 streaming session（同时尝试开启 typing）。
	 * 没有支持则返回 null，继续走老路径 chunk 发送。
	 */
	private async ensureStreaming(
		runId: string,
		firstUserMessageId?: string,
	): Promise<RunStreamingState | null> {
		const existing = this.streamingByRun.get(runId);
		if (existing) return existing;
		if (!this.deps.resolveChannelCapabilities) return null;
		const session = this.deps.sessionStore.getByRunId(runId);
		if (!session) return null;
		const caps = this.deps.resolveChannelCapabilities(session.channel_id);
		if (!caps.streaming) return null;
		try {
			const streamingSession = caps.streaming({
				targetId: session.target_id,
				replyToMessageId: firstUserMessageId,
			});
			await streamingSession.start({ title: "AI 助手" });
			let typingSession: ChannelTypingSession | undefined;
			if (caps.typing && firstUserMessageId) {
				try {
					typingSession = caps.typing({
						targetId: session.target_id,
						anchorMessageId: firstUserMessageId,
					});
					await typingSession.start();
				} catch {
					typingSession = undefined;
				}
			}
			const state: RunStreamingState = {
				session: streamingSession,
				accumulated: "",
				typing: typingSession,
			};
			this.streamingByRun.set(runId, state);
			return state;
		} catch (error) {
			// streaming 启动失败就彻底 fallback 到 chunk 老路径
			// 不抛出，不影响 agent 运行
			this.deps.sessionStore.getByRunId(runId);
			void error;
			return null;
		}
	}

	private async closeStreaming(
		runId: string,
		finalText?: string,
		note?: string,
	): Promise<void> {
		const state = this.streamingByRun.get(runId);
		if (!state) return;
		this.streamingByRun.delete(runId);
		try {
			await state.session.close(finalText, note ? { note } : undefined);
		} catch {
			// 关闭失败静默
		}
		if (state.typing) {
			try {
				await state.typing.stop();
			} catch {
				// typing 清理静默
			}
		}
	}

	private flushBuffer(runId: string): string {
		const buffer = this.streamBufferByRun.get(runId);
		if (!buffer || !buffer.text) return "";
		const text = buffer.text;
		this.streamBufferByRun.set(runId, {
			text: "",
			lastFlushAt: nowTs(),
		});
		return text;
	}

	private appendBuffer(runId: string, delta: string): string | null {
		const current = this.streamBufferByRun.get(runId) ?? {
			text: "",
			lastFlushAt: nowTs(),
		};
		current.text += delta;
		// 飞书 API 限制约 5 条/秒，增大 flush 阈值以降低 API 压力
		const shouldFlush =
			current.text.length >= 400 ||
			delta.includes("\n") ||
			nowTs() - current.lastFlushAt >= 2000;
		if (shouldFlush) {
			const text = current.text;
			this.streamBufferByRun.set(runId, {
				text: "",
				lastFlushAt: nowTs(),
			});
			return text;
		}
		this.streamBufferByRun.set(runId, current);
		return null;
	}

	private async sendRunMessage(runId: string, text: string): Promise<void> {
		const session = this.deps.sessionStore.getByRunId(runId);
		if (!session || !text.trim()) return;
		const normalized = normalizeOutboundText(text);
		if (!normalized) return;
		const prev = this.lastOutboundByRun.get(runId);
		const now = nowTs();
		if (
			prev &&
			prev.fingerprint === normalized &&
			now - prev.timestamp < 20_000
		) {
			return;
		}
		this.lastOutboundByRun.set(runId, {
			fingerprint: normalized,
			timestamp: now,
		});
		await this.deps.sendToChannel({
			channel_id: session.channel_id,
			target_id: session.target_id,
			text,
		});
		this.deps.sessionStore.update(session.session_id, {
			last_message_at: nowTs(),
		});
	}

	async handle(event: AgentSdkBusEvent): Promise<void> {
		const runId = event.runId;
		if (!runId) return;
		if (event.type === "interaction_request" && event.request) {
			const session = this.deps.sessionStore.getByRunId(runId);
			if (!session) return;
			this.deps.sessionStore.updateStateByRun(runId, "waiting_interaction");
			this.deps.router.bindInteraction({
				run_id: runId,
				request_id: event.request.requestId,
				channel_id: session.channel_id,
				peer_id: session.peer_id,
				created_at: nowTs(),
			});

			// 判断是否为飞书渠道,使用交互卡片
			if (session.channel_id === "feishu") {
				try {
					// 动态导入飞书卡片构建器
					const { buildInteractionApprovalCard } = await import(
						"../channels/feishu/feishuCardBuilder"
					);
					const cardJson = buildInteractionApprovalCard({
						requestId: event.request.requestId,
						toolName: event.request.toolName,
						toolInput: event.request.toolInput as
							| Record<string, unknown>
							| undefined,
					});

					// 发送交互卡片
					await this.deps.sendToChannel({
						channel_id: session.channel_id,
						target_id: session.target_id,
						text: cardJson,
						// 标记为卡片消息
						use_card: true,
					});
				} catch (error) {
					await this.sendRunMessage(
						runId,
						[
							"收到交互审批请求:",
							`requestId=${event.request.requestId}`,
							`tool=${event.request.toolName}`,
							"飞书卡片发送失败，已降级为命令审批：",
							`/approve ${event.request.requestId}`,
							`/reject ${event.request.requestId} <reason>`,
						].join("\n"),
					);
					await this.sendRunMessage(
						runId,
						`[warn] 卡片发送失败: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			} else {
				// 非飞书渠道使用纯文本
				await this.sendRunMessage(
					runId,
					[
						"收到交互审批请求:",
						`requestId=${event.request.requestId}`,
						`tool=${event.request.toolName}`,
						"可用命令:",
						`/approve ${event.request.requestId}`,
						`/reject ${event.request.requestId} <reason>`,
					].join("\n"),
				);
			}
			return;
		}

		// 处理工具调用事件
		if (event.type === "transformed" && Array.isArray(event.events)) {
			for (const item of event.events as Array<Record<string, unknown>>) {
				// 工具开始调用
				if (item.type === "tool_use" && typeof item.name === "string") {
					const toolName = item.name;
					const inputPreview = item.input
						? clampString(JSON.stringify(item.input), 200)
						: "";
					await this.sendRunMessage(
						runId,
						`🔧 调用工具: ${toolName}${inputPreview ? `\n参数: ${inputPreview}` : ""}`,
					);
					continue;
				}
				// 工具结果
				if (
					item.type === "tool_result" &&
					typeof item.tool_use_id === "string"
				) {
					const resultPreview =
						typeof item.content === "string"
							? clampString(item.content, 300)
							: "";
					if (resultPreview) {
						await this.sendRunMessage(runId, `📋 工具结果: ${resultPreview}`);
					}
					continue;
				}
			}
		}

		if (event.type === "transformed" && Array.isArray(event.events)) {
			const deltas: string[] = [];
			for (const item of event.events as Array<Record<string, unknown>>) {
				if (item.type === "text_delta" && typeof item.content === "string") {
					deltas.push(item.content);
				}
				if (item.type === "thought_delta" && typeof item.content === "string") {
					deltas.push(`\n[thinking] ${item.content}`);
				}
			}
			if (deltas.length > 0) {
				this.deps.sessionStore.updateStateByRun(runId, "running");

				// 优先尝试 streaming session（飞书等支持 streaming 的渠道）
				const streaming = await this.ensureStreaming(runId);

				if (streaming) {
					// 边生成边 update 同一张卡片
					for (const delta of deltas) {
						streaming.accumulated = mergeStreamingText(
							streaming.accumulated,
							streaming.accumulated + delta,
						);
						await streaming.session.update(streaming.accumulated);
					}
				} else {
					// 老路径：chunk 拼接后分段发送
					for (const delta of deltas) {
						const flushed = this.appendBuffer(runId, delta);
						if (flushed) {
							await this.sendRunMessage(runId, flushed);
						}
					}
				}
			}
			return;
		}

		if (event.type === "done") {
			const streaming = this.streamingByRun.get(runId);
			const tail = this.flushBuffer(runId);
			const resultText =
				typeof (event.result as Record<string, unknown> | undefined)?.result ===
				"string"
					? ((event.result as Record<string, unknown>).result as string)
					: "";

			if (streaming) {
				// streaming 路径：把最终文本喂给 close 做一次收尾
				const finalText = resultText.trim()
					? clampString(resultText, 4000)
					: streaming.accumulated || tail;
				await this.closeStreaming(runId, finalText, undefined);
			} else if (resultText.trim()) {
				await this.sendRunMessage(runId, clampString(resultText, 2000));
			} else if (tail) {
				// 没有result但有buffer内容,发送buffer
				await this.sendRunMessage(runId, tail);
			}

			this.deps.sessionStore.updateStateByRun(runId, "completed");
			this.deps.sessionStore.removeByRunId(runId);
			this.lastOutboundByRun.delete(runId);
			return;
		}

		if (event.type === "error") {
			const streaming = this.streamingByRun.get(runId);
			const tail = this.flushBuffer(runId);
			if (tail && !streaming) {
				await this.sendRunMessage(runId, tail);
			}
			const errorText = event.error || "Unknown error";
			if (streaming) {
				await this.closeStreaming(
					runId,
					`${streaming.accumulated}\n\n[error] ${errorText}`,
					undefined,
				);
			} else {
				await this.sendRunMessage(runId, `\n[error] ${errorText}`);
			}
			this.deps.sessionStore.updateStateByRun(runId, "error", errorText);
			this.deps.sessionStore.removeByRunId(runId);
			this.lastOutboundByRun.delete(runId);
		}
	}
}
