/**
 * Agent 记忆服务
 * 提供记忆的自动提取、格式化和注入功能
 * 与 agentSdk.ts 解耦，作为独立服务模块
 */
import { randomUUID } from "node:crypto";
import type { DbContext } from "../../db/client";

const now = () => Date.now();

// 记忆分类
type MemoryCategory = "preference" | "fact" | "task_result" | "user_habit";

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
	/** 按分类过滤（不传则查询全部） */
	categories?: MemoryCategory[];
	/** 最多返回记忆数 */
	limit?: number;
	/** 最低相关性分数阈值 */
	minRelevanceScore?: number;
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

// ==================
// 偏好提取规则
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

// 事实提取规则
const FACT_PATTERNS: Array<{
	pattern: RegExp;
	keyPrefix: string;
}> = [
	{ pattern: /项目(?:名称?|叫)(?:是)?(.{2,40})/g, keyPrefix: "project_name" },
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

/**
 * 构建用于注入 Agent systemPrompt 的记忆上下文字符串
 */
export async function buildMemoryContextForAgent(
	db: DbContext,
	options?: BuildMemoryContextOptions,
): Promise<string> {
	const limit = Math.min(options?.limit ?? 20, 50);
	const minScore = options?.minRelevanceScore ?? 0;

	let sql: string;
	const args: (string | number | null)[] = [];

	if (options?.categories && options.categories.length > 0) {
		const placeholders = options.categories.map(() => "?").join(", ");
		sql = `SELECT * FROM agent_memories 
			WHERE category IN (${placeholders}) AND relevance_score >= ?
			ORDER BY relevance_score DESC, access_count DESC, updated_at DESC
			LIMIT ?`;
		args.push(...options.categories, minScore, limit);
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

	// 更新访问时间和计数
	const ids = rows.rows.map((r) => r.id as string);
	if (ids.length > 0) {
		const updatePlaceholders = ids.map(() => "?").join(", ");
		await db.client
			.execute({
				sql: `UPDATE agent_memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id IN (${updatePlaceholders})`,
				args: [now(), ...ids],
			})
			.catch(() => {
				/* 静默失败 */
			});
	}

	// 按分类分组格式化
	const categoryLabels: Record<string, string> = {
		preference: "用户偏好",
		fact: "已知事实",
		task_result: "历史结果",
		user_habit: "用户习惯",
	};

	const grouped = new Map<string, string[]>();
	for (const row of rows.rows) {
		const cat = (row.category as string) || "fact";
		const label = categoryLabels[cat] || "记忆";
		if (!grouped.has(label)) {
			grouped.set(label, []);
		}
		grouped.get(label)!.push(
			`- ${row.key}: ${row.content}`,
		);
	}

	const sections: string[] = [];
	for (const [label, items] of grouped) {
		sections.push(`### ${label}\n${items.join("\n")}`);
	}

	return `## 用户长期记忆\n以下是用户的历史偏好和重要信息，请在回答中适当参考：\n\n${sections.join("\n\n")}`;
}

/**
 * 从对话消息中提取并保存记忆
 * 使用纯规则匹配，不调用 LLM
 */
export async function extractAndSaveMemories(
	db: DbContext,
	_sessionId: string,
	messages: ConversationMessage[],
): Promise<{ saved: number; keys: string[] }> {
	// 只分析最近的用户消息（最多最近 10 条用户消息）
	const userMessages = messages
		.filter((m) => m.role === "user")
		.slice(-10);

	if (userMessages.length === 0) {
		return { saved: 0, keys: [] };
	}

	const extracted: ExtractedMemory[] = [];
	const seenKeys = new Set<string>();

	for (const msg of userMessages) {
		const text = msg.content;

		// 提取偏好
		for (const rule of PREFERENCE_PATTERNS) {
			// Reset lastIndex for global regex
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

		// 提取事实
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
	}

	if (extracted.length === 0) {
		return { saved: 0, keys: [] };
	}

	// 去重：检查数据库中已存在的 key
	const savedKeys: string[] = [];
	for (const mem of extracted) {
		try {
			const existing = await db.client.execute({
				sql: `SELECT id FROM agent_memories WHERE key = ?`,
				args: [mem.key],
			});

			if (existing.rows.length > 0) {
				// 已存在，更新内容
				await db.client.execute({
					sql: `UPDATE agent_memories SET content = ?, relevance_score = MAX(relevance_score, ?), updated_at = ? WHERE key = ?`,
					args: [mem.content, mem.relevance_score, now(), mem.key],
				});
			} else {
				// 新增
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
			// 单条失败不阻塞其他
			console.warn("[MemoryService] 保存记忆失败:", mem.key, err);
		}
	}

	return { saved: savedKeys.length, keys: savedKeys };
}

/**
 * 获取所有记忆（用于管理面板）
 */
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

/**
 * 获取记忆统计信息
 */
export async function getMemoryStats(
	db: DbContext,
): Promise<{
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

/**
 * 清空所有记忆
 */
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

/** 简单内容哈希，用于生成记忆 key 后缀 */
function hashContent(content: string): string {
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return Math.abs(hash).toString(36).slice(0, 8);
}

/** 将数据库行映射为类型安全的对象 */
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
