/**
 * Providers IPC Handlers
 */
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { Provider, ProviderType } from "../../../shared/types";
import type { DbContext } from "../../db/client";
import {
	resolveProviderApiKey,
	invalidateProviderCache,
} from "../../llm/invoke";
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
		template_id: "cherryin",
		name: "CherryIN",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://open.cherryin.cc",
		models: [],
	},
	{
		template_id: "ovms",
		name: "OpenVINO Model Server",
		provider_type: "openai",
		is_enabled: false,
		api_base: "http://localhost:8000/v3/",
		models: [],
	},
	{
		template_id: "ocoolai",
		name: "ocoolAI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.ocoolai.com",
		models: [
			"deepseek-chat",
			"deepseek-reasoner",
			"gpt-4o",
			"claude-3-5-sonnet-20240620",
		],
	},
	{
		template_id: "alayanew",
		name: "AlayaNew",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://deepseek.alayanew.com",
		models: [],
	},
	{
		template_id: "aionly",
		name: "AIOnly",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.aiionly.com",
		models: [
			"claude-sonnet-4-6",
			"gpt-5.4",
			"gemini-3.1-pro-preview",
			"gemini-2.5-flash",
		],
	},
	{
		template_id: "burncloud",
		name: "BurnCloud",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://ai.burncloud.com",
		models: [
			"claude-sonnet-4-5-20250929",
			"gpt-5",
			"gemini-2.5-pro",
			"deepseek-chat",
		],
	},
	{
		template_id: "cephalon",
		name: "Cephalon",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://cephalon.cloud/user-center/v1/model",
		models: ["DeepSeek-R1"],
	},
	{
		template_id: "lanyun",
		name: "Lanyun",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://maas-api.lanyun.net",
		models: [
			"/maas/deepseek-ai/DeepSeek-R1-0528",
			"/maas/deepseek-ai/DeepSeek-V3-0324",
			"/maas/qwen/Qwen2.5-72B-Instruct",
		],
	},
	{
		template_id: "ph8",
		name: "PH8",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://ph8.co",
		models: ["deepseek-v3-241226", "deepseek-r1-250120"],
	},
	{
		template_id: "sophnet",
		name: "SophNet",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://www.sophnet.com/api/open-apis/v1",
		models: [],
	},
	{
		template_id: "dashscope",
		name: "阿里百炼",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://dashscope.aliyuncs.com/compatible-mode/v1/",
		models: ["qwen3.5-plus", "qwen3.5-flash", "qwen3-max"],
	},
	{
		template_id: "modelscope",
		name: "ModelScope",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api-inference.modelscope.cn/v1/",
		models: [
			"Qwen/Qwen2.5-72B-Instruct",
			"Qwen/Qwen2.5-Coder-32B-Instruct",
			"deepseek-ai/DeepSeek-R1",
			"deepseek-ai/DeepSeek-V3",
		],
	},
	{
		template_id: "doubao",
		name: "火山方舟",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://ark.cn-beijing.volces.com/api/v3/",
		models: [
			"doubao-seed-1-8-251228",
			"doubao-1-5-vision-pro-32k-250115",
			"doubao-1-5-pro-32k-250115",
			"doubao-1-5-pro-256k-250115",
		],
	},
	{
		template_id: "minimax",
		name: "MiniMax",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.minimaxi.com/v1/",
		models: [
			"MiniMax-M2.7",
			"MiniMax-M2.7-highspeed",
			"MiniMax-M2.5",
			"MiniMax-M2",
		],
	},
	{
		template_id: "minimax-global",
		name: "MiniMax Global",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.minimax.io/v1/",
		models: ["MiniMax-M2.7", "MiniMax-M2.5", "MiniMax-M2"],
	},
	{
		template_id: "baichuan",
		name: "百川智能",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.baichuan-ai.com",
		models: [
			"Baichuan4",
			"Baichuan4-Turbo",
			"Baichuan4-Air",
			"Baichuan-M2-Plus",
		],
	},
	{
		template_id: "stepfun",
		name: "阶跃星辰",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.stepfun.com",
		models: ["step-1-8k", "step-1-flash"],
	},
	{
		template_id: "yi",
		name: "零一万物",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.lingyiwanwu.com",
		models: ["yi-lightning", "yi-vision-v2"],
	},
	{
		template_id: "zai",
		name: "Z.ai",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.z.ai/api/paas/v4/",
		models: ["glm-5", "glm-4.7", "glm-4.6", "glm-4.5-flash"],
	},
	{
		template_id: "xirang",
		name: "Xirang",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://wishub-x1.ctyun.cn",
		models: [],
	},
	{
		template_id: "hunyuan",
		name: "腾讯混元",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.hunyuan.cloud.tencent.com",
		models: [
			"hunyuan-pro",
			"hunyuan-standard",
			"hunyuan-vision",
			"hunyuan-code",
		],
	},
	{
		template_id: "tencent-cloud-ti",
		name: "Tencent Cloud TI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.lkeap.cloud.tencent.com",
		models: ["deepseek-r1", "deepseek-v3"],
	},
	{
		template_id: "baidu-cloud",
		name: "Baidu Cloud",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://qianfan.baidubce.com/v2/",
		models: [
			"deepseek-r1",
			"deepseek-v3",
			"ernie-4.0-8k-latest",
			"ernie-4.0-turbo-8k-latest",
		],
	},
	{
		template_id: "voyageai",
		name: "VoyageAI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.voyageai.com",
		models: ["voyage-3-large", "voyage-3", "voyage-code-3", "rerank-2"],
	},
	{
		template_id: "qiniu",
		name: "七牛云 AI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.qnaigc.com",
		models: ["deepseek-r1", "deepseek-v3", "qwen2.5-72b-instruct", "qwq-32b"],
	},
	{
		template_id: "longcat",
		name: "LongCat",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.longcat.chat/openai",
		models: ["LongCat-Flash-Chat", "LongCat-Flash-Thinking"],
	},
	{
		template_id: "infini",
		name: "Infini AI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://cloud.infini-ai.com/maas",
		models: [
			"deepseek-r1",
			"deepseek-v3",
			"qwen2.5-72b-instruct",
			"qwen2.5-coder-32b-instruct",
		],
	},
	{
		template_id: "grok",
		name: "xAI Grok",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.x.ai",
		models: ["grok-4", "grok-3", "grok-3-fast", "grok-3-mini"],
	},
	{
		template_id: "nvidia",
		name: "NVIDIA NIM",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://integrate.api.nvidia.com",
		models: ["meta/llama-3.1-405b-instruct", "01-ai/yi-large"],
	},
	{
		template_id: "jina",
		name: "Jina AI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.jina.ai",
		models: [
			"jina-clip-v2",
			"jina-embeddings-v3",
			"jina-embeddings-v2-base-zh",
		],
	},
	{
		template_id: "ppio",
		name: "PPIO",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.ppinfra.com/v3/openai/",
		models: [
			"deepseek/deepseek-v3.2",
			"minimax/minimax-m2",
			"qwen/qwen3-235b-a22b-instruct-2507",
		],
	},
	{
		template_id: "302ai",
		name: "302.AI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.302.ai",
		models: [
			"deepseek-chat",
			"deepseek-reasoner",
			"gpt-4.1",
			"claude-sonnet-4-20250514",
		],
	},
	{
		template_id: "dmxapi",
		name: "DMXAPI",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://www.dmxapi.cn",
		models: [
			"gpt-4o",
			"gpt-4o-mini",
			"DMXAPI-DeepSeek-R1",
			"claude-3-5-sonnet-20241022",
		],
	},
	{
		template_id: "tokenflux",
		name: "TokenFlux",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.tokenflux.ai/openai/v1",
		models: [
			"claude-sonnet-4-6",
			"gpt-5.4",
			"gemini-3.1-pro-preview",
			"gemini-2.5-flash",
		],
	},
	{
		template_id: "huggingface",
		name: "Hugging Face",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://router.huggingface.co/v1/",
		models: [],
	},
	{
		template_id: "poe",
		name: "Poe",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.poe.com/v1/",
		models: ["Claude-Sonnet-4.6", "GPT-5.2", "Gemini-3.1-Pro", "Grok-4"],
	},
	{
		template_id: "mimo",
		name: "Xiaomi MiMo",
		provider_type: "openai",
		is_enabled: false,
		api_base: "https://api.xiaomimimo.com",
		models: ["mimo-v2.5", "mimo-v2.5-pro", "mimo-v2-flash", "mimo-v2-omni"],
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
				invalidateProviderCache();
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

		invalidateProviderCache();
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
		invalidateProviderCache();
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

		invalidateProviderCache();
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
