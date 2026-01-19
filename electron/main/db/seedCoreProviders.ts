import { randomUUID } from "node:crypto";
import type { DbContext } from "./client";

const CORE_PROVIDER_TEMPLATES: Array<{
	template_id: string;
	name: string;
	provider_type: string;
	is_enabled: boolean;
	api_base: string;
	models: string[];
}> = [
	{
		template_id: "openai",
		name: "OpenAI",
		provider_type: "openai",
		is_enabled: true,
		api_base: "https://api.openai.com/v1",
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
		api_base: "https://generativelanguage.googleapis.com/v1beta/openai",
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
		template_id: "dify",
		name: "Dify",
		provider_type: "dify",
		is_enabled: false,
		api_base: "https://api.dify.ai/v1",
		models: [],
	},
];

export async function seedCoreProviders(db: DbContext) {
	const timestamp = Date.now();
	let count = 0;

	for (const template of CORE_PROVIDER_TEMPLATES) {
		const existing = await db.client.execute({
			sql: `SELECT id FROM providers WHERE template_id = ?`,
			args: [template.template_id],
		});

		if (existing.rows.length > 0) continue;

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
		count += 1;
	}

	return { success: true, count };
}
