/**
 * Agent 记忆服务（增强版）
 *
 * 核心改进：
 * 1. LLM 辅助提取 - 不再仅靠正则，使用 LLM 深度分析对话提取有意义的记忆
 * 2. 全对话分析 - 分析完整对话（用户+助手），不仅是用户初始 prompt
 * 3. 增强记忆分类 - 新增 instruction（用户指令）和 context（项目上下文）
 * 4. 更智能搜索 - 关键词分词 + 多字段匹配
 * 5. 更大注入上下文 - 从 1000 字符提升到 3000 字符
 * 6. 记忆衰减 - 长期不访问的记忆权重自动降低
 */
import { randomUUID } from "node:crypto";
import type { DbContext } from "../../db/client";

const now = () => Date.now();
const ONE_DAY_MS = 86400_000;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

// 记忆分类
export type MemoryCategory =
	| "preference"
	| "fact"
	| "task_result"
	| "user_habit"
	| "instruction"
	| "context";

// 数据库行记录类型
interface AgentMemoryRow {
	id: string;
	key: string;
	content: string;
	category: string | null;
	relevance_score: number;
	created_at: number;
	updated_at: number;
	last_accessed_at: number | null;
	access_count: number;
}

// 记忆上下文构建选项
export interface BuildMemoryContextOptions {
	/** 按分类过滤 */
	categories?: MemoryCategory[];
	/** 最多返回记忆数 */
	limit?: number;
	/** 最低相关性分数阈值 */
	minRelevanceScore?: number;
	/** 当前用户查询（用于相关性排序） */
	query?: string;
	/** 最大输出字符数 */
	maxChars?: number;
}

// 用于提取记忆的消息结构
export interface ConversationMessage {
	role: "user" | "assistant";
	content: string;
}

// 提取规则匹配结果
interface ExtractedMemory {
	key: string;
	content: string;
	category: MemoryCategory;
	relevance_score: number;
}

// LLM 提取结果
interface LlmExtractedMemory {
	key: string;
	content: string;
	category: MemoryCategory;
	relevance_score: number;
}

// ==================
// 规则提取模式（作为 LLM 提取的后备 + 低延迟补充）
// ==================
const PREFERENCE_PATTERNS: Array<{
	pattern: RegExp;
	keyPrefix: string;
}> = [
	{ pattern: /我喜欢(.{2,60})/g, keyPrefix: "user_likes" },
	{ pattern: /我偏好(.{2,60})/g, keyPrefix: "user_prefers" },
	{ pattern: /我习惯(.{2,60})/g, keyPrefix: "user_habit" },
	{ pattern: /以后都(.{2,60})/g, keyPrefix: "user_always" },
	{ pattern: /以后不要(.{2,60})/g, keyPrefix: "user_never" },
	{ pattern: /以后请(.{2,60})/g, keyPrefix: "user_request" },
	{ pattern: /记住(.{2,40})/g, keyPrefix: "user_remember" },
	{ pattern: /我不喜欢(.{2,60})/g, keyPrefix: "user_dislikes" },
	{ pattern: /我不想(.{2,60})/g, keyPrefix: "user_avoid" },
	{ pattern: /我的(.{1,20})(?:是|为)(.{2,40})/g, keyPrefix: "user_info" },
	{ pattern: /请(?:始终|一直|总是)(.{2,60})/g, keyPrefix: "user_always_do" },
	{ pattern: /不要(?:再)?(.{2,60})/g, keyPrefix: "user_stop" },
	{ pattern: /默认(?:使用|用)(.{2,40})/g, keyPrefix: "user_default" },
];

const FACT_PATTERNS: Array<{
	pattern: RegExp;
	keyPrefix: string;
}> = [
	{
		pattern: /项目(?:名称?|叫)(?:是)?(.{2,40})/g,
		keyPrefix: "project_name",
	},
	{
		pattern: /(?:技术栈|框架)(?:是|使用|用)(.{2,80})/g,
		keyPrefix: "tech_stack",
	},
	{
		pattern: /(?:数据库|DB)(?:是|使用|用)(.{2,40})/g,
		keyPrefix: "database",
	},
	{
		pattern: /(?:部署|发布)(?:到|在)(.{2,40})/g,
		keyPrefix: "deployment",
	},
];

const INSTRUCTION_PATTERNS: Array<{
	pattern: RegExp;
	keyPrefix: string;
}> = [
	{
		pattern: /(?:永远|始终|一直|每次)(?:用|使用|要)(.{2,80})/g,
		keyPrefix: "instr_always",
	},
	{
		pattern: /(?:回答|回复|输出)(?:用|使用)(.{2,40})/g,
		keyPrefix: "instr_output",
	},
	{
		pattern: /(?:代码|编程)(?:风格|规范|标准)(?:是|用|使用)?(.{2,80})/g,
		keyPrefix: "instr_coding",
	},
	{
		pattern: /(?:语言|语气|口吻|风格)(?:要|用|使用|保持)(.{2,60})/g,
		keyPrefix: "instr_tone",
	},
];

// ==================
// 记忆上下文构建
// ==================

/**
 * 构建注入 Agent systemPrompt 的记忆上下文
 * 支持基于查询的相关性排序和记忆衰减
 */
export async function buildMemoryContextForAgent(
	db: DbContext,
	options?: BuildMemoryContextOptions,
): Promise<string> {
	const limit = Math.min(options?.limit ?? 30, 80);
	const minScore = options?.minRelevanceScore ?? 0;
	const maxChars = options?.maxChars ?? 3000;
	const categories = options?.categories;

	let sql: string;
	const args: (string | number | null)[] = [];

	if (categories && categories.length > 0) {
		const placeholders = categories.map(() => "?").join(", ");
		sql = `SELECT * FROM agent_memories
			WHERE relevance_score >= ? AND category IN (${placeholders})
			ORDER BY relevance_score DESC, access_count DESC, updated_at DESC
			LIMIT ?`;
		args.push(minScore, ...categories, limit);
	} else {
		sql = `SELECT * FROM agent_memories
			WHERE relevance_score >= ?
			ORDER BY relevance_score DESC, access_count DESC, updated_at DESC
			LIMIT ?`;
		args.push(minScore, limit);
	}

	const rows = await db.client.execute({ sql, args });

	if (rows.rows.length === 0) {
		return "";
	}

	const memories = rows.rows.map(mapRow);

	// 应用时间衰减：超过 30 天未访问的记忆降低权重
	const nowMs = now();
	const scoredMemories = memories.map((m) => {
		const lastAccess = m.last_accessed_at || m.updated_at;
		const daysSinceAccess = (nowMs - lastAccess) / ONE_DAY_MS;
		const decayFactor =
			daysSinceAccess > 30
				? Math.max(0.3, 1 - (daysSinceAccess - 30) / 180)
				: 1;
		let effectiveScore = m.relevance_score * decayFactor;

		// 如果提供了查询，对相关记忆加权
		if (options?.query) {
			const queryLower = options.query.toLowerCase();
			const contentLower = m.content.toLowerCase();
			const keyLower = m.key.toLowerCase();
			if (contentLower.includes(queryLower) || keyLower.includes(queryLower)) {
				effectiveScore *= 1.5;
			} else {
				// 分词匹配
				const queryWords = queryLower
					.split(/[\s,，;；、]+/)
					.filter((w) => w.length >= 2);
				const matched = queryWords.filter(
					(w) => contentLower.includes(w) || keyLower.includes(w),
				);
				if (matched.length > 0) {
					effectiveScore *= 1 + matched.length * 0.2;
				}
			}
		}

		return { ...m, effectiveScore };
	});

	// 按有效分值排序
	scoredMemories.sort((a, b) => b.effectiveScore - a.effectiveScore);

	// 更新访问时间
	const ids = scoredMemories.slice(0, 20).map((r) => r.id);
	if (ids.length > 0) {
		const updatePlaceholders = ids.map(() => "?").join(", ");
		await db.client
			.execute({
				sql: `UPDATE agent_memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id IN (${updatePlaceholders})`,
				args: [now(), ...ids],
			})
			.catch(() => {});
	}

	// 按分类分组格式化
	const categoryLabels: Record<string, string> = {
		instruction: "用户指令（必须遵守）",
		preference: "用户偏好",
		fact: "已知事实",
		context: "项目上下文",
		task_result: "历史经验",
		user_habit: "用户习惯",
	};

	// 分类优先级
	const categoryPriority: Record<string, number> = {
		instruction: 0,
		preference: 1,
		fact: 2,
		context: 3,
		task_result: 4,
		user_habit: 5,
	};

	const grouped = new Map<string, string[]>();
	for (const mem of scoredMemories) {
		const cat = mem.category || "fact";
		if (!grouped.has(cat)) {
			grouped.set(cat, []);
		}
		grouped.get(cat)!.push(`- ${mem.content}`);
	}

	// 按优先级排序分类
	const sortedCategories = Array.from(grouped.entries()).sort(
		([a], [b]) => (categoryPriority[a] ?? 99) - (categoryPriority[b] ?? 99),
	);

	let result =
		"## 用户长期记忆\n以下是用户的历史偏好和重要信息，务必在回答中参考并遵守：\n\n";
	for (const [cat, items] of sortedCategories) {
		const label = categoryLabels[cat] || "其他";
		const section = `### ${label}\n${items.join("\n")}\n\n`;
		if (result.length + section.length > maxChars) {
			// 空间不够时截取部分条目
			const remaining = maxChars - result.length - label.length - 10;
			if (remaining > 50) {
				let partial = `### ${label}\n`;
				for (const item of items) {
					if (partial.length + item.length + 1 > remaining) break;
					partial += `${item}\n`;
				}
				result += partial;
			}
			break;
		}
		result += section;
	}

	return result.trim();
}

// ==================
// 规则提取（快速 + 后备）
// ==================

function extractByRules(messages: ConversationMessage[]): ExtractedMemory[] {
	const extracted: ExtractedMemory[] = [];
	const seenKeys = new Set<string>();

	const userMessages = messages.filter((m) => m.role === "user").slice(-15);

	for (const msg of userMessages) {
		const text = msg.content;

		for (const rule of PREFERENCE_PATTERNS) {
			rule.pattern.lastIndex = 0;
			let match = rule.pattern.exec(text);
			while (match) {
				const content = match[0].trim();
				const key = `${rule.keyPrefix}_${hashContent(content)}`;
				if (!seenKeys.has(key)) {
					seenKeys.add(key);
					extracted.push({
						key,
						content,
						category: "preference",
						relevance_score: 0.7,
					});
				}
				match = rule.pattern.exec(text);
			}
		}

		for (const rule of FACT_PATTERNS) {
			rule.pattern.lastIndex = 0;
			let match = rule.pattern.exec(text);
			while (match) {
				const content = match[0].trim();
				const key = `${rule.keyPrefix}_${hashContent(content)}`;
				if (!seenKeys.has(key)) {
					seenKeys.add(key);
					extracted.push({
						key,
						content,
						category: "fact",
						relevance_score: 0.6,
					});
				}
				match = rule.pattern.exec(text);
			}
		}

		for (const rule of INSTRUCTION_PATTERNS) {
			rule.pattern.lastIndex = 0;
			let match = rule.pattern.exec(text);
			while (match) {
				const content = match[0].trim();
				const key = `${rule.keyPrefix}_${hashContent(content)}`;
				if (!seenKeys.has(key)) {
					seenKeys.add(key);
					extracted.push({
						key,
						content,
						category: "instruction",
						relevance_score: 0.85,
					});
				}
				match = rule.pattern.exec(text);
			}
		}
	}

	return extracted;
}

// ==================
// LLM 提取（深度分析）
// ==================

const LLM_EXTRACTION_PROMPT = `你是一个对话记忆提取助手。请分析以下对话，提取值得长期记住的信息。

提取规则：
1. **instruction（用户指令，权重0.9）**：用户明确要求你以后都要遵守的行为准则、输出格式、语言偏好等
2. **preference（用户偏好，权重0.7）**：用户表达的喜好、偏好、厌恶
3. **fact（已知事实，权重0.6）**：项目名称、技术栈、团队信息、业务背景等客观信息
4. **context（项目上下文，权重0.65）**：当前项目的架构决策、设计原因、重要约束
5. **user_habit（用户习惯，权重0.5）**：用户的工作习惯、常用工具、特殊需求

不要提取：
- 一次性的任务指令（如"帮我写一个函数"）
- 已经完成的具体操作细节
- 对话中的临时状态信息

请以 JSON 格式返回：
{
  "memories": [
    {
      "key": "简短标识（英文，如 user_prefers_chinese）",
      "content": "记忆内容（清晰、自包含、中文优先）",
      "category": "instruction|preference|fact|context|user_habit",
      "relevance_score": 0.5-0.95
    }
  ]
}

如果没有值得记住的信息，返回 {"memories": []}。仅返回 JSON。`;

/**
 * 使用 LLM 深度提取对话中的记忆
 */
export async function extractMemoriesWithLlm(
	db: DbContext,
	messages: ConversationMessage[],
): Promise<LlmExtractedMemory[]> {
	try {
		const { invokeLlm } = await import("../../llm/invoke");

		// 构建对话摘要（截断到合理长度）
		const conversationText = messages
			.slice(-20)
			.map(
				(m) =>
					`【${m.role === "user" ? "用户" : "助手"}】${m.content.slice(0, 500)}`,
			)
			.join("\n\n");

		if (conversationText.length < 20) {
			return [];
		}

		const prompt = `请分析以下对话内容并提取值得长期记住的信息：\n${conversationText.slice(0, 4000)}`;

		const result = await invokeLlm(db, {
			model: "", // 使用默认活跃模型
			prompt,
			context: [LLM_EXTRACTION_PROMPT],
			temperature: 0.2,
		});

		return parseLlmExtractionResult(result.content);
	} catch (err) {
		console.warn(
			"[MemoryService] LLM extraction failed, falling back to rules:",
			err,
		);
		return [];
	}
}

function parseLlmExtractionResult(raw: string): LlmExtractedMemory[] {
	try {
		const parsed = JSON.parse(raw);
		if (parsed?.memories && Array.isArray(parsed.memories)) {
			return validateLlmMemories(parsed.memories);
		}
	} catch {
		// 尝试提取 JSON
	}

	const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
	if (fenceMatch?.[1]) {
		try {
			const parsed = JSON.parse(fenceMatch[1]);
			if (parsed?.memories && Array.isArray(parsed.memories)) {
				return validateLlmMemories(parsed.memories);
			}
		} catch {}
	}

	const braceMatch = raw.match(/\{[\s\S]*\}/);
	if (braceMatch?.[0]) {
		try {
			const parsed = JSON.parse(braceMatch[0]);
			if (parsed?.memories && Array.isArray(parsed.memories)) {
				return validateLlmMemories(parsed.memories);
			}
		} catch {}
	}

	return [];
}

function validateLlmMemories(items: unknown[]): LlmExtractedMemory[] {
	const validCategories = new Set<MemoryCategory>([
		"preference",
		"fact",
		"task_result",
		"user_habit",
		"instruction",
		"context",
	]);

	return items
		.filter(
			(item): item is Record<string, unknown> =>
				!!item && typeof item === "object",
		)
		.filter((item) => {
			const key = typeof item.key === "string" ? item.key.trim() : "";
			const content =
				typeof item.content === "string" ? item.content.trim() : "";
			return key.length > 0 && content.length > 0;
		})
		.map((item) => ({
			key: String(item.key).trim(),
			content: String(item.content).trim(),
			category: validCategories.has(item.category as MemoryCategory)
				? (item.category as MemoryCategory)
				: "fact",
			relevance_score: Math.min(
				0.95,
				Math.max(0.3, Number(item.relevance_score) || 0.6),
			),
		}));
}

// ==================
// 统一提取入口
// ==================

/**
 * 从对话消息中提取并保存记忆
 * 策略：规则提取立即执行 + LLM 提取异步执行
 */
export async function extractAndSaveMemories(
	db: DbContext,
	_sessionId: string,
	messages: ConversationMessage[],
	options?: { useLlm?: boolean },
): Promise<{ saved: number; keys: string[] }> {
	if (messages.length === 0) {
		return { saved: 0, keys: [] };
	}

	// 1. 规则提取（同步，低延迟）
	const ruleExtracted = extractByRules(messages);

	// 2. LLM 提取（如启用）
	let llmExtracted: LlmExtractedMemory[] = [];
	const useLlm = options?.useLlm !== false; // 默认启用
	if (useLlm && messages.length >= 2) {
		try {
			llmExtracted = await extractMemoriesWithLlm(db, messages);
		} catch {
			// LLM 失败不影响规则提取结果
		}
	}

	// 3. 合并去重（LLM 结果优先）
	const allExtracted: ExtractedMemory[] = [...ruleExtracted];
	const seenKeys = new Set(ruleExtracted.map((m) => m.key));

	for (const llmMem of llmExtracted) {
		const key = `llm_${llmMem.key}`;
		if (!seenKeys.has(key)) {
			seenKeys.add(key);
			allExtracted.push({
				key,
				content: llmMem.content,
				category: llmMem.category,
				relevance_score: llmMem.relevance_score,
			});
		}
	}

	if (allExtracted.length === 0) {
		return { saved: 0, keys: [] };
	}

	// 4. 持久化
	const savedKeys: string[] = [];
	for (const mem of allExtracted) {
		try {
			const existing = await db.client.execute({
				sql: `SELECT id, content FROM agent_memories WHERE key = ?`,
				args: [mem.key],
			});

			if (existing.rows.length > 0) {
				const existingContent = String(existing.rows[0].content || "");
				// 仅当内容有实质变化时才更新
				if (existingContent !== mem.content) {
					await db.client.execute({
						sql: `UPDATE agent_memories SET content = ?, relevance_score = MAX(relevance_score, ?), updated_at = ? WHERE key = ?`,
						args: [mem.content, mem.relevance_score, now(), mem.key],
					});
				}
			} else {
				await db.client.execute({
					sql: `INSERT INTO agent_memories (id, key, content, category, relevance_score, created_at, updated_at, access_count)
						VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
					args: [
						randomUUID(),
						mem.key,
						mem.content,
						mem.category,
						mem.relevance_score,
						now(),
						now(),
					],
				});
			}
			savedKeys.push(mem.key);
		} catch (err) {
			console.warn("[MemoryService] 保存记忆失败:", mem.key, err);
		}
	}

	return { saved: savedKeys.length, keys: savedKeys };
}

// ==================
// 智能搜索
// ==================

/**
 * 智能搜索记忆（分词 + 多字段 + 权重排序）
 */
export async function searchMemories(
	db: DbContext,
	query: string,
	limit = 10,
): Promise<AgentMemoryRow[]> {
	if (!query.trim()) {
		return getAllMemories(db, { limit });
	}

	// 分词搜索
	const words = query
		.split(/[\s,，;；、]+/)
		.filter((w) => w.length >= 1)
		.slice(0, 5);

	if (words.length === 0) {
		return getAllMemories(db, { limit });
	}

	// 构建多条件 OR 查询
	const conditions = words.flatMap(() => [`content LIKE ?`, `key LIKE ?`]);
	const args = words.flatMap((w) => [`%${w}%`, `%${w}%`]);

	const rows = await db.client.execute({
		sql: `SELECT * FROM agent_memories WHERE ${conditions.join(" OR ")} ORDER BY relevance_score DESC, updated_at DESC LIMIT ?`,
		args: [...args, limit],
	});

	return rows.rows.map(mapRow);
}

// ==================
// 记忆衰减维护
// ==================

/**
 * 定期维护：降低长期不访问记忆的权重，清理过期记忆
 */
export async function maintenanceMemories(db: DbContext): Promise<{
	decayed: number;
	deleted: number;
}> {
	const threshold = now() - THIRTY_DAYS_MS;

	// 30天未访问的记忆，降低 relevance_score
	const decayResult = await db.client.execute({
		sql: `UPDATE agent_memories
			SET relevance_score = MAX(0.1, relevance_score * 0.8)
			WHERE (last_accessed_at IS NOT NULL AND last_accessed_at < ?)
			   OR (last_accessed_at IS NULL AND updated_at < ?)`,
		args: [threshold, threshold],
	});

	// 删除分值低于 0.15 且超过 60 天未访问的记忆
	const deleteThreshold = now() - 60 * ONE_DAY_MS;
	const deleteResult = await db.client.execute({
		sql: `DELETE FROM agent_memories
			WHERE relevance_score < 0.15
			AND ((last_accessed_at IS NOT NULL AND last_accessed_at < ?)
			  OR (last_accessed_at IS NULL AND updated_at < ?))`,
		args: [deleteThreshold, deleteThreshold],
	});

	return {
		decayed: decayResult.rowsAffected,
		deleted: deleteResult.rowsAffected,
	};
}

// ==================
// CRUD 基础操作（保持不变）
// ==================

export async function getAllMemories(
	db: DbContext,
	options?: { limit?: number },
): Promise<AgentMemoryRow[]> {
	const limit = Math.min(options?.limit ?? 100, 500);
	const rows = await db.client.execute({
		sql: `SELECT * FROM agent_memories ORDER BY updated_at DESC LIMIT ?`,
		args: [limit],
	});
	return rows.rows.map(mapRow);
}

export async function getMemoryStats(db: DbContext): Promise<{
	total: number;
	byCategory: Record<string, number>;
}> {
	const totalResult = await db.client.execute({
		sql: `SELECT COUNT(*) as cnt FROM agent_memories`,
		args: [],
	});
	const total = (totalResult.rows[0]?.cnt as number) || 0;

	const catResult = await db.client.execute({
		sql: `SELECT category, COUNT(*) as cnt FROM agent_memories GROUP BY category`,
		args: [],
	});
	const byCategory: Record<string, number> = {};
	for (const row of catResult.rows) {
		const cat = (row.category as string) || "unknown";
		byCategory[cat] = (row.cnt as number) || 0;
	}

	return { total, byCategory };
}

export async function clearAllMemories(
	db: DbContext,
): Promise<{ deleted: number }> {
	const countResult = await db.client.execute({
		sql: `SELECT COUNT(*) as cnt FROM agent_memories`,
		args: [],
	});
	const count = (countResult.rows[0]?.cnt as number) || 0;

	await db.client.execute({
		sql: `DELETE FROM agent_memories`,
		args: [],
	});

	return { deleted: count };
}

// ==================
// 内部工具函数
// ==================

function hashContent(content: string): string {
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return Math.abs(hash).toString(36).slice(0, 8);
}

function mapRow(row: Record<string, unknown>): AgentMemoryRow {
	return {
		id: row.id as string,
		key: row.key as string,
		content: row.content as string,
		category: (row.category as string) || null,
		relevance_score: (row.relevance_score as number) || 0.5,
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
		last_accessed_at: (row.last_accessed_at as number) || null,
		access_count: (row.access_count as number) || 0,
	};
}
