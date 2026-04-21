/**
 * 把「新 SDK 接口 ChannelPlugin」和「旧接口 RemoteChannelPlugin」互相适配。
 *
 * 背景：
 * - 旧接口：`core/channel-plugin.ts` 里的 `RemoteChannelPlugin`，只有 start/stop/send/testConnection
 * - 新接口：`sdk/channel-contract.ts` 里的 `ChannelPlugin`，有完整 lifecycle/actions/streaming/typing/...
 *
 * 迁移策略：
 * 1. 新渠道直接实现 ChannelPlugin
 * 2. 老渠道先用 adaptLegacyChannel() 包一层，保证现有 orchestrator 能统一调度
 * 3. 逐个渠道迁移到新接口后删除 adapter
 */

import type {
	RemoteChannelPlugin,
	RemoteChannelContext,
} from "../core/channel-plugin";
import type {
	RemoteChannelId,
	RemoteInboundMessage,
	RemoteOutboundMessage,
} from "../core/types";
import type {
	ChannelInboundAttachment,
	ChannelInboundMessage,
} from "./channel-inbound";
import type { ChannelOutboundMessage } from "./channel-outbound";
import type { ChannelPlugin, ChannelCapabilities } from "./channel-contract";
import type { ChannelRuntimeContext } from "./channel-runtime-context";

// ─── 旧 → 新：ChannelInboundMessage -> RemoteInboundMessage ─────────────────

export function sdkInboundToLegacy(
	inbound: ChannelInboundMessage,
): RemoteInboundMessage {
	return {
		channel_id: inbound.channel,
		peer_id: inbound.peerId,
		peer_name: inbound.peerName,
		sender_id: inbound.senderId,
		sender_name: inbound.senderName,
		is_group: inbound.isGroup,
		text: inbound.text,
		message_id: inbound.messageId,
		reply_to_message_id: inbound.replyToMessageId,
		target_id: inbound.targetId,
		raw: inbound.raw,
		context_files: inbound.contextFiles,
	};
}

// ─── 新 → 旧：RemoteOutboundMessage -> ChannelOutboundMessage ──────────────

export function legacyOutboundToSdk(
	message: RemoteOutboundMessage,
): ChannelOutboundMessage {
	const isCard = !!message.use_card;
	return {
		channel: message.channel_id,
		targetId: message.target_id,
		replyToMessageId: message.reply_to_message_id,
		kind: isCard ? "card" : "text",
		text: isCard ? undefined : message.text,
		cardJson: isCard ? message.text : undefined,
	};
}

// ─── 旧渠道 → 新接口的包装适配器 ────────────────────────────────────────────

const BASIC_CAPABILITIES: ChannelCapabilities = {
	text: true,
	card: false,
	streaming: false,
	typing: false,
	interactive: false,
	editMessage: false,
	deleteMessage: false,
	reactions: false,
	pin: false,
	media: false,
};

/**
 * 把旧的 RemoteChannelPlugin 适配成新的 ChannelPlugin。
 * 仅提供最基本的 start/stop/send 能力，其他能力声明为「不支持」。
 */
export function adaptLegacyChannel(
	legacy: RemoteChannelPlugin,
	overrides?: Partial<ChannelCapabilities>,
): ChannelPlugin {
	const capabilities: ChannelCapabilities = {
		...BASIC_CAPABILITIES,
		// 默认认为所有旧渠道都支持文本
		text: true,
		...overrides,
	};

	const id: RemoteChannelId = legacy.id;

	return {
		id,
		getCapabilities: () => capabilities,
		lifecycle: {
			start: async (ctx: ChannelRuntimeContext) => {
				const legacyCtx: RemoteChannelContext = {
					config: ctx.config,
					onInboundMessage: async (msg) => {
						// 把 legacy inbound 转为 SDK inbound 再投递
						const sdk: ChannelInboundMessage = {
							kind: "message",
							channel: msg.channel_id,
							peerId: msg.peer_id,
							peerName: msg.peer_name,
							senderId: msg.sender_id,
							senderName: msg.sender_name,
							isGroup: msg.is_group,
							targetId: msg.target_id,
							messageId: msg.message_id,
							replyToMessageId: msg.reply_to_message_id,
							text: msg.text,
							contextFiles: msg.context_files,
							raw: msg.raw,
							attachments: msg.context_files
								? msg.context_files.map(
										(f): ChannelInboundAttachment => ({
											kind: "file",
											sourceRef: f.source,
											fileName: f.suggested_name,
											mimeType: f.metadata?.mime_type,
										}),
									)
								: undefined,
						};
						await ctx.onInboundMessage(sdk);
					},
					onStatusPatch: ctx.onStatusPatch,
				};
				await legacy.start(legacyCtx);
			},
			stop: () => legacy.stop(),
			probe: async () => {
				const result = await legacy.testConnection();
				return {
					ok: result.ok,
					message: result.message,
				};
			},
		},
		actions: {
			send: async (message) => {
				// SDK outbound 回退为 legacy outbound
				const legacyMsg: RemoteOutboundMessage = {
					channel_id: message.channel,
					target_id: message.targetId,
					text:
						message.kind === "card"
							? (message.cardJson ?? "")
							: (message.text ?? ""),
					reply_to_message_id: message.replyToMessageId,
					use_card: message.kind === "card",
				};
				await legacy.send(legacyMsg);
				return {};
			},
		},
		streaming: null,
		typing: null,
	};
}
