/**
 * ChannelPluginSDK 公共导出
 *
 * 使用方式：
 * ```ts
 * import {
 *   type ChannelPlugin,
 *   type ChannelCapabilities,
 *   createSequentialQueue,
 *   getChannelDedupe,
 *   mergeStreamingText,
 * } from "../sdk";
 * ```
 */

// Contracts
export type {
	ChannelPlugin,
	ChannelCapabilities,
} from "./channel-contract";
export { isChannelPlugin } from "./channel-contract";

// Lifecycle
export type {
	ChannelLifecycle,
	ChannelProbeResult,
} from "./channel-lifecycle";

// Runtime context
export type { ChannelRuntimeContext } from "./channel-runtime-context";

// Inbound / Outbound
export type {
	ChannelInboundMessage,
	ChannelInboundKind,
	ChannelInboundAttachment,
	ChannelInboundInteractive,
} from "./channel-inbound";
export type {
	ChannelOutboundMessage,
	ChannelOutboundKind,
	ChannelOutboundAttachment,
	ChannelOutboundResult,
} from "./channel-outbound";

// Actions
export type { ChannelActions } from "./channel-actions";
export { ChannelActionUnsupportedError } from "./channel-actions";

// Streaming
export type {
	ChannelStreamingSession,
	ChannelStreamingFactory,
	ChannelStreamingStartOptions,
} from "./channel-streaming";
export { mergeStreamingText } from "./streaming-merge";
export { truncateSummary } from "./streaming-merge";

// Typing
export type {
	ChannelTypingSession,
	ChannelTypingFactory,
} from "./channel-typing";
export { startTypingKeepalive } from "./channel-typing";

// Interactive
export type {
	ChannelInteractiveComponent,
	ChannelInteractiveComponents,
	ChannelInteractiveRow,
	ChannelInteractiveButton,
	ChannelInteractiveSelect,
	ChannelInteractiveLink,
	ChannelInteractiveButtonStyle,
} from "./channel-interactive";
export {
	buildApprovalButtons,
	parseApprovalCallback,
} from "./channel-interactive";

// Directory
export type {
	ChannelDirectoryAdapter,
	ChannelDirectoryEntry,
} from "./channel-directory";

// Conversation
export type {
	ConversationRef,
	ConversationBinding,
} from "./channel-conversation";
export {
	buildConversationKey,
	makeConversationRef,
} from "./channel-conversation";

// Utilities
export {
	createSequentialQueue,
	type SequentialQueue,
} from "./channel-sequential-queue";
export {
	getChannelDedupe,
	flushAllChannelDedupe,
	type ChannelDedupe,
} from "./channel-dedupe";

// Legacy adapter（迁移完成后可删除）
export {
	adaptLegacyChannel,
	sdkInboundToLegacy,
	legacyOutboundToSdk,
} from "./channel-legacy-adapter";
