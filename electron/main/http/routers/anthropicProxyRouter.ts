/**
 * Anthropic 代理路由
 * 提供 Anthropic 兼容的 /v1/messages API，支持多 Provider 转发
 */
import type { Request, Response } from "express";
import { Router } from "express";
import type { DbContext } from "../../db/client";
import { type Logger } from "../../logging/types";
import { resolveProviderApiKey } from "../../llm/invoke";

// 内存文件存储（重启丢失）
const fileStore = new Map<
	string,
	{
		id: string;
		filename?: string;
		media_type?: string;
		size_bytes: number;
		content: Buffer;
		created_at: number;
	}
>();

interface AnthropicMessage {
	role: string;
	content:
		| string
		| Array<{
				type: string;
				text?: string;
				id?: string;
				name?: string;
				input?: unknown;
				tool_use_id?: string;
		  }>;
}

interface AnthropicRequest {
	model: string;
	messages: AnthropicMessage[];
	system?: string | Array<{ type: string; text: string }>;
	tools?: Array<{ name: string; description: string; input_schema?: unknown }>;
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
}

/**
 * 创建 Anthropic 代理路由
 */
export function createAnthropicProxyRouter(options?: {
	db?: DbContext;
	logger?: Logger;
}) {
	const router = Router();
	const { db, logger } = options || {};

	// 健康检查
	router.get("/health", (_req: Request, res: Response) => {
		res.json({ ok: true, service: "anthropic-proxy", ts: Date.now() });
	});

	// 模型列表
	router.get("/models", async (_req: Request, res: Response) => {
		try {
			const models: Array<{ type: string; id: string; display_name: string }> =
				[];

			if (db) {
				const rows = await db.client.execute(
					`SELECT models FROM providers WHERE is_enabled = 1`,
				);
				const modelSet = new Set<string>();
				for (const row of rows.rows) {
					try {
						const providerModels = JSON.parse(
							(row.models as string) || "[]",
						) as string[];
						for (const m of providerModels) {
							modelSet.add(m);
						}
					} catch {
						// ignore
					}
				}
				for (const m of modelSet) {
					models.push({ type: "model", id: m, display_name: m });
				}
			} else {
				// 默认模型列表
				models.push(
					{ type: "model", id: "gpt-4o", display_name: "GPT-4o" },
					{ type: "model", id: "gpt-4-turbo", display_name: "GPT-4 Turbo" },
				);
			}

			res.json({ data: models, has_more: false });
		} catch (error) {
			res
				.status(500)
				.json({ error: { type: "api_error", message: String(error) } });
		}
	});

	// 模型详情
	router.get("/models/:id", (req: Request, res: Response) => {
		res.json({
			type: "model",
			id: req.params.id,
			display_name: req.params.id,
			max_tokens: 8192,
		});
	});

	// Token 计数（占位）
	router.post("/messages/count_tokens", (_req: Request, res: Response) => {
		res.json({ input_tokens: 0 });
	});

	// Files API
	router.get("/files", (_req: Request, res: Response) => {
		const files = Array.from(fileStore.values()).map((f) => ({
			type: "file",
			id: f.id,
			filename: f.filename,
			media_type: f.media_type,
			size_bytes: f.size_bytes,
			created_at: f.created_at,
		}));
		res.json({ data: files, has_more: false });
	});

	router.post("/files", (_req: Request, res: Response) => {
		// 简化处理：从 body 中读取文件
		const id = `file_${crypto.randomUUID()}`;
		const now = Date.now();

		// 这里应该处理 multipart/form-data，暂时简化
		const file = {
			id,
			filename: "upload",
			media_type: "application/octet-stream",
			size_bytes: 0,
			content: Buffer.from([]),
			created_at: now,
		};
		fileStore.set(id, file);

		res.json({
			type: "file",
			id,
			filename: file.filename,
			media_type: file.media_type,
			size_bytes: file.size_bytes,
			created_at: file.created_at,
		});
	});

	router.get("/files/:id", (req: Request<{ id: string }>, res: Response) => {
		const file = fileStore.get(req.params.id);
		if (!file) {
			return res
				.status(404)
				.json({ error: { type: "not_found", message: "File not found" } });
		}
		res.json({
			type: "file",
			id: file.id,
			filename: file.filename,
			media_type: file.media_type,
			size_bytes: file.size_bytes,
			created_at: file.created_at,
		});
	});

	router.get(
		"/files/:id/content",
		(req: Request<{ id: string }>, res: Response) => {
			const file = fileStore.get(req.params.id);
			if (!file) {
				return res
					.status(404)
					.json({ error: { type: "not_found", message: "File not found" } });
			}
			res.setHeader("Content-Type", "application/binary");
			res.send(file.content);
		},
	);

	router.delete("/files/:id", (req: Request<{ id: string }>, res: Response) => {
		const existed = fileStore.has(req.params.id);
		fileStore.delete(req.params.id);
		if (existed) {
			res.json({ id: req.params.id, deleted: true });
		} else {
			res
				.status(404)
				.json({ error: { type: "not_found", message: "File not found" } });
		}
	});

	// 核心：消息 API
	router.post("/messages", async (req: Request, res: Response) => {
		const anthropicReq = req.body as AnthropicRequest;

		if (!db) {
			return res.status(501).json({
				error: {
					type: "not_implemented",
					message: "Database not available for proxy",
				},
			});
		}

		try {
			logger?.info({
				msg: "anthropic proxy request",
				model: anthropicReq.model,
			});

			// 1. 确定模型
			let model = anthropicReq.model;
			if (!model) {
				const activeRows = await db.client.execute({
					sql: `SELECT value FROM app_config WHERE key = 'active_model'`,
					args: [],
				});
				model =
					activeRows.rows.length > 0
						? (activeRows.rows[0].value as string)
						: "gpt-4o";
			}

			// 2. 查找 Provider
			const providerRows = await db.client.execute(
				`SELECT * FROM providers WHERE is_enabled = 1`,
			);
			let provider: {
				id: string;
				provider_type: string;
				api_key?: string;
				api_base?: string;
			} | null = null;

			for (const row of providerRows.rows) {
				const models = JSON.parse((row.models as string) || "[]") as string[];
				if (models.includes(model)) {
					provider = {
						id: row.id as string,
						provider_type: row.provider_type as string,
						api_key: row.api_key as string | undefined,
						api_base: row.api_base as string | undefined,
					};
					break;
				}
			}

			if (!provider) {
				return res.status(400).json({
					error: {
						type: "invalid_request_error",
						message: `No enabled provider found for model: ${model}`,
					},
				});
			}

			// 3. 构建请求并调用
			const resolvedApiKey = await resolveProviderApiKey(
				db,
				provider.id,
				provider.api_key,
			);
			const result = await callProvider(
				{ ...provider, api_key: resolvedApiKey },
				model,
				anthropicReq,
			);

			// 4. 返回响应（非流式）
			if (anthropicReq.stream) {
				// SSE 流式响应
				res.setHeader("Content-Type", "text/event-stream");
				res.setHeader("Cache-Control", "no-cache");
				res.setHeader("Connection", "keep-alive");

				sendSSEResponse(res, result);
			} else {
				res.json(result);
			}
		} catch (error) {
			logger?.error({ msg: "anthropic proxy error", error: String(error) });
			res.status(500).json({
				error: {
					type: "api_error",
					message: error instanceof Error ? error.message : String(error),
				},
			});
		}
	});

	return router;
}

/**
 * 调用 Provider API
 */
async function callProvider(
	provider: { provider_type: string; api_key?: string; api_base?: string },
	model: string,
	anthropicReq: AnthropicRequest,
): Promise<AnthropicResponse> {
	const messageId = `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

	// 转换 Anthropic 请求为 OpenAI 格式
	const openaiMessages = translateToOpenAI(anthropicReq);

	// 调用 OpenAI 兼容 API
	const baseUrl = provider.api_base || "https://api.openai.com/v1";
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (provider.provider_type === "anthropic") {
		// 直接转发到 Anthropic
		headers["x-api-key"] = provider.api_key || "";
		headers["anthropic-version"] = "2023-06-01";

		const response = await fetch(`${baseUrl}/v1/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify(anthropicReq),
		});

		if (!response.ok) {
			throw new Error(`Anthropic API error: ${response.status}`);
		}

		return (await response.json()) as AnthropicResponse;
	}

	// OpenAI 兼容调用
	headers.Authorization = `Bearer ${provider.api_key}`;

	const openaiReq = {
		model,
		messages: openaiMessages,
		temperature: anthropicReq.temperature ?? 0.7,
		max_tokens: anthropicReq.max_tokens ?? 4096,
		tools: anthropicReq.tools?.map((t) => ({
			type: "function" as const,
			function: {
				name: t.name,
				description: t.description,
				parameters: t.input_schema || { type: "object" },
			},
		})),
		tool_choice: anthropicReq.tools?.length ? "auto" : undefined,
	};

	const response = await fetch(`${baseUrl}/chat/completions`, {
		method: "POST",
		headers,
		body: JSON.stringify(openaiReq),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
	}

	const openaiResp = (await response.json()) as OpenAIResponse;

	// 转换回 Anthropic 格式
	return translateToAnthropic(messageId, model, openaiResp);
}

interface OpenAIResponse {
	choices: Array<{
		message: {
			role: string;
			content: string | null;
			tool_calls?: Array<{
				id: string;
				type: string;
				function: { name: string; arguments: string };
			}>;
		};
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

interface AnthropicResponse {
	id: string;
	type: "message";
	role: "assistant";
	content: Array<
		| { type: "text"; text: string }
		| { type: "tool_use"; id: string; name: string; input: unknown }
	>;
	model: string;
	stop_reason: "end_turn" | "tool_use" | "max_tokens";
	usage: { input_tokens: number; output_tokens: number };
}

/**
 * 翻译 Anthropic 请求为 OpenAI 格式
 */
function translateToOpenAI(
	anthropicReq: AnthropicRequest,
): Array<{ role: string; content: string; tool_call_id?: string }> {
	const messages: Array<{
		role: string;
		content: string;
		tool_call_id?: string;
	}> = [];

	// System message
	if (anthropicReq.system) {
		let systemContent = "";
		if (typeof anthropicReq.system === "string") {
			systemContent = anthropicReq.system;
		} else {
			systemContent = anthropicReq.system
				.filter((b) => b.type === "text")
				.map((b) => b.text)
				.join("\n");
		}
		if (systemContent) {
			messages.push({ role: "system", content: systemContent });
		}
	}

	// Messages
	for (const msg of anthropicReq.messages) {
		if (typeof msg.content === "string") {
			messages.push({ role: msg.role, content: msg.content });
		} else {
			// 处理 content blocks
			const textParts: string[] = [];
			for (const block of msg.content) {
				if (block.type === "text" && block.text) {
					textParts.push(block.text);
				} else if (block.type === "tool_result" && block.tool_use_id) {
					// tool_result 转为 tool role
					const resultContent =
						typeof block === "object" && "content" in block
							? String((block as { content?: unknown }).content ?? "")
							: "";
					messages.push({
						role: "tool",
						content: resultContent,
						tool_call_id: block.tool_use_id,
					});
				}
			}
			if (textParts.length > 0) {
				messages.push({ role: msg.role, content: textParts.join("\n") });
			}
		}
	}

	return messages;
}

/**
 * 翻译 OpenAI 响应为 Anthropic 格式
 */
function translateToAnthropic(
	messageId: string,
	model: string,
	openaiResp: OpenAIResponse,
): AnthropicResponse {
	const choice = openaiResp.choices[0];
	const content: AnthropicResponse["content"] = [];

	// 文本内容
	if (choice.message.content) {
		content.push({ type: "text", text: choice.message.content });
	}

	// 工具调用
	if (choice.message.tool_calls) {
		for (const tc of choice.message.tool_calls) {
			let input: unknown = {};
			try {
				input = JSON.parse(tc.function.arguments);
			} catch {
				input = { _raw: tc.function.arguments };
			}
			content.push({
				type: "tool_use",
				id: tc.id,
				name: tc.function.name,
				input,
			});
		}
	}

	// 停止原因
	let stopReason: AnthropicResponse["stop_reason"] = "end_turn";
	if (
		choice.finish_reason === "tool_calls" ||
		choice.message.tool_calls?.length
	) {
		stopReason = "tool_use";
	} else if (choice.finish_reason === "length") {
		stopReason = "max_tokens";
	}

	return {
		id: messageId,
		type: "message",
		role: "assistant",
		content,
		model,
		stop_reason: stopReason,
		usage: openaiResp.usage
			? {
					input_tokens: openaiResp.usage.prompt_tokens,
					output_tokens: openaiResp.usage.completion_tokens,
				}
			: { input_tokens: 0, output_tokens: 0 },
	};
}

/**
 * 发送 SSE 流式响应
 */
function sendSSEResponse(res: Response, message: AnthropicResponse) {
	// message_start
	res.write(`event: message_start\n`);
	res.write(
		`data: ${JSON.stringify({
			type: "message_start",
			message: {
				id: message.id,
				type: "message",
				role: "assistant",
				content: [],
				model: message.model,
				usage: { input_tokens: message.usage.input_tokens, output_tokens: 0 },
			},
		})}\n\n`,
	);

	// content blocks
	message.content.forEach((block, index) => {
		// content_block_start
		res.write(`event: content_block_start\n`);
		res.write(
			`data: ${JSON.stringify({
				type: "content_block_start",
				index,
				content_block:
					block.type === "text" ? { type: "text", text: "" } : block,
			})}\n\n`,
		);

		// content_block_delta
		if (block.type === "text") {
			res.write(`event: content_block_delta\n`);
			res.write(
				`data: ${JSON.stringify({
					type: "content_block_delta",
					index,
					delta: { type: "text_delta", text: block.text },
				})}\n\n`,
			);
		} else if (block.type === "tool_use") {
			res.write(`event: content_block_delta\n`);
			res.write(
				`data: ${JSON.stringify({
					type: "content_block_delta",
					index,
					delta: {
						type: "input_json_delta",
						partial_json: JSON.stringify(block.input),
					},
				})}\n\n`,
			);
		}

		// content_block_stop
		res.write(`event: content_block_stop\n`);
		res.write(
			`data: ${JSON.stringify({ type: "content_block_stop", index })}\n\n`,
		);
	});

	// message_delta
	res.write(`event: message_delta\n`);
	res.write(
		`data: ${JSON.stringify({
			type: "message_delta",
			delta: { stop_reason: message.stop_reason },
			usage: { output_tokens: message.usage.output_tokens },
		})}\n\n`,
	);

	// message_stop
	res.write(`event: message_stop\n`);
	res.write(`data: ${JSON.stringify({ type: "message_stop" })}\n\n`);

	res.end();
}
