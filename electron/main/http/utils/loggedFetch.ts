import { performance } from "node:perf_hooks";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { Logger } from "../../logging/types";

type LoggedFetchOptions = {
	logger?: Logger;
	requestId?: string;
	conversationId?: string;
	service: string;
	readResponseBody?: boolean;
};

function parsePositiveIntEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n < 0) return fallback;
	return n;
}

function headersToObject(headers: Headers): Record<string, string> {
	const out: Record<string, string> = {};
	headers.forEach((v, k) => {
		out[k.toLowerCase()] = v;
	});
	return out;
}

function safeBodyToString(body: RequestInit["body"]): string {
	if (!body) return "";
	if (typeof body === "string") return body;
	if (body instanceof URLSearchParams) return body.toString();
	if (body instanceof Blob) return `[Blob size=${body.size} type=${body.type}]`;
	if (body instanceof ArrayBuffer)
		return `[ArrayBuffer byteLength=${body.byteLength}]`;
	if (ArrayBuffer.isView(body))
		return `[ArrayBufferView byteLength=${body.byteLength}]`;
	return "[non-string body]";
}

function truncateUtf8(input: string, maxBytes: number) {
	if (maxBytes <= 0) {
		return {
			text: input,
			truncated: false,
			bytes: Buffer.byteLength(input, "utf8"),
		};
	}
	const totalBytes = Buffer.byteLength(input, "utf8");
	if (totalBytes <= maxBytes)
		return { text: input, truncated: false, bytes: totalBytes };

	let lo = 0;
	let hi = input.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		const bytes = Buffer.byteLength(input.slice(0, mid), "utf8");
		if (bytes <= maxBytes) lo = mid;
		else hi = mid - 1;
	}
	const head = input.slice(0, lo);
	return {
		text: `${head}…(truncated ${totalBytes - Buffer.byteLength(head, "utf8")} bytes)`,
		truncated: true,
		bytes: totalBytes,
	};
}

function formatTwo(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function formatMinuteKey(ts: number): string {
	const d = new Date(ts);
	const yyyy = d.getFullYear();
	const mm = formatTwo(d.getMonth() + 1);
	const dd = formatTwo(d.getDate());
	const hh = formatTwo(d.getHours());
	const min = formatTwo(d.getMinutes());
	return `${yyyy}-${mm}-${dd}/${hh}-${min}`;
}

function getLogDirectory(): string {
	if (app.isPackaged) {
		const userDataPath = app.getPath("userData");
		return path.join(userDataPath, "logs");
	}
	return path.join(process.cwd(), "logs");
}

const conversationMinuteById = new Map<string, string>();
const conversationSeqById = new Map<string, number>();

function sanitizePathComponent(raw: string): string {
	return String(raw || "")
		.trim()
		.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
		.slice(0, 120);
}

const SENSITIVE_HEADER_RE =
	/(^|[_-])(api[_-]?key|token|authorization|cookie|password|secret)([_-]|$)/i;

function redactHeaders(
	headers: Record<string, string>,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(headers)) {
		out[k] = SENSITIVE_HEADER_RE.test(k) ? "***" : v;
	}
	return out;
}

async function appendConversationHttpLog(entry: {
	conversationId: string;
	ts: number;
	seq: number;
	service: string;
	requestId?: string;
	method: string;
	url: string;
	request: {
		headers: Record<string, string>;
		body: string;
		bodyBytes: number;
		bodyTruncated: boolean;
	};
	response?: {
		status: number;
		ok: boolean;
		headers: Record<string, string>;
		body: string;
		bodyBytes: number;
		bodyTruncated: boolean;
	};
	error?: string;
	durationMs: number;
}) {
	const baseDir = path.join(getLogDirectory(), "conversations");
	const minuteKey =
		conversationMinuteById.get(entry.conversationId) ||
		formatMinuteKey(entry.ts);
	if (!conversationMinuteById.has(entry.conversationId)) {
		conversationMinuteById.set(entry.conversationId, minuteKey);
	}

	const safeConversationId = sanitizePathComponent(entry.conversationId);
	const dir = path.join(baseDir, minuteKey, safeConversationId);

	try {
		if (!fs.existsSync(dir)) {
			await fsp.mkdir(dir, { recursive: true });
		}
		const filePath = path.join(dir, "http.jsonl");
		await fsp.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
	} catch {
		// ignore logging failures
	}
}

export async function loggedFetch(
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	options: LoggedFetchOptions,
): Promise<Response> {
	const { logger, requestId, service, conversationId } = options;
	const readResponseBody = options.readResponseBody ?? true;
	const maxReqBytes = parsePositiveIntEnv(
		"LOG_HTTP_OUTBOUND_REQUEST_MAX_BYTES",
		2_000_000,
	);
	const maxResBytes = parsePositiveIntEnv(
		"LOG_HTTP_OUTBOUND_RESPONSE_MAX_BYTES",
		2_000_000,
	);

	const startedAt = performance.now();
	const method = (init?.method || "GET").toUpperCase();
	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.toString()
				: typeof (input as any)?.url === "string"
					? (input as any).url
					: String(input);

	const reqHeaders = new Headers(init?.headers as any);
	const reqBodyText = safeBodyToString(init?.body);
	const reqBody = truncateUtf8(reqBodyText, maxReqBytes);

	const conversationLogSeq = (() => {
		if (!conversationId) return null;
		const prev = conversationSeqById.get(conversationId) ?? 0;
		const next = prev + 1;
		conversationSeqById.set(conversationId, next);
		return next;
	})();

	let response: Response;
	try {
		response = await fetch(input as any, init);
	} catch (error) {
		logger?.error({
			scope: "http",
			event: "http_outbound_error",
			service,
			requestId,
			method,
			url,
			request: {
				headers: headersToObject(reqHeaders),
				body: reqBody.text,
				bodyBytes: reqBody.bytes,
				bodyTruncated: reqBody.truncated,
			},
			error: error instanceof Error ? error.message : String(error),
			durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
		});

		if (conversationId && conversationLogSeq) {
			void appendConversationHttpLog({
				conversationId,
				ts: Date.now(),
				seq: conversationLogSeq,
				service,
				requestId,
				method,
				url,
				request: {
					headers: redactHeaders(headersToObject(reqHeaders)),
					body: reqBody.text,
					bodyBytes: reqBody.bytes,
					bodyTruncated: reqBody.truncated,
				},
				error: error instanceof Error ? error.message : String(error),
				durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
			});
		}
		throw error;
	}

	let responseBodyText = "";
	let responseBodyTruncated = false;
	let responseBodyBytes = 0;

	if (readResponseBody) {
		try {
			const cloned = response.clone();
			const text = await cloned.text();
			const t = truncateUtf8(text, maxResBytes);
			responseBodyText = t.text;
			responseBodyTruncated = t.truncated;
			responseBodyBytes = t.bytes;
		} catch {
			// ignore body read errors (e.g. streaming)
		}
	}

	logger?.info({
		scope: "http",
		event: "http_outbound",
		service,
		requestId,
		conversationId,
		method,
		url,
		request: {
			headers: headersToObject(reqHeaders),
			body: reqBody.text,
			bodyBytes: reqBody.bytes,
			bodyTruncated: reqBody.truncated,
		},
		response: {
			status: response.status,
			ok: response.ok,
			headers: headersToObject(response.headers),
			body: responseBodyText,
			bodyBytes: responseBodyBytes,
			bodyTruncated: responseBodyTruncated,
		},
		durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
	});

	if (conversationId && conversationLogSeq) {
		void appendConversationHttpLog({
			conversationId,
			ts: Date.now(),
			seq: conversationLogSeq,
			service,
			requestId,
			method,
			url,
			request: {
				headers: redactHeaders(headersToObject(reqHeaders)),
				body: reqBody.text,
				bodyBytes: reqBody.bytes,
				bodyTruncated: reqBody.truncated,
			},
			response: {
				status: response.status,
				ok: response.ok,
				headers: redactHeaders(headersToObject(response.headers)),
				body: responseBodyText,
				bodyBytes: responseBodyBytes,
				bodyTruncated: responseBodyTruncated,
			},
			durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
		});
	}

	return response;
}
