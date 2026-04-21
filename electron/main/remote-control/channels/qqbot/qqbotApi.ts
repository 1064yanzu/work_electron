/**
 * QQ Bot 官方 API 封装（QQ 开放平台 Bot API v2）
 *
 * 参考：https://bot.q.qq.com/wiki/
 *
 * 关键接口：
 * - getAccessToken — 用 appId + clientSecret 换 bot access token（2h 失效）
 * - getGatewayUrl  — 拿 WebSocket gateway 地址
 * - sendC2CMessage / sendGroupMessage / sendChannelMessage / sendDmMessage — 发消息
 *
 * 与 openclaw 的差异：
 * - 去掉 SSRF guard / upload cache / TTS / session-store / known-users 等运行时依赖
 * - 只保留本 Electron 项目需要的核心 REST 调用
 */
import type { Logger } from "../../../logging/types";

const API_BASE_PROD = "https://api.sgroup.qq.com";
const API_BASE_SANDBOX = "https://sandbox.api.sgroup.qq.com";
const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const DEFAULT_TIMEOUT_MS = 30_000;

export type QqbotEnvironment = "prod" | "sandbox";

export type QqbotApiCredentials = {
	appId: string;
	clientSecret: string;
	environment: QqbotEnvironment;
};

export type QqbotMessageResponse = {
	id?: string;
	timestamp?: number | string;
	ext_info?: { ref_idx?: string };
};

type TokenCacheEntry = {
	appId: string;
	token: string;
	expiresAt: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();
const inflightToken = new Map<string, Promise<string>>();

function apiBase(environment: QqbotEnvironment): string {
	return environment === "sandbox" ? API_BASE_SANDBOX : API_BASE_PROD;
}

function nextMsgSeq(): number {
	const timePart = Date.now() % 100_000_000;
	const random = Math.floor(Math.random() * 65_536);
	return (timePart ^ random) % 65_536;
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

export async function getAccessToken(
	credentials: QqbotApiCredentials,
	logger?: Logger,
): Promise<string> {
	const { appId, clientSecret } = credentials;
	const cacheKey = appId;
	const cached = tokenCache.get(cacheKey);
	const now = Date.now();
	const REFRESH_AHEAD_MS = 5 * 60 * 1000;
	if (cached && now < cached.expiresAt - REFRESH_AHEAD_MS) {
		return cached.token;
	}
	const pending = inflightToken.get(cacheKey);
	if (pending) return pending;

	const promise = (async () => {
		try {
			const response = await fetchWithTimeout(
				TOKEN_URL,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ appId, clientSecret }),
				},
				DEFAULT_TIMEOUT_MS,
			);
			if (!response.ok) {
				const body = await response.text().catch(() => "");
				throw new Error(
					`qqbot token ${response.status}: ${body || response.statusText}`,
				);
			}
			const data = (await response.json()) as {
				access_token?: string;
				expires_in?: number | string;
			};
			if (!data.access_token) {
				throw new Error("qqbot token response missing access_token");
			}
			const expiresInSec =
				typeof data.expires_in === "string"
					? Number.parseInt(data.expires_in, 10)
					: Number(data.expires_in ?? 7200);
			const entry: TokenCacheEntry = {
				appId,
				token: data.access_token,
				expiresAt: Date.now() + Math.max(60, expiresInSec) * 1000,
			};
			tokenCache.set(cacheKey, entry);
			return entry.token;
		} catch (err) {
			logger?.error({
				msg: "qqbot: token refresh failed",
				error: err instanceof Error ? err.message : String(err),
			});
			throw err;
		} finally {
			inflightToken.delete(cacheKey);
		}
	})();

	inflightToken.set(cacheKey, promise);
	return promise;
}

export function clearAccessTokenCache(appId?: string): void {
	if (appId) {
		tokenCache.delete(appId);
	} else {
		tokenCache.clear();
	}
}

export async function apiRequest<T = unknown>(params: {
	credentials: QqbotApiCredentials;
	method: string;
	path: string;
	body?: unknown;
	timeoutMs?: number;
	logger?: Logger;
}): Promise<T> {
	const token = await getAccessToken(params.credentials, params.logger);
	const url = `${apiBase(params.credentials.environment)}${params.path}`;
	const response = await fetchWithTimeout(
		url,
		{
			method: params.method,
			headers: {
				Authorization: `QQBot ${token}`,
				"Content-Type": "application/json",
			},
			body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
		},
		params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
	);
	const text = await response.text();
	if (!response.ok) {
		params.logger?.warn({
			msg: "qqbot api non-2xx",
			status: response.status,
			path: params.path,
			body: text.slice(0, 200),
		});
		throw new Error(
			`qqbot ${params.method} ${params.path} ${response.status}: ${text}`,
		);
	}
	if (!text) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		return {} as T;
	}
}

export async function getGatewayUrl(
	credentials: QqbotApiCredentials,
	logger?: Logger,
): Promise<string> {
	const data = await apiRequest<{ url: string }>({
		credentials,
		method: "GET",
		path: "/gateway",
		logger,
	});
	if (!data.url) {
		throw new Error("qqbot gateway url missing");
	}
	return data.url;
}

function buildMessageBody(
	content: string,
	msgId: string | undefined,
	messageReference?: string,
): Record<string, unknown> {
	const body: Record<string, unknown> = {
		content,
		msg_type: 0,
		msg_seq: nextMsgSeq(),
	};
	if (msgId) body.msg_id = msgId;
	if (messageReference) {
		body.message_reference = { message_id: messageReference };
	}
	return body;
}

export async function sendC2CMessage(params: {
	credentials: QqbotApiCredentials;
	openid: string;
	content: string;
	msgId?: string;
	messageReference?: string;
	logger?: Logger;
}): Promise<QqbotMessageResponse> {
	return apiRequest<QqbotMessageResponse>({
		credentials: params.credentials,
		method: "POST",
		path: `/v2/users/${params.openid}/messages`,
		body: buildMessageBody(
			params.content,
			params.msgId,
			params.messageReference,
		),
		logger: params.logger,
	});
}

export async function sendGroupMessage(params: {
	credentials: QqbotApiCredentials;
	groupOpenid: string;
	content: string;
	msgId?: string;
	messageReference?: string;
	logger?: Logger;
}): Promise<QqbotMessageResponse> {
	return apiRequest<QqbotMessageResponse>({
		credentials: params.credentials,
		method: "POST",
		path: `/v2/groups/${params.groupOpenid}/messages`,
		body: buildMessageBody(
			params.content,
			params.msgId,
			params.messageReference,
		),
		logger: params.logger,
	});
}

export async function sendChannelMessage(params: {
	credentials: QqbotApiCredentials;
	channelId: string;
	content: string;
	msgId?: string;
	logger?: Logger;
}): Promise<QqbotMessageResponse> {
	return apiRequest<QqbotMessageResponse>({
		credentials: params.credentials,
		method: "POST",
		path: `/channels/${params.channelId}/messages`,
		body: {
			content: params.content,
			...(params.msgId ? { msg_id: params.msgId } : {}),
		},
		logger: params.logger,
	});
}

export async function sendDmMessage(params: {
	credentials: QqbotApiCredentials;
	guildId: string;
	content: string;
	msgId?: string;
	logger?: Logger;
}): Promise<QqbotMessageResponse> {
	return apiRequest<QqbotMessageResponse>({
		credentials: params.credentials,
		method: "POST",
		path: `/dms/${params.guildId}/messages`,
		body: {
			content: params.content,
			...(params.msgId ? { msg_id: params.msgId } : {}),
		},
		logger: params.logger,
	});
}

/**
 * 编辑消息（用于 streaming）—— C2C / Group 消息
 * QQ 官方 API 的编辑接口走 PATCH /messages/{message_id}。
 */
export async function editMessage(params: {
	credentials: QqbotApiCredentials;
	scope: "c2c" | "group" | "channel" | "dm";
	targetId: string;
	messageId: string;
	content: string;
	logger?: Logger;
}): Promise<void> {
	const { scope, targetId, messageId } = params;
	let path: string;
	switch (scope) {
		case "c2c":
			path = `/v2/users/${targetId}/messages/${messageId}`;
			break;
		case "group":
			path = `/v2/groups/${targetId}/messages/${messageId}`;
			break;
		case "channel":
			path = `/channels/${targetId}/messages/${messageId}`;
			break;
		case "dm":
			path = `/dms/${targetId}/messages/${messageId}`;
			break;
	}
	await apiRequest({
		credentials: params.credentials,
		method: "PATCH",
		path,
		body: { content: params.content, msg_type: 0 },
		logger: params.logger,
	});
}

/**
 * C2C 私聊「输入中」提示（协议支持 60s 心跳）。
 */
export async function sendC2CInputNotify(params: {
	credentials: QqbotApiCredentials;
	openid: string;
	msgId?: string;
	inputSecond?: number;
	logger?: Logger;
}): Promise<void> {
	await apiRequest({
		credentials: params.credentials,
		method: "POST",
		path: `/v2/users/${params.openid}/messages`,
		body: {
			msg_type: 6,
			input_notify: {
				input_type: 1,
				input_second: params.inputSecond ?? 60,
			},
			msg_seq: nextMsgSeq(),
			...(params.msgId ? { msg_id: params.msgId } : {}),
		},
		logger: params.logger,
	});
}

export type QqbotAccessTokenStatus = {
	status: "valid" | "expired" | "refreshing" | "none";
	expiresAt: number | null;
};

export function getAccessTokenStatus(appId: string): QqbotAccessTokenStatus {
	if (inflightToken.has(appId)) {
		return {
			status: "refreshing",
			expiresAt: tokenCache.get(appId)?.expiresAt ?? null,
		};
	}
	const cached = tokenCache.get(appId);
	if (!cached) return { status: "none", expiresAt: null };
	const valid = Date.now() < cached.expiresAt - 60_000;
	return { status: valid ? "valid" : "expired", expiresAt: cached.expiresAt };
}
