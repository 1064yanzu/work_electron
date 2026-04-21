/**
 * QQ Bot Gateway —— 精简版 WebSocket 客户端
 *
 * 参考：https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/gateway.html
 *
 * 仅实现本 Electron 项目需要的最小能力：
 *   - 连接 gateway、Identify、Resume
 *   - 收 C2C / AT / Direct / Group AT 四种消息事件
 *   - 心跳 + 断线重连 + 会话恢复
 *   - 暴露 onReady / onMessage / onError / onClose 回调
 *
 * 与 openclaw 差异：
 *   - 去掉多账号 session-store / known-users / slash-commands / proactive / TTS / 上传缓存
 *   - 不做 intent 热切换，始终使用 [C2C + DM + GUILD_AT + GROUP_AT] intent 集合
 */
import WebSocket, { type RawData } from "ws";
import type { Logger } from "../../../logging/types";
import { getAccessToken, type QqbotApiCredentials } from "./qqbotApi";

const INTENT_PUBLIC_GUILD_MESSAGES = 1 << 30;
const INTENT_DIRECT_MESSAGE = 1 << 12;
const INTENT_GROUP_AND_C2C = 1 << 25;
export const FULL_INTENTS =
	INTENT_PUBLIC_GUILD_MESSAGES | INTENT_DIRECT_MESSAGE | INTENT_GROUP_AND_C2C;

const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];
const MAX_RECONNECT_ATTEMPTS = 100;

export type QqbotScope = "c2c" | "group" | "guild_at" | "dm";

export type QqbotAuthor = {
	id?: string; // guild.author.id / dm.author.id
	username?: string;
	user_openid?: string; // C2C
	member_openid?: string; // Group
};

export type QqbotRawMessageEvent = {
	id: string;
	timestamp?: string | number;
	content: string;
	author: QqbotAuthor;
	channel_id?: string; // guild
	guild_id?: string; // guild / dm
	group_openid?: string; // group
	message_reference?: { message_id?: string };
};

export type QqbotGatewayMessage = {
	scope: QqbotScope;
	event: QqbotRawMessageEvent;
};

export type QqbotGatewayCallbacks = {
	onReady?: (info: { sessionId: string; botId?: string }) => void;
	onMessage?: (msg: QqbotGatewayMessage) => void;
	onError?: (err: Error) => void;
	onClose?: (reason: string) => void;
	onStatus?: (patch: { connected: boolean; note?: string }) => void;
};

type GatewayState = {
	ws: WebSocket | null;
	sessionId: string | null;
	lastSeq: number | null;
	heartbeat: ReturnType<typeof setInterval> | null;
	reconnectAttempts: number;
	stopped: boolean;
	accessToken: string | null;
};

export class QqbotGateway {
	private readonly state: GatewayState;

	constructor(
		private readonly credentials: QqbotApiCredentials,
		private readonly callbacks: QqbotGatewayCallbacks,
		private readonly logger: Logger,
	) {
		this.state = {
			ws: null,
			sessionId: null,
			lastSeq: null,
			heartbeat: null,
			reconnectAttempts: 0,
			stopped: false,
			accessToken: null,
		};
	}

	async start(): Promise<void> {
		this.state.stopped = false;
		await this.connect();
	}

	async stop(): Promise<void> {
		this.state.stopped = true;
		if (this.state.heartbeat) {
			clearInterval(this.state.heartbeat);
			this.state.heartbeat = null;
		}
		if (this.state.ws) {
			try {
				this.state.ws.close(1000, "stopped");
			} catch {
				/* ignore */
			}
			this.state.ws = null;
		}
	}

	private async connect(): Promise<void> {
		if (this.state.stopped) return;

		let gatewayUrl: string;
		try {
			this.state.accessToken = await getAccessToken(
				this.credentials,
				this.logger,
			);
			gatewayUrl = await this.fetchGatewayUrl();
		} catch (err) {
			this.logger.error({
				msg: "qqbot: 获取 gateway URL 失败",
				error: err instanceof Error ? err.message : String(err),
			});
			this.callbacks.onError?.(
				err instanceof Error ? err : new Error(String(err)),
			);
			this.scheduleReconnect();
			return;
		}

		try {
			const ws = new WebSocket(gatewayUrl);
			this.state.ws = ws;
			ws.on("open", () => {
				this.logger.info({ msg: "qqbot: gateway opened", url: gatewayUrl });
				this.callbacks.onStatus?.({ connected: true, note: "gateway opened" });
			});
			ws.on("message", (raw) => this.handleFrame(raw));
			ws.on("close", (code, reason) => {
				const msg = `code=${code} reason=${reason?.toString() || "?"}`;
				this.logger.info({ msg: `qqbot: gateway closed ${msg}` });
				this.cleanupHeartbeat();
				this.callbacks.onClose?.(msg);
				this.callbacks.onStatus?.({ connected: false, note: msg });
				if (!this.state.stopped) this.scheduleReconnect();
			});
			ws.on("error", (err) => {
				this.logger.warn({
					msg: "qqbot: gateway ws error",
					error: err instanceof Error ? err.message : String(err),
				});
				this.callbacks.onError?.(
					err instanceof Error ? err : new Error(String(err)),
				);
			});
		} catch (err) {
			this.logger.error({
				msg: "qqbot: 建立 WebSocket 失败",
				error: err instanceof Error ? err.message : String(err),
			});
			this.callbacks.onError?.(
				err instanceof Error ? err : new Error(String(err)),
			);
			this.scheduleReconnect();
		}
	}

	private async fetchGatewayUrl(): Promise<string> {
		const apiBase =
			this.credentials.environment === "sandbox"
				? "https://sandbox.api.sgroup.qq.com"
				: "https://api.sgroup.qq.com";
		const response = await fetch(`${apiBase}/gateway`, {
			method: "GET",
			headers: {
				Authorization: `QQBot ${this.state.accessToken}`,
				"Content-Type": "application/json",
			},
		});
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`gateway url ${response.status}: ${body}`);
		}
		const data = (await response.json()) as { url?: string };
		if (!data.url) throw new Error("gateway response missing url");
		return data.url;
	}

	private cleanupHeartbeat(): void {
		if (this.state.heartbeat) {
			clearInterval(this.state.heartbeat);
			this.state.heartbeat = null;
		}
	}

	private scheduleReconnect(): void {
		if (this.state.stopped) return;
		if (this.state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			this.logger.error({ msg: "qqbot: 达到最大重连次数，放弃" });
			return;
		}
		const delay =
			RECONNECT_DELAYS_MS[
				Math.min(this.state.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)
			];
		this.state.reconnectAttempts += 1;
		this.logger.info({
			msg: "qqbot: 安排重连",
			attempt: this.state.reconnectAttempts,
			delay,
		});
		setTimeout(() => {
			void this.connect();
		}, delay);
	}

	private handleFrame(raw: RawData): void {
		let payload: { op: number; s?: number; t?: string; d?: unknown };
		try {
			const text =
				typeof raw === "string"
					? raw
					: Buffer.isBuffer(raw)
						? raw.toString("utf8")
						: Buffer.from(raw as ArrayBuffer).toString("utf8");
			payload = JSON.parse(text) as {
				op: number;
				s?: number;
				t?: string;
				d?: unknown;
			};
		} catch (err) {
			this.logger.warn({
				msg: "qqbot: 解析 gateway frame 失败",
				error: err instanceof Error ? err.message : String(err),
			});
			return;
		}

		if (typeof payload.s === "number") this.state.lastSeq = payload.s;

		switch (payload.op) {
			case 10:
				this.onHello(payload.d as { heartbeat_interval?: number });
				break;
			case 0:
				this.onDispatch(payload.t, payload.d);
				break;
			case 11:
				// Heartbeat ACK — ignore
				break;
			case 7:
				this.logger.info({ msg: "qqbot: server requested reconnect" });
				this.state.ws?.close(4000, "server-reconnect");
				break;
			case 9:
				this.logger.warn({ msg: "qqbot: invalid session, reset" });
				this.state.sessionId = null;
				this.state.lastSeq = null;
				this.state.ws?.close(4000, "invalid-session");
				break;
			default:
				// opcode we don't handle (e.g., HTTP callback)
				break;
		}
	}

	private onHello(data: { heartbeat_interval?: number } | undefined): void {
		const interval = Math.max(data?.heartbeat_interval ?? 30_000, 5_000);
		if (
			this.state.sessionId &&
			this.state.lastSeq !== null &&
			this.state.accessToken
		) {
			this.send({
				op: 6,
				d: {
					token: `QQBot ${this.state.accessToken}`,
					session_id: this.state.sessionId,
					seq: this.state.lastSeq,
				},
			});
		} else if (this.state.accessToken) {
			this.send({
				op: 2,
				d: {
					token: `QQBot ${this.state.accessToken}`,
					intents: FULL_INTENTS,
					shard: [0, 1],
				},
			});
		}
		this.cleanupHeartbeat();
		this.state.heartbeat = setInterval(() => {
			if (this.state.ws?.readyState === WebSocket.OPEN) {
				this.send({ op: 1, d: this.state.lastSeq });
			}
		}, interval);
	}

	private send(payload: unknown): void {
		try {
			this.state.ws?.send(JSON.stringify(payload));
		} catch (err) {
			this.logger.warn({
				msg: "qqbot: send payload failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	private onDispatch(t: string | undefined, d: unknown): void {
		if (!t) return;
		if (t === "READY") {
			const data = d as { session_id?: string; user?: { id?: string } };
			if (data.session_id) this.state.sessionId = data.session_id;
			this.state.reconnectAttempts = 0;
			this.callbacks.onReady?.({
				sessionId: data.session_id ?? "",
				botId: data.user?.id,
			});
			return;
		}
		if (t === "RESUMED") {
			this.state.reconnectAttempts = 0;
			this.callbacks.onStatus?.({ connected: true, note: "session resumed" });
			return;
		}
		if (
			t === "C2C_MESSAGE_CREATE" ||
			t === "AT_MESSAGE_CREATE" ||
			t === "DIRECT_MESSAGE_CREATE" ||
			t === "GROUP_AT_MESSAGE_CREATE"
		) {
			const scope: QqbotScope =
				t === "C2C_MESSAGE_CREATE"
					? "c2c"
					: t === "AT_MESSAGE_CREATE"
						? "guild_at"
						: t === "DIRECT_MESSAGE_CREATE"
							? "dm"
							: "group";
			const event = d as QqbotRawMessageEvent;
			if (event?.content !== undefined) {
				this.callbacks.onMessage?.({ scope, event });
			}
		}
	}
}
