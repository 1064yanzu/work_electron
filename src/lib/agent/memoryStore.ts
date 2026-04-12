// Agent 长期记忆系统
// 存储用户偏好、历史任务结果等跨会话记忆

import * as api from "./api";
import type { ToolCall } from "./types";

// 记忆类别
export type MemoryCategory =
	| "preference"
	| "fact"
	| "task_result"
	| "user_habit"
	| "instruction"
	| "context";

// 记忆记录
export interface Memory {
	id: string;
	key: string;
	content: string;
	category: MemoryCategory;
	relevanceScore: number;
	createdAt: number;
	updatedAt: number;
	lastAccessedAt?: number;
	accessCount: number;
}

// 将 API 的 MemoryRecord 转换为 Memory
function toMemory(record: api.MemoryRecord): Memory {
	return {
		id: record.id,
		key: record.key,
		content: record.content,
		category: record.category,
		relevanceScore: record.relevance_score,
		createdAt: record.created_at,
		updatedAt: record.updated_at,
		lastAccessedAt: record.last_accessed_at,
		accessCount: record.access_count,
	};
}

// 记忆存储类
class MemoryStore {
	private cache: Map<string, Memory> = new Map();
	private searchCache: Map<string, Memory[]> = new Map();
	private cacheExpiry = 5 * 60 * 1000; // 5 分钟缓存

	// 搜索相关记忆
	async searchMemories(query: string, limit: number = 5): Promise<Memory[]> {
		// 检查缓存
		const cacheKey = `${query}:${limit}`;
		const cached = this.searchCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		try {
			// 调用后端 API 搜索记忆
			const records = await api.searchAgentMemories(query, limit);
			const memories = records.map(toMemory);

			// 更新访问时间和计数
			for (const memory of memories) {
				await this.updateAccessTime(memory.id);
			}

			// 缓存结果
			this.searchCache.set(cacheKey, memories);
			setTimeout(() => {
				this.searchCache.delete(cacheKey);
			}, this.cacheExpiry);

			return memories;
		} catch (error) {
			console.error("[MemoryStore] 搜索记忆失败:", error);
			return [];
		}
	}

	// 添加记忆
	async addMemory(
		key: string,
		content: string,
		category: MemoryCategory = "fact",
	): Promise<Memory> {
		try {
			const record = await api.createAgentMemory(key, content, category);
			const memory = toMemory(record);
			this.cache.set(memory.id, memory);
			return memory;
		} catch (error) {
			console.error("[MemoryStore] 添加记忆失败:", error);
			throw error;
		}
	}

	// 更新记忆
	async updateMemory(id: string, content: string): Promise<void> {
		try {
			await api.updateAgentMemory(id, content);
			const memory = this.cache.get(id);
			if (memory) {
				memory.content = content;
				memory.updatedAt = Date.now();
			}
		} catch (error) {
			console.error("[MemoryStore] 更新记忆失败:", error);
			throw error;
		}
	}

	// 删除记忆
	async deleteMemory(id: string): Promise<void> {
		try {
			await api.deleteAgentMemory(id);
			this.cache.delete(id);
		} catch (error) {
			console.error("[MemoryStore] 删除记忆失败:", error);
			throw error;
		}
	}

	// 获取记忆（按 key）
	async getMemoryByKey(key: string): Promise<Memory | null> {
		try {
			const record = await api.getAgentMemoryByKey(key);
			if (record) {
				const memory = toMemory(record);
				this.cache.set(memory.id, memory);
				await this.updateAccessTime(memory.id);
				return memory;
			}
			return null;
		} catch (error) {
			console.error("[MemoryStore] 获取记忆失败:", error);
			return null;
		}
	}

	// 更新访问时间
	private async updateAccessTime(id: string): Promise<void> {
		try {
			await api.updateAgentMemoryAccessTime(id);
			const memory = this.cache.get(id);
			if (memory) {
				memory.lastAccessedAt = Date.now();
				memory.accessCount++;
			}
		} catch (error) {
			// 静默失败，不影响主流程
			console.warn("[MemoryStore] 更新访问时间失败:", error);
		}
	}

	// 从任务结果中提取记忆
	async extractMemoriesFromTask(
		taskQuery: string,
		taskResult: string,
		toolCalls: ToolCall[],
	): Promise<void> {
		// 提取关键信息作为记忆
		// 1. 用户偏好（如果任务涉及写作风格等）
		if (/写作|风格|格式|偏好/.test(taskQuery)) {
			await this.addMemory(
				`user_preference_${Date.now()}`,
				`用户偏好: ${taskResult.slice(0, 200)}`,
				"preference",
			);
		}

		// 2. 任务结果中的重要事实
		if (taskResult.length > 50) {
			await this.addMemory(
				`task_result_${Date.now()}`,
				`任务: ${taskQuery}\n结果: ${taskResult.slice(0, 500)}`,
				"task_result",
			);
		}

		// 3. 用户习惯（如果多次使用相同工具）
		const toolUsage = new Map<string, number>();
		for (const call of toolCalls) {
			toolUsage.set(call.type, (toolUsage.get(call.type) || 0) + 1);
		}

		for (const [tool, count] of toolUsage.entries()) {
			if (count >= 3) {
				await this.addMemory(
					`user_habit_tool_${tool}`,
					`用户经常使用工具: ${tool}`,
					"user_habit",
				);
			}
		}
	}

	// 格式化记忆为上下文
	formatMemoriesAsContext(memories: Memory[]): string {
		if (memories.length === 0) {
			return "";
		}

		const lines = memories.map((m) => {
			const categoryLabel: Record<string, string> = {
				instruction: "指令",
				preference: "偏好",
				fact: "事实",
				context: "上下文",
				task_result: "历史结果",
				user_habit: "习惯",
			};
			const label = categoryLabel[m.category] || "记忆";

			return `[${label}] ${m.key}: ${m.content}`;
		});

		return `## 相关记忆\n${lines.join("\n")}\n`;
	}

	// 清空所有记忆
	async clearAll(): Promise<{ deleted: number }> {
		try {
			const result = await api.clearAllAgentMemories();
			this.cache.clear();
			this.searchCache.clear();
			return result;
		} catch (error) {
			console.error("[MemoryStore] 清空记忆失败:", error);
			throw error;
		}
	}

	// 获取记忆统计
	async getStats(): Promise<{
		total: number;
		byCategory: Record<string, number>;
	}> {
		try {
			const result = await api.getAgentMemoryStats();
			return {
				total: result.total,
				byCategory: result.by_category,
			};
		} catch (error) {
			console.error("[MemoryStore] 获取统计失败:", error);
			return { total: 0, byCategory: {} };
		}
	}

	// 获取格式化的记忆上下文预览
	async getMemoryContext(): Promise<{
		context: string;
		memoryCount: number;
	}> {
		try {
			const result = await api.getAgentMemoryContext();
			return {
				context: result.context,
				memoryCount: result.memory_count,
			};
		} catch (error) {
			console.error("[MemoryStore] 获取记忆上下文失败:", error);
			return { context: "", memoryCount: 0 };
		}
	}
}

// 单例导出
export const memoryStore = new MemoryStore();
