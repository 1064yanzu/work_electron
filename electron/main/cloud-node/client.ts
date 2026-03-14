import os from "node:os";
import WebSocket from "ws";
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import {
	AgentSdkExecutor,
	type AgentSdkHandlersLike,
} from "../remote-control/core/agentSdkExecutor";
import type { AgentSdkBusEvent } from "../remote-control/core/agentSdkEventBus";
import { subscribeAgentSdkBusEvent } from "../remote-control/core/agentSdkEventBus";
import { CloudNodeConfigStore } from "./configStore";
import { DEFAULT_CLOUD_NODE_CONFIG } from "./defaults";
import { DesktopJobExecutor } from "./desktopJobExecutor";
import { MigrationPullExecutor } from "./migrationPullExecutor";
import type {
	CloudNodeBindInput,
	CloudNodeBindResult,
	CloudNodeConfig,
	CloudNodeIncomingMessage,
	CloudNodeRuntimeStatus,
} from "./types";

type RunContext = {
	runId: string;
	sessionId: string;
	requestId: string;
};

function sanitizeRelayUrl(input: string): string {
	return String(input || "")
		.trim()
		.replace(/\/$/, "");
}

function toWsUrl(relayUrl: string): string {
	const url = new URL(sanitizeRelayUrl(relayUrl));
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	return url.toString().replace(/\/$/, "");
}

function toHttpUrl(relayUrl: string): string {
	const url = new URL(sanitizeRelayUrl(relayUrl));
	url.protocol = url.protocol === "wss:" ? "https:" : "http:";
	return url.toString().replace(/\/$/, "");
}

function parseIncoming(raw: string): CloudNodeIncomingMessage | null {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") return null;
		return parsed as CloudNodeIncomingMessage;
	} catch {
		return null;
	}
}

export class CloudNodeClient {
	private readonly configStore: CloudNodeConfigStore;
	private readonly executor = new AgentSdkExecutor();
	private readonly jobExecutor: DesktopJobExecutor;
	private readonly migrationExecutor: MigrationPullExecutor;
	private readonly runContextByRunId = new Map<string, RunContext>();
	private config: CloudNodeConfig = structuredClone(DEFAULT_CLOUD_NODE_CONFIG);
	private ws: WebSocket | null = null;
	private started = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private unsubscribeAgentBus: (() => void) | null = null;
	private reconnectAttempts = 0;
	private status: CloudNodeRuntimeStatus = {
		enabled: false,
		configured: false,
		connected: false,
		relayUrl: DEFAULT_CLOUD_NODE_CONFIG.relayUrl,
		nodeName: DEFAULT_CLOUD_NODE_CONFIG.nodeName,
		heartbeatSec: DEFAULT_CLOUD_NODE_CONFIG.heartbeatSec,
		routingMode: DEFAULT_CLOUD_NODE_CONFIG.routingMode,
		pendingRuns: 0,
	};

	constructor(
		private readonly db: DbContext,
		private readonly logger: Logger,
	) {
		this.configStore = new CloudNodeConfigStore(db);
		this.jobExecutor = new DesktopJobExecutor(db);
		this.migrationExecutor = new MigrationPullExecutor(db);
	}

	bindAgentSdkHandlers(handlers: AgentSdkHandlersLike): void {
		this.executor.bindHandlers(handlers);
	}

	private patchStatus(next: Partial<CloudNodeRuntimeStatus>): void {
		this.status = {
			...this.status,
			...next,
			pendingRuns: this.runContextByRunId.size,
		};
	}

	private refreshStatusByConfig(): void {
		const configured =
			Boolean(this.config.relayUrl.trim()) &&
			Boolean(this.config.nodeId?.trim()) &&
			Boolean(this.config.nodeToken?.trim());
		this.patchStatus({
			enabled: this.config.enabled,
			configured,
			relayUrl: this.config.relayUrl,
			nodeId: this.config.nodeId || undefined,
			nodeName: this.config.nodeName,
			heartbeatSec: this.config.heartbeatSec,
			routingMode: this.config.routingMode,
		});
	}

	private clearReconnectTimer(): void {
		if (!this.reconnectTimer) return;
		clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
	}

	private clearHeartbeatTimer(): void {
		if (!this.heartbeatTimer) return;
		clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = null;
	}

	private closeSocket(): void {
		this.clearHeartbeatTimer();
		if (!this.ws) return;
		try {
			this.ws.removeAllListeners();
			this.ws.close();
		} catch {
			// noop
		}
		this.ws = null;
		this.patchStatus({ connected: false });
	}

	private scheduleReconnect(): void {
		if (!this.started || !this.config.enabled) return;
		this.clearReconnectTimer();
		const delay = Math.min(
			30000,
			1000 * 2 ** Math.min(this.reconnectAttempts, 6),
		);
		this.reconnectTimer = setTimeout(() => {
			void this.connect();
		}, delay);
	}

	private send(message: Record<string, unknown>): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(JSON.stringify(message));
	}

	private startHeartbeat(): void {
		this.clearHeartbeatTimer();
		this.heartbeatTimer = setInterval(() => {
			this.send({ type: "node.heartbeat", ts: Date.now() });
			this.patchStatus({ lastHeartbeatAt: Date.now() });
		}, Math.max(5, this.config.heartbeatSec) * 1000);
	}

	private async resolveActiveModel(): Promise<string> {
		const rows = await this.db.client.execute({
			sql: "SELECT value FROM app_config WHERE key = 'active_model'",
			args: [],
		});
		const model = rows.rows[0]?.value;
		if (typeof model === "string" && model.trim()) return model;
		return "gpt-4o";
	}

	private async handleRunStart(
		message: Extract<CloudNodeIncomingMessage, { type: "node.run.start" }>,
	): Promise<void> {
		const requestId = String(message.request_id || "").trim();
		const sessionId = String(message.session_id || "").trim();
		const prompt = String(message.payload?.prompt || "").trim();
		if (!requestId || !sessionId || !prompt) {
			this.send({
				type: "node.run.rejected",
				request_id: requestId,
				session_id: sessionId,
				error: "invalid run.start payload",
			});
			return;
		}
		if (!this.executor.ready) {
			this.send({
				type: "node.run.rejected",
				request_id: requestId,
				session_id: sessionId,
				error: "desktop agent executor not ready",
			});
			return;
		}

		try {
			const model =
				typeof message.payload?.model === "string" &&
				message.payload.model.trim()
					? message.payload.model.trim()
					: await this.resolveActiveModel();
			const cwd =
				typeof message.payload?.cwd === "string" && message.payload.cwd.trim()
					? message.payload.cwd.trim()
					: process.cwd();
			const runId = await this.executor.start({
				prompt,
				model,
				cwd,
				interactive_approval: true,
				persist_session: true,
			});
			this.runContextByRunId.set(runId, {
				runId,
				sessionId,
				requestId,
			});
			this.patchStatus({ pendingRuns: this.runContextByRunId.size });
			this.send({
				type: "node.run.accepted",
				request_id: requestId,
				session_id: sessionId,
				run_id: runId,
			});
		} catch (error) {
			const text = error instanceof Error ? error.message : String(error);
			this.send({
				type: "node.run.rejected",
				request_id: requestId,
				session_id: sessionId,
				error: text,
			});
		}
	}

	private async handleRunAbort(
		message: Extract<CloudNodeIncomingMessage, { type: "node.run.abort" }>,
	): Promise<void> {
		const runId = String(message.run_id || "").trim();
		const requestId = String(message.request_id || "").trim();
		if (!runId || !requestId) return;
		const success = await this.executor.abort(runId);
		if (success) {
			this.runContextByRunId.delete(runId);
			this.patchStatus({ pendingRuns: this.runContextByRunId.size });
		}
		this.send({
			type: "node.run.aborted",
			request_id: requestId,
			run_id: runId,
			success,
		});
	}

	private async handleInteractionResolve(
		message: Extract<
			CloudNodeIncomingMessage,
			{ type: "node.interaction.resolve" }
		>,
	): Promise<void> {
		const runId = String(message.run_id || "").trim();
		const requestId = String(message.request_id || "").trim();
		const interactionRequestId = String(
			message.interaction_request_id || "",
		).trim();
		if (!runId || !requestId || !interactionRequestId) return;
		const success = await this.executor.resolveInteraction({
			runId,
			requestId: interactionRequestId,
			decision: {
				behavior: message.decision.behavior,
				message: message.decision.message,
				interrupt: message.decision.interrupt,
			},
		});
		this.send({
			type: "node.interaction.resolved",
			request_id: requestId,
			run_id: runId,
			interaction_request_id: interactionRequestId,
			success,
		});
	}

	private async handleIncoming(raw: WebSocket.RawData): Promise<void> {
		const text = typeof raw === "string" ? raw : raw.toString("utf-8");
		const message = parseIncoming(text);
		if (!message) return;
		switch (message.type) {
			case "ping":
				this.send({ type: "pong", ts: message.ts || Date.now() });
				return;
			case "node.run.start":
				await this.handleRunStart(message);
				return;
			case "node.run.abort":
				await this.handleRunAbort(message);
				return;
			case "node.interaction.resolve":
				await this.handleInteractionResolve(message);
				return;
			case "node.config.apply":
				await this.handleConfigApply(message);
				return;
			case "node.backup.start":
				await this.handleBackupStart(message);
				return;
			case "node.backup.restore":
				await this.handleBackupRestore(message);
				return;
			case "node.migration.pull":
				await this.handleMigrationPull(message);
				return;
			default:
				return;
		}
	}

	private async handleConfigApply(
		message: Extract<CloudNodeIncomingMessage, { type: "node.config.apply" }>,
	): Promise<void> {
		const result = await this.jobExecutor.applyConfig({
			scope: message.payload.scope,
			data: message.payload.data || {},
		});
		if (result.success) {
			if (message.payload.scope === "cloud.node") {
				const latest = await this.configStore.load();
				this.config = latest;
				this.refreshStatusByConfig();
			}
			this.send({
				type: "node.config.applied",
				request_id: message.request_id,
				job_id: message.job_id,
				success: true,
				applied_at: Date.now(),
			});
			await this.reportCapabilities();
			return;
		}
		this.send({
			type: "node.config.applied",
			request_id: message.request_id,
			job_id: message.job_id,
			success: false,
			error_code: result.error_code,
			error_message: result.error_message,
			applied_at: Date.now(),
		});
	}

	private async handleBackupStart(
		message: Extract<CloudNodeIncomingMessage, { type: "node.backup.start" }>,
	): Promise<void> {
		this.send({
			type: "node.backup.progress",
			request_id: message.request_id,
			job_id: message.job_id,
			progress: 20,
			message: "正在导出本地数据",
			ts: Date.now(),
		});
		const result = await this.jobExecutor.startBackup();
		if (result.success) {
			this.send({
				type: "node.backup.progress",
				request_id: message.request_id,
				job_id: message.job_id,
				progress: 100,
				message: "备份完成",
				ts: Date.now(),
			});
			this.send({
				type: "node.backup.done",
				request_id: message.request_id,
				job_id: message.job_id,
				success: true,
				backup_id: result.result.backup_id,
				ts: Date.now(),
			});
			return;
		}
		this.send({
			type: "node.backup.done",
			request_id: message.request_id,
			job_id: message.job_id,
			success: false,
			error_code: result.error_code,
			error_message: result.error_message,
			ts: Date.now(),
		});
	}

	private async handleBackupRestore(
		message: Extract<CloudNodeIncomingMessage, { type: "node.backup.restore" }>,
	): Promise<void> {
		this.send({
			type: "node.backup.progress",
			request_id: message.request_id,
			job_id: message.job_id,
			progress: 20,
			message: "正在准备恢复",
			ts: Date.now(),
		});
		const result = await this.jobExecutor.restoreBackup({
			backupId: message.payload.backup_id,
		});
		if (result.success) {
			this.send({
				type: "node.backup.progress",
				request_id: message.request_id,
				job_id: message.job_id,
				progress: 100,
				message: "恢复完成",
				ts: Date.now(),
			});
			this.send({
				type: "node.backup.done",
				request_id: message.request_id,
				job_id: message.job_id,
				success: true,
				backup_id: result.result.backup_id,
				ts: Date.now(),
			});
			return;
		}
		this.send({
			type: "node.backup.done",
			request_id: message.request_id,
			job_id: message.job_id,
			success: false,
			error_code: result.error_code,
			error_message: result.error_message,
			ts: Date.now(),
		});
	}

	private async handleMigrationPull(
		message: Extract<CloudNodeIncomingMessage, { type: "node.migration.pull" }>,
	): Promise<void> {
		try {
			this.send({
				type: "node.migration.progress",
				request_id: message.request_id,
				job_id: message.job_id,
				migration_id: message.migration_id,
				progress: 5,
				ts: Date.now(),
			});

			const result = await this.migrationExecutor.execute({
				scope: message.payload.scope,
				sessionId: message.payload.session_id,
				onChunk: async (chunk) => {
					this.send({
						type: "node.migration.chunk",
						request_id: message.request_id,
						job_id: message.job_id,
						migration_id: message.migration_id,
						seq: chunk.seq,
						data: chunk.data,
						ts: Date.now(),
					});
					this.send({
						type: "node.migration.progress",
						request_id: message.request_id,
						job_id: message.job_id,
						migration_id: message.migration_id,
						progress: chunk.progress,
						ts: Date.now(),
					});
				},
			});

			this.send({
				type: "node.migration.done",
				request_id: message.request_id,
				job_id: message.job_id,
				migration_id: message.migration_id,
				success: true,
				ts: Date.now(),
				result: {
					chunks: result.chunks,
					records: result.records,
				},
			});
		} catch (error) {
			const err = error as Error & { code?: "NOT_FOUND" | "VALIDATION_FAILED" };
			this.send({
				type: "node.migration.done",
				request_id: message.request_id,
				job_id: message.job_id,
				migration_id: message.migration_id,
				success: false,
				error_code: err.code || "CAPABILITY_NOT_AVAILABLE",
				error_message: err.message || "迁移执行失败",
				ts: Date.now(),
			});
		}
	}

	private async reportCapabilities(): Promise<void> {
		this.send({
			type: "node.capabilities.report",
			node_id: this.config.nodeId,
			version: "desktop-node-v2",
			capabilities: this.jobExecutor.getCapabilities(),
			ts: Date.now(),
		});
	}

	private forwardAgentEvent(event: AgentSdkBusEvent): void {
		const runId = String(event.runId || "").trim();
		if (!runId) return;
		const context = this.runContextByRunId.get(runId);
		if (!context) return;
		this.send({
			type: "node.stream.event",
			session_id: context.sessionId,
			run_id: runId,
			event,
		});
		if (event.type === "done" || event.type === "error") {
			this.runContextByRunId.delete(runId);
			this.patchStatus({ pendingRuns: this.runContextByRunId.size });
		}
	}

	private get configured(): boolean {
		return (
			Boolean(this.config.relayUrl.trim()) &&
			Boolean(this.config.nodeId?.trim()) &&
			Boolean(this.config.nodeToken?.trim())
		);
	}

	private async connect(): Promise<void> {
		this.clearReconnectTimer();
		if (!this.started || !this.config.enabled) return;
		if (!this.configured) {
			this.patchStatus({
				connected: false,
				lastError: "云节点未绑定，请先完成绑定。",
			});
			return;
		}

		try {
			const base = toWsUrl(this.config.relayUrl);
			const url = new URL(`${base}/ws/node`);
			url.searchParams.set("node_id", this.config.nodeId || "");
			url.searchParams.set("node_token", this.config.nodeToken || "");

			const ws = new WebSocket(url.toString());
			this.ws = ws;

			ws.on("open", () => {
				this.reconnectAttempts = 0;
				this.logger.info({
					msg: "cloud node connected",
					relay: this.config.relayUrl,
					nodeId: this.config.nodeId,
				});
				this.patchStatus({
					connected: true,
					lastConnectedAt: Date.now(),
					lastError: undefined,
				});
				this.send({
					type: "node.hello",
					node_id: this.config.nodeId,
					node_name: this.config.nodeName,
					hostname: os.hostname(),
					capabilities: this.jobExecutor.getCapabilities(),
				});
				void this.reportCapabilities();
				this.startHeartbeat();
			});

			ws.on("message", (payload) => {
				void this.handleIncoming(payload);
			});

			ws.on("close", () => {
				this.logger.warn({
					msg: "cloud node disconnected",
					relay: this.config.relayUrl,
					nodeId: this.config.nodeId,
				});
				this.patchStatus({ connected: false });
				this.clearHeartbeatTimer();
				this.reconnectAttempts += 1;
				this.scheduleReconnect();
			});

			ws.on("error", (error) => {
				this.logger.error({
					msg: "cloud node socket error",
					error: error instanceof Error ? error.message : String(error),
				});
				this.patchStatus({
					connected: false,
					lastError: error instanceof Error ? error.message : String(error),
				});
			});
		} catch (error) {
			this.logger.error({
				msg: "cloud node connect failed",
				error: error instanceof Error ? error.message : String(error),
			});
			this.patchStatus({
				connected: false,
				lastError: error instanceof Error ? error.message : String(error),
			});
			this.reconnectAttempts += 1;
			this.scheduleReconnect();
		}
	}

	async start(): Promise<void> {
		this.started = true;
		this.config = await this.configStore.load();
		this.refreshStatusByConfig();
		if (!this.unsubscribeAgentBus) {
			this.unsubscribeAgentBus = subscribeAgentSdkBusEvent((event) => {
				this.forwardAgentEvent(event);
			});
		}
		if (this.config.enabled) {
			await this.connect();
		}
	}

	async stop(): Promise<void> {
		this.started = false;
		this.clearReconnectTimer();
		this.closeSocket();
		if (this.unsubscribeAgentBus) {
			this.unsubscribeAgentBus();
			this.unsubscribeAgentBus = null;
		}
	}

	getConfig(): CloudNodeConfig {
		return this.config;
	}

	getStatus(): CloudNodeRuntimeStatus {
		this.patchStatus({});
		return this.status;
	}

	async setConfig(next: CloudNodeConfig): Promise<void> {
		await this.configStore.save(next);
		this.config = next;
		this.refreshStatusByConfig();
		this.closeSocket();
		if (this.started && this.config.enabled) {
			await this.connect();
		}
	}

	async bind(input: CloudNodeBindInput): Promise<CloudNodeBindResult> {
		const relayUrl = sanitizeRelayUrl(input.relay_url);
		if (!relayUrl) {
			throw new Error("relay_url 不能为空");
		}
		const email = String(input.email || "").trim();
		const password = String(input.password || "").trim();
		if (!email || !password) {
			throw new Error("email/password 不能为空");
		}

		const url = `${toHttpUrl(relayUrl)}/v1/nodes/bind`;
		const resp = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email,
				password,
				node_name: input.node_name || this.config.nodeName,
				hostname: os.hostname(),
			}),
		});
		const payload = (await resp.json()) as {
			node_id?: string;
			node_token?: string;
			error?: string;
		};
		if (!resp.ok || !payload.node_id || !payload.node_token) {
			throw new Error(payload.error || `绑定失败: HTTP ${resp.status}`);
		}

		const next: CloudNodeConfig = {
			...this.config,
			relayUrl,
			nodeId: payload.node_id,
			nodeToken: payload.node_token,
			nodeName: String(
				input.node_name || this.config.nodeName || "desktop-node",
			),
		};
		await this.setConfig(next);
		return {
			node_id: payload.node_id,
			node_token: payload.node_token,
		};
	}

	async unbind(): Promise<void> {
		const next: CloudNodeConfig = {
			...this.config,
			nodeId: "",
			nodeToken: "",
			enabled: false,
		};
		await this.setConfig(next);
	}
}
