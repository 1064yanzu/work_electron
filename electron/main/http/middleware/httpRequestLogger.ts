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
	// 非流式响应默认捕获上限 256KB(原 2MB),可用环境变量覆盖
	const maxReqBytes = parsePositiveIntEnv(
		"LOG_HTTP_REQUEST_MAX_BYTES",
		262_144,
	);
	const maxResBytes = parsePositiveIntEnv(
		"LOG_HTTP_RESPONSE_MAX_BYTES",
		262_144,
	);
	// SSE/流式响应仅保留前 64KB 预览 + 总字节数 + chunk 数摘要
	const streamPreviewBytes = parsePositiveIntEnv(
		"LOG_HTTP_STREAM_PREVIEW_MAX_BYTES",
		65_536,
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

		let responseBodyBytes = 0; // 响应总字节数(增量累加,O(n))
		let capturedBytes = 0; // 已捕获进 capturedChunks 的字节数(增量计数器)
		const capturedChunks: Buffer[] = [];
		let responseBodyTruncated = false;
		let chunkCount = 0; // 收到的 chunk(事件)数
		let writeCalls = 0; // 经 res.write 写入的次数,>=2 视为流式特征
		let captured = false;
		let jsonBodyText = "";

		const captureChunk = (chunk: unknown, viaWrite: boolean) => {
			if (captured) return;
			if (chunk === undefined || chunk === null) return;

			let buf: Buffer | null = null;
			if (Buffer.isBuffer(chunk)) buf = chunk;
			else if (typeof chunk === "string") buf = Buffer.from(chunk);
			else if (typeof chunk === "object")
				buf = Buffer.from(safeJsonStringify(chunk));

			if (!buf) return;
			chunkCount += 1;
			if (viaWrite) writeCalls += 1;
			responseBodyBytes += buf.length;
			if (maxResBytes > 0) {
				if (capturedBytes >= maxResBytes) {
					responseBodyTruncated = true;
					return;
				}
				const remaining = maxResBytes - capturedBytes;
				const slice = buf.length > remaining ? buf.subarray(0, remaining) : buf;
				capturedChunks.push(slice);
				capturedBytes += slice.length;
				if (slice.length < buf.length) responseBodyTruncated = true;
			} else {
				capturedChunks.push(buf);
				capturedBytes += buf.length;
			}
		};

		const isStreamingResponse = () => {
			const ct = res.getHeader("content-type");
			const ctStr = Array.isArray(ct) ? ct.join(",") : String(ct ?? "");
			if (/text\/event-stream|application\/x-ndjson/i.test(ctStr)) return true;
			return writeCalls >= 2;
		};

		const originalJson = res.json.bind(res);
		(res as any).json = (body: unknown) => {
			captured = true;
			const s = safeJsonStringify(body);
			const t = truncateUtf8(s, maxResBytes);
			jsonBodyText = t.text;
			responseBodyBytes = t.bytes;
			responseBodyTruncated = t.truncated;
			return originalJson(body as any);
		};

		const originalSend = res.send.bind(res);
		(res as any).send = (body: unknown) => {
			captureChunk(body, false);
			return originalSend(body as any);
		};

		const originalWrite = res.write.bind(res);
		(res as any).write = (chunk: any, ...args: any[]) => {
			captureChunk(chunk, true);
			return originalWrite(chunk, ...args);
		};

		const originalEnd = res.end.bind(res);
		(res as any).end = (chunk: any, ...args: any[]) => {
			captureChunk(chunk, false);
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

			// 组装响应 body:res.json 路径已生成文本;其余路径把捕获的 chunk 一次性拼接。
			// 流式响应(SSE/ndjson/多次 write)只保留前 streamPreviewBytes 预览 + 摘要。
			const streaming = !captured && isStreamingResponse();
			let responseBodyText: string;
			if (captured) {
				responseBodyText = jsonBodyText;
			} else {
				let previewChunks = capturedChunks;
				let previewBytes = capturedBytes;
				if (
					streaming &&
					streamPreviewBytes > 0 &&
					capturedBytes > streamPreviewBytes
				) {
					previewChunks = [];
					previewBytes = 0;
					for (const c of capturedChunks) {
						const remaining = streamPreviewBytes - previewBytes;
						if (remaining <= 0) break;
						const slice = c.length > remaining ? c.subarray(0, remaining) : c;
						previewChunks.push(slice);
						previewBytes += slice.length;
					}
				}
				responseBodyText = Buffer.concat(previewChunks).toString("utf8");
				if (responseBodyBytes > previewBytes) {
					responseBodyTruncated = true;
					responseBodyText += streaming
						? `…(stream preview, total ${responseBodyBytes} bytes, ${chunkCount} chunks)`
						: `…(truncated ${responseBodyBytes - previewBytes} bytes)`;
				}
			}

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
					stream: streaming,
					chunkCount,
				},
				durationMs,
			});
		};

		res.on("finish", () => logOnce("finish"));
		res.on("close", () => logOnce("close"));

		next();
	};
}
