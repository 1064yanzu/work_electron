/**
 * 飞书流式卡片 —— 支持真实流式显示（字符一个个出现）
 *
 * 移植自：openclaw-main/extensions/feishu/src/streaming-card.ts
 * 调整：
 * - 去掉 openclaw plugin-sdk 的 fetchWithSsrFGuard，改用原生 fetch + 域名白名单
 * - 去掉 openclaw runtime 依赖，日志走 Logger
 * - 卡片模板常量内联
 * - 与我们的 `ChannelStreamingSession` 接口对齐
 */

import type { Client } from "@larksuiteoapi/node-sdk";
import type { Logger } from "../../../logging/types";
import {
	mergeStreamingText,
	truncateSummary,
	type ChannelStreamingSession,
	type ChannelStreamingStartOptions,
	type TerminalShortcutAction,
} from "../../sdk";

type FeishuDomain = "feishu" | "lark";

type Credentials = {
	appId: string;
	appSecret: string;
	domain: FeishuDomain;
};

type CardState = {
	cardId: string;
	messageId: string;
	sequence: number;
	currentText: string;
	hasNote: boolean;
};

// ─── 主机名白名单（反 SSRF 安全） ───────────────────────

function resolveApiBase(domain: FeishuDomain): string {
	return domain === "lark"
		? "https://open.larksuite.com/open-apis"
		: "https://open.feishu.cn/open-apis";
}

function resolveAllowedHostnames(domain: FeishuDomain): string[] {
	return domain === "lark" ? ["open.larksuite.com"] : ["open.feishu.cn"];
}

/**
 * 替代 openclaw 的 fetchWithSsrFGuard：
 * 只允许请求白名单域名（lark/feishu 官方 API），防御 SSRF。
 */
async function safeFetch(params: {
	url: string;
	init: RequestInit;
	allowedHostnames: string[];
}): Promise<Response> {
	let parsed: URL;
	try {
		parsed = new URL(params.url);
	} catch {
		throw new Error(`invalid url: ${params.url}`);
	}
	if (parsed.protocol !== "https:") {
		throw new Error(`feishu api must be https, got ${parsed.protocol}`);
	}
	if (!params.allowedHostnames.includes(parsed.hostname)) {
		throw new Error(`hostname ${parsed.hostname} is not in feishu allowlist`);
	}
	return fetch(params.url, params.init);
}

// ─── Tenant access token 缓存 ─────────────────────────

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getTenantAccessToken(creds: Credentials): Promise<string> {
	const key = `${creds.domain}|${creds.appId}`;
	const cached = tokenCache.get(key);
	if (cached && cached.expiresAt > Date.now() + 60_000) {
		return cached.token;
	}

	const response = await safeFetch({
		url: `${resolveApiBase(creds.domain)}/auth/v3/tenant_access_token/internal`,
		init: {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "work_electron-remote-control/1.0",
			},
			body: JSON.stringify({
				app_id: creds.appId,
				app_secret: creds.appSecret,
			}),
		},
		allowedHostnames: resolveAllowedHostnames(creds.domain),
	});
	if (!response.ok) {
		throw new Error(`tenant_access_token HTTP ${response.status}`);
	}
	const data = (await response.json()) as {
		code: number;
		msg: string;
		tenant_access_token?: string;
		expire?: number;
	};
	if (data.code !== 0 || !data.tenant_access_token) {
		throw new Error(`tenant_access_token err: ${data.msg}`);
	}
	tokenCache.set(key, {
		token: data.tenant_access_token,
		expiresAt: Date.now() + (data.expire ?? 7200) * 1000,
	});
	return data.tenant_access_token;
}

// ─── 卡片模板名映射 ────────────────────────────────────

/**
 * 飞书卡片 header 支持的 template 色值。
 * 来源：https://open.feishu.cn/document/common-capabilities/message-card/card-interaction-design/message-card-color
 */
const FEISHU_CARD_TEMPLATES = new Set([
	"blue",
	"green",
	"red",
	"orange",
	"purple",
	"indigo",
	"wathet",
	"turquoise",
	"yellow",
	"grey",
	"carmine",
	"violet",
	"lime",
]);

function resolveFeishuCardTemplate(raw: string | undefined): string {
	if (raw && FEISHU_CARD_TEMPLATES.has(raw)) return raw;
	return "blue";
}

// ─── 终端快捷按钮渲染 ─────────────────────────────────

/**
 * 把 TerminalShortcutAction 转成 CardKit 2.0 button 元素。
 * `value` 走 onCardAction 回调，由 parsePtyCardAction 解析。
 */
function buildButtonElement(
	action: TerminalShortcutAction,
): Record<string, unknown> {
	const type =
		action.style === "danger"
			? "danger"
			: action.style === "secondary"
				? "default"
				: "primary";

	const value: Record<string, unknown> =
		action.kind === "key"
			? { action: "pty_key", key: action.key }
			: action.kind === "stop"
				? { action: "pty_stop" }
				: { action: "pty_text", text: action.text };

	return {
		tag: "button",
		text: { tag: "plain_text", content: action.label },
		type,
		size: "medium",
		value,
	};
}

/**
 * 把按钮按 4 列一行排进 column_set 元素中。
 * 末行不足 4 个时留空，避免拉伸单按钮过宽。
 */
function buildShortcutElements(
	shortcuts: TerminalShortcutAction[],
): Record<string, unknown>[] {
	const elements: Record<string, unknown>[] = [];
	if (shortcuts.length === 0) return elements;
	elements.push({ tag: "hr" });

	const columnsPerRow = 4;
	for (let i = 0; i < shortcuts.length; i += columnsPerRow) {
		const slice = shortcuts.slice(i, i + columnsPerRow);
		const columns: Record<string, unknown>[] = slice.map((action) => ({
			tag: "column",
			width: "weighted",
			weight: 1,
			elements: [buildButtonElement(action)],
		}));
		// 不足 4 列时补空白列，确保按钮宽度一致
		while (columns.length < columnsPerRow) {
			columns.push({
				tag: "column",
				width: "weighted",
				weight: 1,
				elements: [],
			});
		}
		elements.push({
			tag: "column_set",
			flex_mode: "stretch",
			columns,
		});
	}
	return elements;
}

// ─── 主类 ─────────────────────────────────────────────

export class FeishuStreamingSessionImpl implements ChannelStreamingSession {
	private state: CardState | null = null;
	private queue: Promise<void> = Promise.resolve();
	private closed = false;
	private lastUpdateTime = 0;
	private pendingText: string | null = null;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly updateThrottleMs = 100; // ≤ 10 次/秒

	constructor(
		private readonly client: Client,
		private readonly creds: Credentials,
		private readonly targetId: string,
		private readonly receiveIdType:
			| "chat_id"
			| "open_id"
			| "user_id"
			| "union_id"
			| "email",
		private readonly log: Logger,
	) {}

	async start(options?: ChannelStreamingStartOptions): Promise<void> {
		if (this.state) return;

		const apiBase = resolveApiBase(this.creds.domain);
		const elements: Record<string, unknown>[] = [
			{
				tag: "markdown",
				content: "⏳ Thinking...",
				element_id: "content",
			},
		];
		if (options?.note) {
			elements.push({ tag: "hr" });
			elements.push({
				tag: "markdown",
				content: `<font color='grey'>${options.note}</font>`,
				element_id: "note",
			});
		}
		// 远程终端快捷按钮（仅 pty 桥使用；用户点击触发 card.action.trigger，
		// 由 feishuChannel.onCardAction 路由到 pty 桥）
		if (options?.terminalShortcuts && options.terminalShortcuts.length > 0) {
			for (const el of buildShortcutElements(options.terminalShortcuts)) {
				elements.push(el);
			}
		}
		const cardJson: Record<string, unknown> = {
			schema: "2.0",
			config: {
				streaming_mode: true,
				summary: { content: "[Generating...]" },
				streaming_config: {
					print_frequency_ms: { default: 50 },
					print_step: { default: 1 },
				},
			},
			body: { elements },
		};
		if (options?.title) {
			cardJson.header = {
				title: { tag: "plain_text", content: options.title },
				template: resolveFeishuCardTemplate(options.template),
			};
		}

		// 1) 创建卡片 entity
		const createRes = await safeFetch({
			url: `${apiBase}/cardkit/v1/cards`,
			init: {
				method: "POST",
				headers: {
					Authorization: `Bearer ${await getTenantAccessToken(this.creds)}`,
					"Content-Type": "application/json",
					"User-Agent": "work_electron-remote-control/1.0",
				},
				body: JSON.stringify({
					type: "card_json",
					data: JSON.stringify(cardJson),
				}),
			},
			allowedHostnames: resolveAllowedHostnames(this.creds.domain),
		});
		if (!createRes.ok) {
			throw new Error(`create card HTTP ${createRes.status}`);
		}
		const createData = (await createRes.json()) as {
			code: number;
			msg: string;
			data?: { card_id: string };
		};
		if (createData.code !== 0 || !createData.data?.card_id) {
			throw new Error(`create card failed: ${createData.msg}`);
		}
		const cardId = createData.data.card_id;
		const cardContent = JSON.stringify({
			type: "card",
			data: { card_id: cardId },
		});

		// 2) 用 SDK 发卡片消息（reply 或 create）
		let sendRes: Awaited<ReturnType<Client["im"]["message"]["create"]>>;
		if (options?.replyToMessageId) {
			sendRes = (await this.client.im.message.reply({
				path: { message_id: options.replyToMessageId },
				data: {
					msg_type: "interactive",
					content: cardContent,
					...(options.threadId ? { reply_in_thread: true } : {}),
				},
			})) as typeof sendRes;
		} else if (options?.threadId) {
			sendRes = (await this.client.im.message.create({
				params: { receive_id_type: this.receiveIdType },
				data: Object.assign(
					{
						receive_id: this.targetId,
						msg_type: "interactive",
						content: cardContent,
					},
					{ root_id: options.threadId },
				),
			})) as typeof sendRes;
		} else {
			sendRes = await this.client.im.message.create({
				params: { receive_id_type: this.receiveIdType },
				data: {
					receive_id: this.targetId,
					msg_type: "interactive",
					content: cardContent,
				},
			});
		}
		if (sendRes.code !== 0 || !sendRes.data?.message_id) {
			throw new Error(`feishu streaming send card failed: ${sendRes.msg}`);
		}

		this.state = {
			cardId,
			messageId: sendRes.data.message_id,
			sequence: 1,
			currentText: "",
			hasNote: !!options?.note,
		};
		this.log.info({
			msg: "feishu streaming started",
			cardId,
			messageId: sendRes.data.message_id,
		});
	}

	private async updateCardContent(text: string): Promise<void> {
		if (!this.state) return;
		const apiBase = resolveApiBase(this.creds.domain);
		this.state.sequence += 1;
		try {
			const response = await safeFetch({
				url: `${apiBase}/cardkit/v1/cards/${this.state.cardId}/elements/content/content`,
				init: {
					method: "PUT",
					headers: {
						Authorization: `Bearer ${await getTenantAccessToken(this.creds)}`,
						"Content-Type": "application/json",
						"User-Agent": "work_electron-remote-control/1.0",
					},
					body: JSON.stringify({
						content: text,
						sequence: this.state.sequence,
						uuid: `s_${this.state.cardId}_${this.state.sequence}`,
					}),
				},
				allowedHostnames: resolveAllowedHostnames(this.creds.domain),
			});
			if (!response.ok) {
				throw new Error(`update card HTTP ${response.status}`);
			}
		} catch (err) {
			this.log.warn({
				msg: "feishu streaming update failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	async update(text: string): Promise<void> {
		if (!this.state || this.closed) return;
		const mergedInput = mergeStreamingText(
			this.pendingText ?? this.state.currentText,
			text,
		);
		if (!mergedInput || mergedInput === this.state.currentText) return;

		const now = Date.now();
		if (now - this.lastUpdateTime < this.updateThrottleMs) {
			this.pendingText = mergedInput;
			// 在 throttle 窗口结束后自动 flush
			if (!this.flushTimer) {
				this.flushTimer = setTimeout(() => {
					this.flushTimer = null;
					const pending = this.pendingText;
					this.pendingText = null;
					if (pending) {
						void this.update(pending);
					}
				}, this.updateThrottleMs);
			}
			return;
		}
		this.pendingText = null;
		this.lastUpdateTime = now;
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}

		this.queue = this.queue.then(async () => {
			if (!this.state || this.closed) return;
			const mergedText = mergeStreamingText(
				this.state.currentText,
				mergedInput,
			);
			if (!mergedText || mergedText === this.state.currentText) return;
			this.state.currentText = mergedText;
			await this.updateCardContent(mergedText);
		});
		await this.queue;
	}

	private async updateNoteContent(note: string): Promise<void> {
		if (!this.state || !this.state.hasNote) return;
		const apiBase = resolveApiBase(this.creds.domain);
		this.state.sequence += 1;
		try {
			await safeFetch({
				url: `${apiBase}/cardkit/v1/cards/${this.state.cardId}/elements/note/content`,
				init: {
					method: "PUT",
					headers: {
						Authorization: `Bearer ${await getTenantAccessToken(this.creds)}`,
						"Content-Type": "application/json",
						"User-Agent": "work_electron-remote-control/1.0",
					},
					body: JSON.stringify({
						content: `<font color='grey'>${note}</font>`,
						sequence: this.state.sequence,
						uuid: `n_${this.state.cardId}_${this.state.sequence}`,
					}),
				},
				allowedHostnames: resolveAllowedHostnames(this.creds.domain),
			});
		} catch (err) {
			this.log.warn({
				msg: "feishu streaming note update failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	async close(finalText?: string, options?: { note?: string }): Promise<void> {
		if (!this.state || this.closed) return;
		this.closed = true;
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		await this.queue;

		const pendingMerged = mergeStreamingText(
			this.state.currentText,
			this.pendingText ?? undefined,
		);
		const text = finalText
			? mergeStreamingText(pendingMerged, finalText)
			: pendingMerged;
		const apiBase = resolveApiBase(this.creds.domain);

		if (text && text !== this.state.currentText) {
			await this.updateCardContent(text);
			this.state.currentText = text;
		}

		if (options?.note) {
			await this.updateNoteContent(options.note);
		}

		this.state.sequence += 1;
		try {
			await safeFetch({
				url: `${apiBase}/cardkit/v1/cards/${this.state.cardId}/settings`,
				init: {
					method: "PATCH",
					headers: {
						Authorization: `Bearer ${await getTenantAccessToken(this.creds)}`,
						"Content-Type": "application/json; charset=utf-8",
						"User-Agent": "work_electron-remote-control/1.0",
					},
					body: JSON.stringify({
						settings: JSON.stringify({
							config: {
								streaming_mode: false,
								summary: { content: truncateSummary(text) },
							},
						}),
						sequence: this.state.sequence,
						uuid: `c_${this.state.cardId}_${this.state.sequence}`,
					}),
				},
				allowedHostnames: resolveAllowedHostnames(this.creds.domain),
			});
		} catch (err) {
			this.log.warn({
				msg: "feishu streaming close failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
		const finalState = this.state;
		this.state = null;
		this.pendingText = null;
		this.log.info({
			msg: "feishu streaming closed",
			cardId: finalState.cardId,
		});
	}

	isActive(): boolean {
		return this.state !== null && !this.closed;
	}

	getMessageId(): string | undefined {
		return this.state?.messageId;
	}
}

// ─── Streaming Factory（由 feishuChannel 创建） ─────────────────

export function createFeishuStreamingFactory(params: {
	client: Client;
	credentials: Credentials;
	logger: Logger;
	enabled: () => boolean;
	resolveReceiveIdType: (
		targetId: string,
	) => "chat_id" | "open_id" | "user_id" | "union_id" | "email";
}) {
	return {
		isEnabled: params.enabled,
		openSession: (opts: {
			targetId: string;
			threadId?: string;
			replyToMessageId?: string;
		}) =>
			new FeishuStreamingSessionImpl(
				params.client,
				params.credentials,
				opts.targetId,
				params.resolveReceiveIdType(opts.targetId),
				params.logger,
			),
	};
}
