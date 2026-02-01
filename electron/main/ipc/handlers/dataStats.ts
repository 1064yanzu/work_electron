/**
 * 数据统计相关 IPC Handlers
 * 用于设置界面的数据概览和数据管理功能
 */
import path from "node:path";
import { app } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";

// 递归计算文件夹大小
async function getFolderSize(folderPath: string): Promise<number> {
	const fs = await import('node:fs/promises');
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
		return path.join(app.getPath("userData"), "ipo-workbench.db");
	};

	// 获取数据统计
	const getDataStats = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<{
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
	}> => {
		// 获取各表的记录数
		const tables = [
			{ key: "projects", table: "projects" },
			{ key: "sources", table: "sources" },
			{ key: "notes", table: "notes" },
			{ key: "outputs", table: "outputs" },
			{ key: "agentSessions", table: "agent_sessions" },
			{ key: "agentTasks", table: "agent_tasks" },
			{ key: "mcpServers", table: "mcp_servers" },
			{ key: "skills", table: "skills" },
			{ key: "providers", table: "providers" },
		];

		const stats: Record<string, number> = {};

		for (const { key, table } of tables) {
			try {
				const result = await db.client.execute(
					`SELECT COUNT(*) as count FROM ${table}`,
				);
				stats[key] = (result.rows[0]?.count as number) ?? 0;
			} catch {
				// 表可能不存在
				stats[key] = 0;
			}
		}

		// 计算文件大小
		const fs = await import('node:fs/promises');
		let databaseSize = 0;
		let mediaSize = 0;
		let cacheSize = 0;

		try {
			// 数据库大小
			const dbPath = path.join(app.getPath('userData'), 'ipo-workbench.db');
			const dbStat = await fs.stat(dbPath);
			databaseSize = dbStat.size;
		} catch {
			// 数据库文件可能不存在
		}

		try {
			// 媒体文件大小（遍历 media 目录）
			const mediaPath = path.join(app.getPath('userData'), 'media');
			mediaSize = await getFolderSize(mediaPath);
		} catch {
			// media 目录可能不存在
		}

		try {
			// 缓存大小（遍历 cache 目录）
			const cachePath = path.join(app.getPath('userData'), 'cache');
			cacheSize = await getFolderSize(cachePath);
		} catch {
			// cache 目录可能不存在
		}

		return {
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
	};

	// 清除缓存
	const clearCache = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<number> => {
		const fs = await import('node:fs/promises');
		const cachePath = path.join(app.getPath('userData'), 'cache');

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
			console.warn('清除缓存失败:', error);
		}

		return totalSize;
	};

	// 清除所有数据
	const clearAllData = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<void> => {
		const fs = await import('node:fs/promises');

		try {
			// 删除所有表的数据
			const tables = [
				'projects', 'folders', 'sources', 'notes', 'note_chunks',
				'output_assets', 'providers', 'mcp_servers', 'skills',
				'agent_sessions', 'agent_tasks', 'agent_nodes', 'agent_tool_calls',
				'agent_messages', 'agent_audit_logs', 'artifacts',
				'cards', 'activity_logs'
			];

			for (const table of tables) {
				try {
					await db.client.execute(`DELETE FROM ${table}`);
				} catch {
					// 表可能不存在，忽略错误
				}
			}

			// 清除媒体文件
			const mediaPath = path.join(app.getPath('userData'), 'media');
			try {
				await fs.rm(mediaPath, { recursive: true, force: true });
				await fs.mkdir(mediaPath, { recursive: true });
			} catch {
				// 忽略错误
			}

			// 清除缓存
			const cachePath = path.join(app.getPath('userData'), 'cache');
			try {
				await fs.rm(cachePath, { recursive: true, force: true });
				await fs.mkdir(cachePath, { recursive: true });
			} catch {
				// 忽略错误
			}
		} catch (error) {
			console.error('清除数据失败:', error);
			throw error;
		}
	};

	return {
		get_data_directory: getDataDirectory,
		get_database_path: getDatabasePath,
		get_data_stats: getDataStats,
		clear_cache: clearCache,
		clear_all_data: clearAllData,
	};
}
