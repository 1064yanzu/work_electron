import type { BrowserWindow } from "electron";
import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import {
	AgentSdkExecutor,
	type AgentSdkHandlersLike,
} from "./agentSdkExecutor";
import { AgentEventMirror } from "./agentEventMirror";
import type { AgentSdkBusEvent } from "./agentSdkEventBus";
import { subscribeAgentSdkBusEvent } from "./agentSdkEventBus";
import type { RemoteChannelPlugin } from "./channel-plugin";
import {
	type ChannelCapabilityEntry,
	listChannelCapabilityEntries,
} from "./channelCapabilityRegistry";
import { RemoteCommandRouter } from "./commandRouter";
import type {
	RemoteChannelId,
	RemoteChannelRuntimeStatus,
	RemoteControlConfig,
	RemoteOutboundMessage,
	RemoteRuntimeStatus,
} from "./types";
import { RemoteControlConfigStore } from "../store/configStore";
import { RemotePairingStore } from "../store/pairingStore";
import { RemoteSessionStore } from "../store/sessionStore";
import { PairingService } from "./pairingService";
import { PtyBridgeService } from "./ptyBridge/ptyBridgeService";
import { SlidingWindowRateLimiter } from "./rateLimiter";
import { nowTs } from "./utils";
import { RemoteChatHistoryService } from "./remoteChatHistoryService";

const DEFAULT_MODEL = "gpt-4o";
const MAX_EVENT_LOGS = 200;

export type RemoteEventLog = {
	timestamp: number;
	level: "info" | "warn" | "error";
	source: string;
	message: string;
};

/**
 * 渠道插件懒加载工厂：只有该渠道真正需要启动/使用时才 `await import()`
 * 对应实现模块，避免冷启动加载 lark / discord.js / grammy / @slack/bolt
 * 等重型 SDK。
 */
type RemoteChannelPluginFactory = () => Promise<RemoteChannelPlugin>;

function createChannelPluginFactories(
	logger: Logger,
): Map<RemoteChannelId, RemoteChannelPluginFactory> {
	const factories = new Map<RemoteChannelId, RemoteChannelPluginFactory>();
	factories.set("feishu", async () => {
		const { FeishuChannelPlugin } = await import(
			"../channels/feishu/feishuChannel"
		);
		return new FeishuChannelPlugin(logger);
	});
	factories.set("telegram", async () => {
		const { TelegramChannelPlugin } = await import(
			"../channels/telegram/telegramChannel"
		);
		return new TelegramChannelPlugin(logger);
	});
	factories.set("slack", async () => {
		const { SlackChannelPlugin } = await import(
			"../channels/slack/slackChannel"
		);
		return new SlackChannelPlugin(logger);
	});
	factories.set("discord", async () => {
		const { DiscordChannelPlugin } = await import(
			"../channels/discord/discordChannel"
		);
		return new DiscordChannelPlugin(logger);
	});
	factories.set("qqbot", async () => {
		const { QqbotChannelPlugin } = await import(
			"../channels/qqbot/qqbotChannel"
		);
		return new QqbotChannelPlugin(logger);
	});
	factories.set("wechat", async () => {
		const { WechatChannelPlugin } = await import(
			"../channels/wechat/wechatChannel"
		);
		return new WechatChannelPlugin(logger);
	});
	factories.set("generic_webhook", async () => {
		const { PlaceholderChannelPlugin } = await import(
			"../channels/template/placeholderChannel"
		);
		return new PlaceholderChannelPlugin(
			"generic_webhook",
			logger,
			"模板通道，后续接入通用 Webhook",
		);
	});
	return factories;
}

export class RemoteControlOrchestrator {
	private readonly configStore: RemoteControlConfigStore;
	private readonly pairingStore: RemotePairingStore;
	private readonly sessionStore = new RemoteSessionStore();
	private readonly pairingService: PairingService;
	private readonly executor = new AgentSdkExecutor();
	private readonly rateLimiter = new SlidingWindowRateLimiter();
	private readonly channelFactories: Map<
		RemoteChannelId,
		RemoteChannelPluginFactory
	>;
	/** 已实际加载并实例化的渠道插件（懒加载后缓存） */
	private readonly channels = new Map<RemoteChannelId, RemoteChannelPlugin>();
	private readonly channelLoadPromises = new Map<
		RemoteChannelId,
		Promise<RemoteChannelPlugin>
	>();
	private readonly channelStatus = new Map<
		RemoteChannelId,
		RemoteChannelRuntimeStatus
	>();
	private readonly eventMirror: AgentEventMirror;
	private readonly remoteChatHistory: RemoteChatHistoryService;
	private readonly ptyBridge: PtyBridgeService;
	private readonly eventLogs: RemoteEventLog[] = [];
	private config: RemoteControlConfig | null = null;
	private startedAt: number | null = null;
	private unsubscribeAgentBus: (() => void) | null = null;
	private mainWindow: BrowserWindow | null = null;

	private readonly router: RemoteCommandRouter;
	private pendingPairingCount = 0;

	constructor(
		private readonly db: DbContext,
		private readonly logger: Logger,
	) {
		this.configStore = new RemoteControlConfigStore(db);
		this.pairingStore = new RemotePairingStore(db);
		this.pairingService = new PairingService(this.pairingStore);
		this.remoteChatHistory = new RemoteChatHistoryService(db, logger);

		this.channelFactories = createChannelPluginFactories(logger);

		for (const channelId of this.channelFactories.keys()) {
			this.channelStatus.set(channelId, {
				channel_id: channelId,
				enabled: false,
				running: false,
				connected: false,
			});
		}

		this.router = new RemoteCommandRouter({
			logger,
			executor: this.executor,
			pairingService: this.pairingService,
			sessionStore: this.sessionStore,
			getConfig: () => this.requireConfig(),
			getRuntimeStatus: () => this.getRuntimeStatus(),
			getActiveModel: () => this.getActiveModel(),
			getMainWindow: () => this.mainWindow,
			remoteChatHistory: this.remoteChatHistory,
			sendMessage: async (message) => {
				await this.sendToChannel(message);
			},
		});
		this.eventMirror = new AgentEventMirror({
			sessionStore: this.sessionStore,
			router: this.router,
			sendToChannel: async (message) => {
				await this.sendToChannel(message);
			},
			resolveChannelCapabilities: (channelId) => {
				const plugin = this.channels.get(channelId);
				return {
					streaming:
						plugin?.streaming && plugin.streaming.isEnabled()
							? (params) => plugin.streaming!.openSession(params)
							: null,
					typing:
						plugin?.typing && plugin.typing.isEnabled()
							? (params) => plugin.typing!.openSession(params)
							: null,
				};
			},
		});
		this.ptyBridge = new PtyBridgeService({
			logger,
			getConfig: () => this.requireConfig(),
			resolveChannelStreaming: (channelId) => {
				const plugin = this.channels.get(channelId);
				if (!plugin?.streaming) return null;
				return plugin.streaming.isEnabled() ? plugin.streaming : null;
			},
			resolveChannelFileTransfer: (channelId) => {
				const plugin = this.channels.get(channelId);
				if (!plugin?.fileTransfer) return null;
				return plugin.fileTransfer.isEnabled() ? plugin.fileTransfer : null;
			},
			sendMessage: async (message) => {
				await this.sendToChannel(message);
			},
			appendEventLog: (level, source, message) => {
				this.appendEventLog(level, source, message);
			},
			getMainWindow: () => this.mainWindow,
		});
	}

	bindAgentSdkHandlers(handlers: AgentSdkHandlersLike): void {
		this.executor.bindHandlers(handlers);
	}

	setMainWindow(win: BrowserWindow | null): void {
		this.mainWindow = win;
	}

	private requireConfig(): RemoteControlConfig {
		if (!this.config) {
			throw new Error("Remote control config not initialized");
		}
		return this.config;
	}

	private async getActiveModel(): Promise<string> {
		const rows = await this.db.client.execute({
			sql: "SELECT value FROM app_config WHERE key = 'active_model'",
			args: [],
		});
		const model = rows.rows[0]?.value;
		if (typeof model === "string" && model.trim()) return model;
		return DEFAULT_MODEL;
	}

	/**
	 * 懒加载并缓存渠道插件实例。
	 * 首次调用时才动态 import 对应 channel 模块（及其 SDK），后续复用同一实例，
	 * 保证 stop/重启拿到的是同一个插件对象。
	 */
	private async ensureChannel(
		channelId: RemoteChannelId,
	): Promise<RemoteChannelPlugin> {
		const loaded = this.channels.get(channelId);
		if (loaded) return loaded;
		const pending = this.channelLoadPromises.get(channelId);
		if (pending) return pending;
		const factory = this.channelFactories.get(channelId);
		if (!factory) {
			throw new Error(`Unsupported channel: ${channelId}`);
		}
		const loading = factory()
			.then((plugin) => {
				this.channels.set(channelId, plugin);
				return plugin;
			})
			.finally(() => {
				this.channelLoadPromises.delete(channelId);
			});
		this.channelLoadPromises.set(channelId, loading);
		return loading;
	}

	private async startEnabledChannels(): Promise<void> {
		const config = this.requireConfig();
		for (const channelId of this.channelFactories.keys()) {
			const channelConfig = config.channels[channelId];
			const enabled = config.enabled && channelConfig?.enabled;
			if (!enabled) {
				// 未启用：只对已加载的实例做 stop，从未加载的渠道保持零加载
				const loadedChannel = this.channels.get(channelId);
				if (loadedChannel) {
					await loadedChannel.stop();
				}
				this.patchChannelStatus(channelId, {
					enabled: false,
					running: false,
					connected: false,
					mode: undefined,
					last_error: undefined,
				});
				continue;
			}
			try {
				const channel = await this.ensureChannel(channelId);
				await channel.start({
					config,
					onInboundMessage: async (message) => {
						await this.handleInboundMessage(message);
					},
					onStatusPatch: (patch) => {
						this.patchChannelStatus(channelId, patch);
					},
				});
				this.patchChannelStatus(channelId, {
					enabled: true,
					running: true,
				});
				this.appendEventLog("info", channelId, `频道已启动`);
			} catch (error) {
				this.patchChannelStatus(channelId, {
					enabled: true,
					running: false,
					connected: false,
					last_error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	private async refreshPendingPairingCount(): Promise<void> {
		try {
			const pending = await this.pairingService.listPending();
			this.pendingPairingCount = pending.length;
		} catch {
			this.pendingPairingCount = 0;
		}
	}

	private async stopAllChannels(): Promise<void> {
		// 等待仍在加载中的渠道完成，避免 stop 期间实例悬空
		for (const [channelId, loading] of this.channelLoadPromises.entries()) {
			try {
				await loading;
			} catch (error) {
				this.logger.warn({
					msg: "remote channel lazy load failed during stop",
					channel: channelId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		// 只 stop 已加载的实例；未加载渠道本来就没有运行
		for (const [channelId, channel] of this.channels.entries()) {
			try {
				await channel.stop();
			} catch (error) {
				this.logger.warn({
					msg: "remote channel stop failed",
					channel: channelId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		for (const channelId of this.channelFactories.keys()) {
			this.patchChannelStatus(channelId, {
				running: false,
				connected: false,
			});
		}
	}

	private patchChannelStatus(
		channelId: RemoteChannelId,
		patch: Partial<Omit<RemoteChannelRuntimeStatus, "channel_id">>,
	): void {
		const current = this.channelStatus.get(channelId);
		if (!current) return;
		this.channelStatus.set(channelId, {
			...current,
			...patch,
		});
	}

	private async handleInboundMessage(message: {
		channel_id: RemoteChannelId;
		peer_id: string;
		peer_name?: string;
		sender_id?: string;
		sender_name?: string;
		is_group: boolean;
		text: string;
		message_id?: string;
		reply_to_message_id?: string;
		target_id: string;
		raw?: unknown;
	}): Promise<void> {
		const config = this.requireConfig();
		const channelCfg = config.channels[message.channel_id];
		const limit =
			"rateLimitPerMinute" in channelCfg
				? (channelCfg as { rateLimitPerMinute: number }).rateLimitPerMinute
				: 20;
		const key = `${message.channel_id}:${message.peer_id}`;
		if (!this.rateLimiter.allow(key, limit)) {
			await this.sendToChannel({
				channel_id: message.channel_id,
				target_id: message.target_id,
				reply_to_message_id: message.message_id,
				text: "请求过于频繁，请稍后再试。",
			});
			return;
		}
		const handledByPty = await this.ptyBridge.tryHandle(message);
		if (handledByPty) return;
		await this.router.handleInbound(message);
	}

	private appendEventLog(
		level: RemoteEventLog["level"],
		source: string,
		message: string,
	): void {
		this.eventLogs.push({
			timestamp: nowTs(),
			level,
			source,
			message,
		});
		if (this.eventLogs.length > MAX_EVENT_LOGS) {
			this.eventLogs.splice(0, this.eventLogs.length - MAX_EVENT_LOGS);
		}
	}

	private resolveChunkLimit(channelId: RemoteChannelId): number {
		const config = this.requireConfig();
		const channelCfg = config.channels[channelId];
		if ("textChunkLimit" in channelCfg) {
			return Math.max(
				300,
				(channelCfg as { textChunkLimit: number }).textChunkLimit,
			);
		}
		return 1500;
	}

	private splitText(text: string, limit: number): string[] {
		const input = String(text || "");
		if (input.length <= limit) return [input];
		const chunks: string[] = [];
		let cursor = 0;
		while (cursor < input.length) {
			chunks.push(input.slice(cursor, cursor + limit));
			cursor += limit;
		}
		return chunks;
	}

	async sendToChannel(message: RemoteOutboundMessage): Promise<void> {
		if (!this.channelFactories.has(message.channel_id)) {
			throw new Error(`Unsupported channel: ${message.channel_id}`);
		}
		const plugin = await this.ensureChannel(message.channel_id);
		if (message.use_card) {
			await plugin.send(message);
			return;
		}
		const limit = this.resolveChunkLimit(message.channel_id);
		for (const chunk of this.splitText(message.text, limit)) {
			await plugin.send({ ...message, text: chunk });
		}
	}

	private async handleAgentEvent(event: AgentSdkBusEvent): Promise<void> {
		const results = await Promise.allSettled([
			this.eventMirror.handle(event),
			this.remoteChatHistory.handleAgentEvent(event),
		]);
		const [mirrorResult, historyResult] = results;
		if (mirrorResult.status === "rejected") {
			const message =
				mirrorResult.reason instanceof Error
					? mirrorResult.reason.message
					: String(mirrorResult.reason);
			this.logger.error({
				msg: "remote agent event mirror failed",
				error: message,
			});
			this.appendEventLog("error", "agent-event", `事件镜像失败: ${message}`);
		}
		if (historyResult.status === "rejected") {
			const message =
				historyResult.reason instanceof Error
					? historyResult.reason.message
					: String(historyResult.reason);
			this.logger.error({
				msg: "remote chat history persist failed",
				error: message,
			});
			this.appendEventLog("error", "agent-history", `历史落库失败: ${message}`);
		}
	}

	async start(): Promise<void> {
		this.config = await this.configStore.load();
		this.startedAt = nowTs();
		await this.startEnabledChannels();
		await this.refreshPendingPairingCount();
		if (!this.unsubscribeAgentBus) {
			this.unsubscribeAgentBus = subscribeAgentSdkBusEvent((event) => {
				void this.handleAgentEvent(event);
			});
		}
	}

	async stop(): Promise<void> {
		await this.ptyBridge.stopAll("远程控制服务停止");
		await this.stopAllChannels();
		if (this.unsubscribeAgentBus) {
			this.unsubscribeAgentBus();
			this.unsubscribeAgentBus = null;
		}
		this.startedAt = null;
	}

	getConfig(): RemoteControlConfig {
		return this.requireConfig();
	}

	async setConfig(next: RemoteControlConfig): Promise<void> {
		const prevTerminalEnabled = this.config?.terminal?.enabled ?? false;
		await this.configStore.save(next);
		this.config = next;
		await this.stopAllChannels();
		await this.startEnabledChannels();
		if (prevTerminalEnabled && !next.terminal.enabled) {
			await this.ptyBridge.stopAll("终端开关已关闭");
		}
	}

	getRuntimeStatus(): RemoteRuntimeStatus {
		return {
			enabled: this.config?.enabled ?? false,
			started_at: this.startedAt ?? undefined,
			channels: [...this.channelStatus.values()],
			active_runs: this.sessionStore
				.list(999)
				.filter(
					(session) =>
						session.state === "running" ||
						session.state === "waiting_interaction",
				).length,
			pending_pairings: this.pendingPairingCount,
		};
	}

	async listChannels(): Promise<RemoteChannelRuntimeStatus[]> {
		return [...this.channelStatus.values()];
	}

	listChannelCapabilities(): ChannelCapabilityEntry[] {
		return listChannelCapabilityEntries();
	}

	listSessions(limit = 50) {
		return this.sessionStore.list(limit);
	}

	listEventLogs(limit = 50): RemoteEventLog[] {
		return this.eventLogs.slice(-limit);
	}

	async terminateSession(runId: string): Promise<boolean> {
		const success = await this.executor.abort(runId);
		if (success) {
			this.sessionStore.updateStateByRun(runId, "aborted");
			this.sessionStore.removeByRunId(runId);
		}
		return success;
	}

	async listPendingPairings() {
		const list = await this.pairingService.listPending();
		this.pendingPairingCount = list.length;
		return list;
	}

	async listPairingRecords() {
		return this.pairingService.listRecords();
	}

	async approvePairing(requestId: string, approvedBy = "settings") {
		const result = await this.pairingService.approve(requestId, approvedBy);
		await this.refreshPendingPairingCount();
		return result;
	}

	async rejectPairing(requestId: string, reason?: string) {
		const result = await this.pairingService.reject(requestId, reason);
		await this.refreshPendingPairingCount();
		return result;
	}

	async revokePairing(
		channelId: RemoteChannelId,
		peerId: string,
		reason?: string,
	) {
		const result = await this.pairingService.revoke(channelId, peerId, reason);
		await this.refreshPendingPairingCount();
		return result;
	}

	async testChannel(
		channelId: RemoteChannelId,
	): Promise<{ ok: boolean; message: string }> {
		if (!this.channelFactories.has(channelId)) {
			return { ok: false, message: `未知通道：${channelId}` };
		}
		try {
			const channel = await this.ensureChannel(channelId);
			return channel.testConnection();
		} catch (error) {
			return {
				ok: false,
				message: `通道模块加载失败：${
					error instanceof Error ? error.message : String(error)
				}`,
			};
		}
	}

	listTerminalSessions() {
		return this.ptyBridge.listSessions();
	}

	async terminateTerminalSession(sessionId: string): Promise<boolean> {
		return this.ptyBridge.terminateSessionById(sessionId);
	}
}
