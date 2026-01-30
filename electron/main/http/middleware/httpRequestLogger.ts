import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Logger } from "../../logging/types";

type CreateHttpRequestLoggerOptions = {
	logger: Logger;
	service: string;
};

function parsePositiveIntEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n < 0) return fallback;
	return n;
}

function normalizeHeaders(
	headers: Request["headers"],
): Record<string, string | string[] | undefined> {
	const out: Record<string, string | string[] | undefined> = {};
	for (const [k, v] of Object.entries(headers)) {
		out[k.toLowerCase()] = v as any;
	}
	return out;
}

function safeJsonStringify(value: unknown): string {
	try {
		const result = JSON.stringify(value);
		// JSON.stringify(undefined) 返回 undefined,需要转换为字符串
		return result === undefined ? "undefined" : result;
	} catch {
		return '"[unserializable]"';
	}
}

function truncateUtf8(input: string, maxBytes: number) {
	// 处理 undefined 或 null 的情况
	if (input === undefined || input === null) {
		return {
			text: "",
			truncated: false,
			bytes: 0,
		};
	}

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

export function createHttpRequestLogger(
	options: CreateHttpRequestLoggerOptions,
) {
	const { logger, service } = options;
	const maxReqBytes = parsePositiveIntEnv(
		"LOG_HTTP_REQUEST_MAX_BYTES",
		2_000_000,
	);
	const maxResBytes = parsePositiveIntEnv(
		"LOG_HTTP_RESPONSE_MAX_BYTES",
		2_000_000,
	);

	return function httpRequestLogger(
		req: Request,
		res: Response,
		next: NextFunction,
	) {
		const requestId =
			(typeof req.headers["x-request-id"] === "string" &&
				req.headers["x-request-id"]) ||
			randomUUID();
		(req as any).requestId = requestId;
		res.setHeader("x-request-id", requestId);

		const startedAt = performance.now();
		const requestHeaders = normalizeHeaders(req.headers);

		let responseBodyBytes = 0;
		let responseBodyText = "";
		let responseBodyTruncated = false;
		let captured = false;

		const captureChunk = (chunk: unknown) => {
			if (captured) return;
			if (chunk === undefined || chunk === null) return;

			let buf: Buffer | null = null;
			if (Buffer.isBuffer(chunk)) buf = chunk;
			else if (typeof chunk === "string") buf = Buffer.from(chunk);
			else if (typeof chunk === "object")
				buf = Buffer.from(safeJsonStringify(chunk));

			if (!buf) return;
			responseBodyBytes += buf.length;
			if (
				maxResBytes > 0 &&
				Buffer.byteLength(responseBodyText, "utf8") >= maxResBytes
			) {
				responseBodyTruncated = true;
				return;
			}
			const remaining =
				maxResBytes > 0
					? Math.max(
						0,
						maxResBytes - Buffer.byteLength(responseBodyText, "utf8"),
					)
					: buf.length;
			const slice = maxResBytes > 0 ? buf.subarray(0, remaining) : buf;
			responseBodyText += slice.toString("utf8");
			if (maxResBytes > 0 && buf.length > slice.length)
				responseBodyTruncated = true;
		};

		const originalJson = res.json.bind(res);
		(res as any).json = (body: unknown) => {
			captured = true;
			const s = safeJsonStringify(body);
			const t = truncateUtf8(s, maxResBytes);
			responseBodyText = t.text;
			responseBodyBytes = t.bytes;
			responseBodyTruncated = t.truncated;
			return originalJson(body as any);
		};

		const originalSend = res.send.bind(res);
		(res as any).send = (body: unknown) => {
			captureChunk(body);
			return originalSend(body as any);
		};

		const originalWrite = res.write.bind(res);
		(res as any).write = (chunk: any, ...args: any[]) => {
			captureChunk(chunk);
			return originalWrite(chunk, ...args);
		};

		const originalEnd = res.end.bind(res);
		(res as any).end = (chunk: any, ...args: any[]) => {
			captureChunk(chunk);
			return originalEnd(chunk, ...args);
		};

		let logged = false;
		const logOnce = (termination: "finish" | "close") => {
			if (logged) return;
			logged = true;
			const durationMs =
				Math.round((performance.now() - startedAt) * 1000) / 1000;

			const reqBodyString = safeJsonStringify(req.body);
			const reqBody = truncateUtf8(reqBodyString, maxReqBytes);

			logger.info({
				scope: "http",
				event: "http_transaction",
				service,
				requestId,
				termination,
				method: req.method,
				url: req.originalUrl,
				path: req.path,
				query: req.query,
				params: req.params,
				ip: req.ip,
				userAgent: req.get("user-agent"),
				request: {
					headers: requestHeaders,
					body: reqBody.text,
					bodyBytes: reqBody.bytes,
					bodyTruncated: reqBody.truncated,
				},
				response: {
					status: res.statusCode,
					headers: normalizeHeaders(res.getHeaders() as any),
					body: responseBodyText,
					bodyBytes: responseBodyBytes,
					bodyTruncated: responseBodyTruncated,
				},
				durationMs,
			});
		};

		res.on("finish", () => logOnce("finish"));
		res.on("close", () => logOnce("close"));

		next();
	};
}
