/**
 * 数据统计相关 IPC Handlers
 * 用于设置界面的数据概览和数据管理功能
 */
import path from "node:path";
import { app } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";
import { getDatabaseFilePath } from "../../db/paths";
import { getCacheDir } from "../../storage/cacheRoots";

// ─── 进程内缓存（5 分钟 TTL）────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

interface DataStatsResult {
	projects_count: number;
	sources_count: number;
	notes_count: number;
	outputs_count: number;
	agent_sessions_count: number;
	agent_tasks_count: number;
	mcp_servers_count: number;
	skills_count: number;
	providers_count: number;
	database_size: number;
	media_size: number;
	cache_size: number;
}

let statsCache: { data: DataStatsResult; expireAt: number } | null = null;

/** 使进程内缓存失效，下次调用 getDataStats 时将重新查询 */
function invalidateStatsCache(): void {
	statsCache = null;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

// 递归计算文件夹大小
async function getFolderSize(folderPath: string): Promise<number> {
	const fs = await import("node:fs/promises");
	let totalSize = 0;

	try {
		const items = await fs.readdir(folderPath, { withFileTypes: true });

		for (const item of items) {
			const itemPath = path.join(folderPath, item.name);

			if (item.isDirectory()) {
				totalSize += await getFolderSize(itemPath);
			} else if (item.isFile()) {
				const stat = await fs.stat(itemPath);
				totalSize += stat.size;
			}
		}
	} catch {
		// 文件夹不存在或无法访问
		return 0;
	}

	return totalSize;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export function createDataStatsHandlers(db: DbContext) {
	// 获取数据目录
	const getDataDirectory = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<string> => {
		return app.getPath("userData");
	};

	// 获取数据库路径
	const getDatabasePath = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<string> => {
		return db.filePath || getDatabaseFilePath();
	};

	// 获取数据统计（带 5 分钟进程内缓存）
	const getDataStats = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<DataStatsResult> => {
		// 命中缓存则直接返回
		if (statsCache !== null && Date.now() < statsCache.expireAt) {
			return statsCache.data;
		}

		// ── 1. 并行执行所有 COUNT 查询 ────────────────────────────────────────
		const tableEntries: Array<{ key: string; table: string }> = [
			{ key: "projects", table: "projects" },
			{ key: "sources", table: "sources" },
			{ key: "notes", table: "notes" },
			{ key: "outputs", table: "output_assets" },
			{ key: "agentSessions", table: "agent_sessions" },
			{ key: "agentTasks", table: "agent_tasks" },
			{ key: "mcpServers", table: "mcp_servers" },
			{ key: "skills", table: "skills" },
			{ key: "providers", table: "providers" },
		];

		const countResults = await Promise.all(
			tableEntries.map(async ({ key, table }) => {
				try {
					const result = await db.client.execute(
						`SELECT COUNT(*) as count FROM ${table}`,
					);
					return { key, count: (result.rows[0]?.count as number) ?? 0 };
				} catch {
					// 表可能不存在
					return { key, count: 0 };
				}
			}),
		);

		const stats: Record<string, number> = {};
		for (const { key, count } of countResults) {
			stats[key] = count;
		}

		// ── 2. 并行计算文件大小 ───────────────────────────────────────────────
		const fs = await import("node:fs/promises");

		const [databaseSize, mediaSize, cacheSize] = await Promise.all([
			// 数据库大小
			(async () => {
				try {
					const dbPath = getDatabaseFilePath();
					const dbStat = await fs.stat(dbPath);
					return dbStat.size;
				} catch {
					return 0;
				}
			})(),
			// 媒体文件大小（遍历 media 目录）
			(async () => {
				try {
					const mediaPath = getCacheDir("media");
					return await getFolderSize(mediaPath);
				} catch {
					return 0;
				}
			})(),
			// 缓存大小（遍历 cache 目录）
			(async () => {
				try {
					const cachePath = getCacheDir("cache");
					return await getFolderSize(cachePath);
				} catch {
					return 0;
				}
			})(),
		]);

		const result: DataStatsResult = {
			projects_count: stats.projects || 0,
			sources_count: stats.sources || 0,
			notes_count: stats.notes || 0,
			outputs_count: stats.outputs || 0,
			agent_sessions_count: stats.agentSessions || 0,
			agent_tasks_count: stats.agentTasks || 0,
			mcp_servers_count: stats.mcpServers || 0,
			skills_count: stats.skills || 0,
			providers_count: stats.providers || 0,
			database_size: databaseSize,
			media_size: mediaSize,
			cache_size: cacheSize,
		};

		// 写入缓存
		statsCache = { data: result, expireAt: Date.now() + CACHE_TTL_MS };

		return result;
	};

	// 清除缓存
	const clearCache = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<number> => {
		const fs = await import("node:fs/promises");
		const cachePath = getCacheDir("cache");

		let totalSize = 0;
		try {
			// 计算缓存大小
			totalSize = await getFolderSize(cachePath);
			// 删除缓存目录
			await fs.rm(cachePath, { recursive: true, force: true });
			// 重新创建空目录
			await fs.mkdir(cachePath, { recursive: true });
		} catch (error) {
			// 缓存目录可能不存在
			console.warn("清除缓存失败:", error);
		}

		// 数据已变更，使统计缓存失效
		invalidateStatsCache();

		return totalSize;
	};

	// 清除所有数据
	const clearAllData = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<void> => {
		const fs = await import("node:fs/promises");

		try {
			// 删除所有表的数据
			const tables = [
				"projects",
				"folders",
				"sources",
				"notes",
				"note_chunks",
				"output_assets",
				"providers",
				"mcp_servers",
				"skills",
				"agent_sessions",
				"agent_tasks",
				"agent_nodes",
				"agent_tool_calls",
				"agent_messages",
				"agent_audit_logs",
				"artifacts",
				"cards",
				"activity_logs",
			];

			for (const table of tables) {
				try {
					await db.client.execute(`DELETE FROM ${table}`);
				} catch {
					// 表可能不存在，忽略错误
				}
			}

			// 清除媒体文件
			const mediaPath = getCacheDir("media");
			try {
				await fs.rm(mediaPath, { recursive: true, force: true });
				await fs.mkdir(mediaPath, { recursive: true });
			} catch {
				// 忽略错误
			}

			// 清除缓存
			const cachePath = getCacheDir("cache");
			try {
				await fs.rm(cachePath, { recursive: true, force: true });
				await fs.mkdir(cachePath, { recursive: true });
			} catch {
				// 忽略错误
			}
		} catch (error) {
			console.error("清除数据失败:", error);
			throw error;
		}

		// 数据已全部清除，使统计缓存失效
		invalidateStatsCache();
	};

	return {
		get_data_directory: getDataDirectory,
		get_database_path: getDatabasePath,
		get_data_stats: getDataStats,
		clear_cache: clearCache,
		clear_all_data: clearAllData,
	};
}
