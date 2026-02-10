import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import { FeishuChannelPlugin } from "../channels/feishu/feishuChannel";
import { PlaceholderChannelPlugin } from "../channels/template/placeholderChannel";
import {
	AgentSdkExecutor,
	type AgentSdkHandlersLike,
} from "./agentSdkExecutor";
import { AgentEventMirror } from "./agentEventMirror";
import type { AgentSdkBusEvent } from "./agentSdkEventBus";
import { subscribeAgentSdkBusEvent } from "./agentSdkEventBus";
import type { RemoteChannelPlugin } from "./channel-plugin";
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
import { SlidingWindowRateLimiter } from "./rateLimiter";
import { nowTs } from "./utils";

const DEFAULT_MODEL = "gpt-4o";

export class RemoteControlOrchestrator {
	private readonly configStore: RemoteControlConfigStore;
	private readonly pairingStore: RemotePairingStore;
	private readonly sessionStore = new RemoteSessionStore();
	private readonly pairingService: PairingService;
	private readonly executor = new AgentSdkExecutor();
	private readonly rateLimiter = new SlidingWindowRateLimiter();
	private readonly channels = new Map<RemoteChannelId, RemoteChannelPlugin>();
	private readonly channelStatus = new Map<
		RemoteChannelId,
		RemoteChannelRuntimeStatus
	>();
	private readonly eventMirror: AgentEventMirror;
	private config: RemoteControlConfig | null = null;
	private startedAt: number | null = null;
	private unsubscribeAgentBus: (() => void) | null = null;

	private readonly router: RemoteCommandRouter;
	private pendingPairingCount = 0;

	constructor(
		private readonly db: DbContext,
		private readonly logger: Logger,
	) {
		this.configStore = new RemoteControlConfigStore(db);
		this.pairingStore = new RemotePairingStore(db);
		this.pairingService = new PairingService(this.pairingStore);

		this.channels.set("feishu", new FeishuChannelPlugin(logger));
		this.channels.set(
			"telegram",
			new PlaceholderChannelPlugin("telegram", logger),
		);
		this.channels.set("slack", new PlaceholderChannelPlugin("slack", logger));
		this.channels.set(
			"generic_webhook",
			new PlaceholderChannelPlugin("generic_webhook", logger),
		);

		for (const channelId of this.channels.keys()) {
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
		});
	}

	bindAgentSdkHandlers(handlers: AgentSdkHandlersLike): void {
		this.executor.bindHandlers(handlers);
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

	private async startEnabledChannels(): Promise<void> {
		const config = this.requireConfig();
		for (const [channelId, channel] of this.channels.entries()) {
			const enabled =
				config.enabled &&
				(channelId === "feishu"
					? config.channels.feishu.enabled
					: config.channels[channelId].enabled);
			if (!enabled) {
				await channel.stop();
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
		const limit =
			message.channel_id === "feishu"
				? config.channels.feishu.rateLimitPerMinute
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
		await this.router.handleInbound(message);
	}

	private resolveChunkLimit(channelId: RemoteChannelId): number {
		const config = this.requireConfig();
		if (channelId === "feishu") {
			return Math.max(300, config.channels.feishu.textChunkLimit);
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
		const plugin = this.channels.get(message.channel_id);
		if (!plugin) {
			throw new Error(`Unsupported channel: ${message.channel_id}`);
		}
		const limit = this.resolveChunkLimit(message.channel_id);
		for (const chunk of this.splitText(message.text, limit)) {
			await plugin.send({ ...message, text: chunk });
		}
	}

	private async handleAgentEvent(event: AgentSdkBusEvent): Promise<void> {
		await this.eventMirror.handle(event);
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
		await this.configStore.save(next);
		this.config = next;
		await this.stopAllChannels();
		await this.startEnabledChannels();
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

	listSessions(limit = 50) {
		return this.sessionStore.list(limit);
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
		const channel = this.channels.get(channelId);
		if (!channel) return { ok: false, message: `未知通道：${channelId}` };
		return channel.testConnection();
	}
}
