/**
 * Providers IPC Handlers
 */
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { Provider, ProviderType } from "../../../shared/types";
import type { DbContext } from "../../db/client";
import { resolveProviderApiKey } from "../../llm/invoke";
import {
	getOpenAICompatibleAuthHeaders,
	normalizeAnthropicBaseUrl,
	normalizeOpenAICompatibleBaseUrl,
} from "../../llm/providerHttp";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

/** 核心 Provider 模板 */
const CORE_PROVIDER_TEMPLATES: Array<{
	template_id: string;
	name: string;
	provider_type: ProviderType;
	is_enabled: boolean;
	api_base: string;
	models: string[];
}> = [
	{
		template_id: "openai",
		name: "OpenAI",
		provider_type: "openai",
		is_enabled: true,
		api_base: "https://api.openai.com",
		models: ["gpt-5", "gpt-5-mini", "gpt-4.1", "o3-mini", "gpt-4o"],
	},
	{
		template_id: "anthropic",
		name: "Claude (Anthropic)",
		provider_type: "anthropic",
		is_enabled: false,
		api_base: "https://api.anthropic.com",
		models: [
			"claude-sonnet-4-5",
			"claude-opus-4-5",
			"claude-3.7-sonnet",
			"claude-3.5-sonnet",
			"claude-3-haiku",
		],
	},
	{
		template_id: "gemini",
		name: "Google Gemini",
		provider_type: "custom",
		is_enabled: false,
		api_base: "https://generativelanguage.googleapis.com",
		models: [
			"gemini-2.5-flash",
			"gemini-2.0-flash-exp",
			"gemini-1.5-pro",
			"gemini-1.5-flash",
		],
	},
	{
		template_id: "deepseek",
		name: "DeepSeek",
		provider_type: "deepseek",
		is_enabled: false,
		api_base: "https://api.deepseek.com",
		models: ["deepseek-chat", "deepseek-reasoner", "deepseek-r1"],
	},
	{
		template_id: "zhipu",
		name: "智谱 AI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://open.bigmodel.cn/api/paas/v4/",
		models: ["glm-4-plus", "glm-4-0520", "glm-4-flash", "glm-4-air"],
	},
	{
		template_id: "moonshot",
		name: "月之暗面",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.moonshot.cn",
		models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
	},
	{
		template_id: "silicon",
		name: "Silicon Flow",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.siliconflow.cn",
		models: [
			"deepseek-ai/DeepSeek-V3",
			"Qwen/Qwen2.5-72B-Instruct",
			"meta-llama/Llama-3.3-70B-Instruct",
		],
	},
	{
		template_id: "aihubmix",
		name: "AiHubMix",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://aihubmix.com",
		models: [],
	},
	{
		template_id: "openrouter",
		name: "OpenRouter",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://openrouter.ai/api/v1/",
		models: [],
	},
	{
		template_id: "together",
		name: "Together AI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.together.xyz",
		models: [
			"meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
			"meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
		],
	},
	{
		template_id: "groq",
		name: "Groq",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.groq.com/openai",
		models: [
			"llama-3.3-70b-versatile",
			"llama-3.1-70b-versatile",
			"mixtral-8x7b-32768",
		],
	},
	{
		template_id: "fireworks",
		name: "Fireworks AI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.fireworks.ai/inference",
		models: ["accounts/fireworks/models/llama-v3p3-70b-instruct"],
	},
	{
		template_id: "mistral",
		name: "Mistral AI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.mistral.ai",
		models: [
			"mistral-large-latest",
			"mistral-medium-latest",
			"mistral-small-latest",
		],
	},
	{
		template_id: "ollama",
		name: "Ollama",
		provider_type: "custom",
		is_enabled: false,
		api_base: "http://localhost:11434",
		models: [],
	},
	{
		template_id: "lmstudio",
		name: "LM Studio",
		provider_type: "openai",
		is_enabled: false,
		api_base: "http://localhost:1234",
		models: [],
	},
	{
		template_id: "newapi",
		name: "New API",
		provider_type: "openai",
		is_enabled: false,
		api_base: "http://localhost:3000",
		models: [],
	},
	{
		template_id: "github",
		name: "GitHub Models",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://models.github.ai/inference",
		models: ["gpt-4o", "gpt-4o-mini", "o1-preview", "o1-mini"],
	},
	{
		template_id: "perplexity",
		name: "Perplexity",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.perplexity.ai/",
		models: [
			"llama-3.1-sonar-large-128k-online",
			"llama-3.1-sonar-small-128k-online",
		],
	},
	{
		template_id: "cerebras",
		name: "Cerebras AI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.cerebras.ai/v1",
		models: ["llama3.1-8b", "llama3.1-70b"],
	},
	{
		template_id: "hyperbolic",
		name: "Hyperbolic",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.hyperbolic.xyz",
		models: ["meta-llama/Meta-Llama-3.1-70B-Instruct"],
	},
	{
		template_id: "dify",
		name: "Dify",
		provider_type: "dify",
		is_enabled: false,
		api_base: "https://api.dify.ai/v1",
		models: [],
	},
];

function parseProvider(row: Record<string, unknown>): Provider {
	let models: string[] = [];
	let metadata: Record<string, unknown> = {};
	try {
		models = JSON.parse((row.models as string) || "[]");
	} catch {
		models = [];
	}
	try {
		metadata = JSON.parse((row.metadata as string) || "{}");
	} catch {
		metadata = {};
	}

	return {
		id: row.id as string,
		name: row.name as string,
		provider_type: row.provider_type as ProviderType,
		is_enabled: Boolean(row.is_enabled),
		api_key: row.api_key as string | undefined,
		api_base: row.api_base as string | undefined,
		models,
		metadata,
		template_id: row.template_id as string | undefined,
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
	};
}

export function createProviderHandlers(db: DbContext) {
	const now = () => Date.now();

	const listProviders: Handler<"list_providers"> = async () => {
		const rows = await db.client.execute(
			`SELECT * FROM providers ORDER BY created_at ASC`,
		);
		return rows.rows.map((row) =>
			parseProvider(row as Record<string, unknown>),
		);
	};

	const upsertProvider: Handler<"upsert_provider"> = async (_event, input) => {
		const timestamp = now();
		const id = input.id ?? randomUUID();
		const models = JSON.stringify(input.models ?? []);
		const metadata = JSON.stringify(input.metadata ?? {});

		// 尝试更新
		if (input.id) {
			const existing = await db.client.execute({
				sql: `SELECT id FROM providers WHERE id = ?`,
				args: [input.id],
			});

			if (existing.rows.length > 0) {
				await db.client.execute({
					sql: `UPDATE providers SET 
                  name = ?, provider_type = ?, is_enabled = ?, 
                  api_key = ?, api_base = ?, models = ?, metadata = ?,
                  template_id = ?, updated_at = ?
                WHERE id = ?`,
					args: [
						input.name,
						input.provider_type,
						(input.is_enabled ?? true) ? 1 : 0,
						input.api_key ?? null,
						input.api_base ?? null,
						models,
						metadata,
						input.template_id ?? null,
						timestamp,
						input.id,
					],
				});

				const rows = await db.client.execute({
					sql: `SELECT * FROM providers WHERE id = ?`,
					args: [input.id],
				});
				return parseProvider(rows.rows[0] as Record<string, unknown>);
			}
		}

		// 新建
		await db.client.execute({
			sql: `INSERT INTO providers (id, name, provider_type, is_enabled, api_key, api_base, models, metadata, template_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.name,
				input.provider_type,
				(input.is_enabled ?? true) ? 1 : 0,
				input.api_key ?? null,
				input.api_base ?? null,
				models,
				metadata,
				input.template_id ?? null,
				timestamp,
				timestamp,
			],
		});

		return {
			id,
			name: input.name,
			provider_type: input.provider_type,
			is_enabled: input.is_enabled ?? true,
			api_key: input.api_key,
			api_base: input.api_base,
			models: input.models ?? [],
			metadata: input.metadata ?? {},
			template_id: input.template_id,
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const deleteProvider: Handler<"delete_provider"> = async (_event, input) => {
		await db.client.execute({
			sql: `DELETE FROM providers WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	const checkProviderApiKey: Handler<"check_provider_api_key"> = async (
		_event,
		input,
	) => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM providers WHERE id = ?`,
			args: [input.provider_id],
		});
		if (rows.rows.length === 0) {
			return { valid: false, error: "Provider 未找到" };
		}

		const provider = parseProvider(rows.rows[0] as Record<string, unknown>);

		const apiKey = await resolveProviderApiKey(
			db,
			provider.id,
			provider.api_key,
		);
		if (!apiKey) {
			return { valid: false, error: "未配置可用 API Key" };
		}

		const apiBase = provider.api_base?.trim();
		if (!apiBase) {
			return { valid: false, error: "未配置 API Base" };
		}

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		const url = (() => {
			if (provider.provider_type === "anthropic") {
				const base = normalizeAnthropicBaseUrl(
					apiBase,
					"https://api.anthropic.com",
				);
				headers["x-api-key"] = apiKey;
				headers["anthropic-version"] = "2023-06-01";
				return `${base}/v1/models`;
			}
			const base = normalizeOpenAICompatibleBaseUrl(
				provider,
				"https://api.openai.com",
			);
			Object.assign(headers, getOpenAICompatibleAuthHeaders(provider, apiKey));
			return `${base}/models`;
		})();

		const response = await fetch(url, { method: "GET", headers });
		if (!response.ok) {
			const errorText = await response.text();
			return {
				valid: false,
				error: `API 验证失败 ${response.status}: ${errorText}`,
			};
		}
		return { valid: true };
	};

	const resetCoreProviders: Handler<"reset_core_providers"> = async () => {
		const timestamp = now();
		let count = 0;

		for (const template of CORE_PROVIDER_TEMPLATES) {
			// 检查是否存在同 template_id 的 provider
			const existing = await db.client.execute({
				sql: `SELECT id FROM providers WHERE template_id = ?`,
				args: [template.template_id],
			});

			if (existing.rows.length === 0) {
				// 不存在则创建
				const id = randomUUID();
				await db.client.execute({
					sql: `INSERT INTO providers (id, name, provider_type, is_enabled, api_base, models, metadata, template_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)`,
					args: [
						id,
						template.name,
						template.provider_type,
						template.is_enabled ? 1 : 0,
						template.api_base,
						JSON.stringify(template.models),
						template.template_id,
						timestamp,
						timestamp,
					],
				});
				count++;
			}
		}

		return { success: true, count };
	};

	return {
		list_providers: listProviders,
		upsert_provider: upsertProvider,
		delete_provider: deleteProvider,
		check_provider_api_key: checkProviderApiKey,
		reset_core_providers: resetCoreProviders,
	};
}
