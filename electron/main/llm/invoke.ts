/**
 * LLM 调用服务
 * 支持多 Provider、非流式和流式调用
 */
import type { BrowserWindow } from "electron";
import type { DbContext } from "../db/client";

const DEFAULT_MODEL = "gpt-4o";

/** Provider 类型 */
type ProviderType =
	| "openai"
	| "anthropic"
	| "deepseek"
	| "ollama"
	| "dify"
	| "custom";

interface Provider {
	id: string;
	name: string;
	provider_type: ProviderType;
	is_enabled: boolean;
	api_key?: string;
	api_base?: string;
	models: string[];
	metadata: Record<string, unknown>;
	template_id?: string;
	created_at: number;
	updated_at: number;
}

interface StreamChunk {
	content: string;
	done: boolean;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

interface LlmCallOptions {
	model: string;
	prompt: string;
	context?: string[];
	temperature?: number;
}

interface LlmCallResult {
	content: string;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/**
 * 获取活跃模型
 */
async function getActiveModel(db: DbContext): Promise<string> {
	const rows = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = 'active_model'`,
		args: [],
	});
	if (rows.rows.length === 0) return DEFAULT_MODEL;
	return (rows.rows[0].value as string) || DEFAULT_MODEL;
}

/**
 * 根据模型查找 Provider
 */
async function findProviderForModel(
	db: DbContext,
	model: string,
): Promise<Provider | null> {
	const rows = await db.client.execute(
		`SELECT * FROM providers WHERE is_enabled = 1`,
	);

	for (const row of rows.rows) {
		let models: string[] = [];
		try {
			models = JSON.parse((row.models as string) || "[]");
		} catch {
			continue;
		}
		if (models.includes(model)) {
			let metadata: Record<string, unknown> = {};
			try {
				metadata = JSON.parse((row.metadata as string) || "{}");
			} catch {
				metadata = {};
			}
			return {
				id: row.id as string,
				name: row.name as string,
				provider_type: row.provider_type as ProviderType,
				is_enabled: true,
				api_key: row.api_key as string | undefined,
				api_base: row.api_base as string | undefined,
				models,
				metadata,
				template_id: row.template_id as string | undefined,
				created_at: row.created_at as number,
				updated_at: row.updated_at as number,
			};
		}
	}
	return null;
}

/**
 * 构建系统上下文消息
 */
function buildContextMessage(context?: string[]): string | null {
	if (!context || context.length === 0) return null;
	return `以下是相关上下文信息：\n\n${context.join("\n\n---\n\n")}`;
}

/**
 * 调用 OpenAI 兼容 API
 */
async function callOpenAICompatible(
	provider: Provider,
	model: string,
	prompt: string,
	context?: string[],
	temperature?: number,
): Promise<LlmCallResult> {
	const baseUrl = provider.api_base || "https://api.openai.com/v1";
	const url = `${baseUrl}/chat/completions`;

	const messages: Array<{ role: string; content: string }> = [];

	// 添加上下文作为 system 消息
	const contextMsg = buildContextMessage(context);
	if (contextMsg) {
		messages.push({ role: "system", content: contextMsg });
	}

	// 添加用户消息
	messages.push({ role: "user", content: prompt });

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${provider.api_key}`,
		},
		body: JSON.stringify({
			model,
			messages,
			temperature: temperature ?? 0.7,
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`LLM call failed: ${response.status} - ${error}`);
	}

	const data = (await response.json()) as {
		choices: Array<{ message: { content: string } }>;
		usage?: {
			prompt_tokens: number;
			completion_tokens: number;
			total_tokens: number;
		};
	};

	return {
		content: data.choices[0]?.message?.content || "",
		usage: data.usage,
	};
}

/**
 * 调用 Anthropic API
 */
async function callAnthropic(
	provider: Provider,
	model: string,
	prompt: string,
	context?: string[],
	temperature?: number,
): Promise<LlmCallResult> {
	const baseUrl = provider.api_base || "https://api.anthropic.com";
	const url = `${baseUrl}/v1/messages`;

	// 构建用户消息（包含上下文）
	let userContent = prompt;
	const contextMsg = buildContextMessage(context);
	if (contextMsg) {
		userContent = `${contextMsg}\n\n---\n\n${prompt}`;
	}

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": provider.api_key || "",
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model,
			messages: [{ role: "user", content: userContent }],
			max_tokens: 4096,
			temperature: temperature ?? 0.7,
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Anthropic call failed: ${response.status} - ${error}`);
	}

	const data = (await response.json()) as {
		content: Array<{ type: string; text?: string }>;
		usage?: {
			input_tokens: number;
			output_tokens: number;
		};
	};

	const textContent = data.content
		.filter((c) => c.type === "text")
		.map((c) => c.text || "")
		.join("");

	return {
		content: textContent,
		usage: data.usage
			? {
					prompt_tokens: data.usage.input_tokens,
					completion_tokens: data.usage.output_tokens,
					total_tokens: data.usage.input_tokens + data.usage.output_tokens,
				}
			: undefined,
	};
}

/**
 * 调用 Ollama API
 */
async function callOllama(
	provider: Provider,
	model: string,
	prompt: string,
	_context?: string[],
	_temperature?: number,
): Promise<LlmCallResult> {
	const baseUrl = provider.api_base || "http://localhost:11434";
	const url = `${baseUrl}/api/chat`;

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model,
			messages: [{ role: "user", content: prompt }],
			stream: false,
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Ollama call failed: ${response.status} - ${error}`);
	}

	const data = (await response.json()) as {
		message: { content: string };
	};

	return { content: data.message?.content || "" };
}

/**
 * 非流式 LLM 调用
 */
export async function invokeLlm(
	db: DbContext,
	options: LlmCallOptions,
): Promise<LlmCallResult> {
	// 确定实际使用的模型
	let model = options.model;
	if (!model) {
		model = await getActiveModel(db);
	}

	// 查找 Provider
	let provider = await findProviderForModel(db, model);
	if (!provider) {
		// 回退到活跃模型
		const activeModel = await getActiveModel(db);
		provider = await findProviderForModel(db, activeModel);
		if (provider) {
			model = activeModel;
		}
	}

	if (!provider) {
		throw new Error(
			`No enabled provider found for model: requested=${options.model} effective=${model}`,
		);
	}

	// 根据 provider_type 分流
	switch (provider.provider_type) {
		case "anthropic":
			return callAnthropic(
				provider,
				model,
				options.prompt,
				options.context,
				options.temperature,
			);
		case "ollama":
			return callOllama(
				provider,
				model,
				options.prompt,
				options.context,
				options.temperature,
			);
		default:
			return callOpenAICompatible(
				provider,
				model,
				options.prompt,
				options.context,
				options.temperature,
			);
	}
}

/**
 * 流式 LLM 调用
 * 通过事件发送到渲染进程
 */
export async function invokeLlmStream(
	db: DbContext,
	mainWindow: BrowserWindow | null,
	options: LlmCallOptions,
): Promise<{ started: boolean }> {
	if (!mainWindow) {
		throw new Error("No main window available for streaming");
	}

	// 异步执行流式调用
	(async () => {
		try {
			// 简化实现：先获取完整结果，再模拟流式输出
			const result = await invokeLlm(db, options);

			// 模拟流式输出
			const chunkSize = 20;
			const content = result.content;

			for (let i = 0; i < content.length; i += chunkSize) {
				const chunk: StreamChunk = {
					content: content.slice(i, i + chunkSize),
					done: false,
				};
				mainWindow.webContents.send("llm-stream-chunk", chunk);
				await new Promise((resolve) => setTimeout(resolve, 20));
			}

			// 发送完成事件
			const finalChunk: StreamChunk = {
				content: "",
				done: true,
				usage: result.usage,
			};
			mainWindow.webContents.send("llm-stream-chunk", finalChunk);
		} catch (error) {
			// 发送错误作为文本
			const errorChunk: StreamChunk = {
				content: `Error: ${error instanceof Error ? error.message : String(error)}`,
				done: true,
			};
			mainWindow.webContents.send("llm-stream-chunk", errorChunk);
		}
	})();

	return { started: true };
}
