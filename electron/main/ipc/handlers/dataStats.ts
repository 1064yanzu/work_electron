/**
 * 数据统计相关 IPC Handlers
 * 用于设置界面的数据概览和数据管理功能
 */
import path from "node:path";
import { app } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";

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
		projects: number;
		sources: number;
		notes: number;
		outputs: number;
		agentSessions: number;
		agentTasks: number;
		mcpServers: number;
		skills: number;
		providers: number;
		databaseSize?: number;
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

		return {
			projects: stats.projects || 0,
			sources: stats.sources || 0,
			notes: stats.notes || 0,
			outputs: stats.outputs || 0,
			agentSessions: stats.agentSessions || 0,
			agentTasks: stats.agentTasks || 0,
			mcpServers: stats.mcpServers || 0,
			skills: stats.skills || 0,
			providers: stats.providers || 0,
		};
	};

	return {
		get_data_directory: getDataDirectory,
		get_database_path: getDatabasePath,
		get_data_stats: getDataStats,
	};
}
