import { performance } from "node:perf_hooks";
import type { Logger } from "../../logging/types";

type LoggedFetchOptions = {
	logger?: Logger;
	requestId?: string;
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

export async function loggedFetch(
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	options: LoggedFetchOptions,
): Promise<Response> {
	const { logger, requestId, service } = options;
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

	return response;
}
