/**
 * 导入导出 IPC Handlers
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { app, dialog, type IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import {
	collectFullBackupPayload,
	importBackupPayload,
} from "../../services/backupPayload";
import { stringifyBackupPayloadChunked } from "../../services/incrementalBackup";

const now = () => Date.now();

interface ExportResult {
	success: boolean;
	file_path?: string;
	file_size?: number;
	export_time: number;
	error?: string;
}

interface ImportResult {
	success: boolean;
	imported_count: {
		projects: number;
		folders: number;
		sources: number;
		notes: number;
	};
	import_time: number;
	error?: string;
}

export function createImportExportHandlers(db: DbContext, logger: Logger) {
	const performImport = async (
		raw: unknown,
		options: { overwrite: boolean; clearAllFirst: boolean },
	): Promise<ImportResult> => {
		const startTime = Date.now();
		const imported = { projects: 0, folders: 0, sources: 0, notes: 0 };

		try {
			const result = await importBackupPayload(
				db,
				raw,
				{
					overwrite: options.overwrite,
					clearAllFirst: options.clearAllFirst,
				},
				logger,
			);

			return {
				success: true,
				imported_count: result.importedCount,
				import_time: Date.now() - startTime,
			};
		} catch (error) {
			logger.error({ msg: "Import failed", error: String(error) });
			return {
				success: false,
				imported_count: imported,
				import_time: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};

	/**
	 * 导出所有数据（D9 流式化）：主进程分块序列化后写入临时文件，
	 * IPC 只返回 { path, bytes }，整串 JSON 不再经过 IPC 通道。
	 * 需要内容的调用方（如 WebDAV 备份）拿到路径后再用 read_file_safe 读取。
	 */
	const exportAllData = async (
		_event: IpcMainInvokeEvent,
		_input?: Record<string, never>,
	): Promise<{ path: string; bytes: number }> => {
		const exportData = await collectFullBackupPayload(db);
		const jsonStr = await stringifyBackupPayloadChunked(exportData);

		const baseDir = path.join(app.getPath("temp"), "ipo-workbench");
		await fs.mkdir(baseDir, { recursive: true });
		const filePath = path.join(
			baseDir,
			`export-${Date.now()}-${randomUUID().slice(0, 8)}.json`,
		);
		await fs.writeFile(filePath, jsonStr, "utf-8");

		const bytes = Buffer.byteLength(jsonStr, "utf-8");
		logger.info({
			msg: "All data exported to temp file",
			path: filePath,
			bytes,
		});
		return { path: filePath, bytes };
	};

	/**
	 * 导出所有数据到用户选择的文件（logs_export 同款模式）：
	 * 主进程弹保存对话框并直接写盘，渲染端只拿到最终路径。
	 */
	const exportAllDataToFile = async (
		_event: IpcMainInvokeEvent,
		_input?: Record<string, never>,
	): Promise<{ canceled: boolean; path: string; bytes: number }> => {
		const defaultName = `workbench-backup-${new Date().toISOString().split("T")[0]}.json`;
		const result = await dialog.showSaveDialog({
			title: "导出数据",
			defaultPath: path.join(app.getPath("downloads"), defaultName),
			filters: [{ name: "JSON", extensions: ["json"] }],
		});
		if (result.canceled || !result.filePath) {
			return { canceled: true, path: "", bytes: 0 };
		}

		const exportData = await collectFullBackupPayload(db);
		const jsonStr = await stringifyBackupPayloadChunked(exportData);
		await fs.mkdir(path.dirname(result.filePath), { recursive: true });
		await fs.writeFile(result.filePath, jsonStr, "utf-8");

		const bytes = Buffer.byteLength(jsonStr, "utf-8");
		logger.info({ msg: "All data exported", path: result.filePath, bytes });
		return { canceled: false, path: result.filePath, bytes };
	};

	/**
	 * 导出特定项目
	 */
	const exportProject = async (
		_event: IpcMainInvokeEvent,
		input: { project_id: string; export_path: string },
	): Promise<ExportResult> => {
		const startTime = Date.now();

		try {
			// 获取项目及相关数据
			const project = await db.client.execute({
				sql: `SELECT * FROM projects WHERE id = ?`,
				args: [input.project_id],
			});

			if (project.rows.length === 0) {
				return {
					success: false,
					export_time: Date.now() - startTime,
					error: `Project not found: ${input.project_id}`,
				};
			}

			const folders = await db.client.execute({
				sql: `SELECT * FROM folders WHERE project_id = ?`,
				args: [input.project_id],
			});

			const sources = await db.client.execute({
				sql: `SELECT * FROM sources WHERE project_id = ?`,
				args: [input.project_id],
			});

			const sourceIds = sources.rows.map((r) => r.id as string);
			let notes: { rows: unknown[] } = { rows: [] };
			let noteChunks: { rows: unknown[] } = { rows: [] };

			if (sourceIds.length > 0) {
				const placeholders = sourceIds.map(() => "?").join(",");
				notes = await db.client.execute({
					sql: `SELECT * FROM notes WHERE source_id IN (${placeholders})`,
					args: sourceIds,
				});

				noteChunks = await db.client.execute({
					sql: `SELECT * FROM note_chunks WHERE source_id IN (${placeholders})`,
					args: sourceIds,
				});
			}

			const outputAssets = await db.client.execute({
				sql: `SELECT * FROM output_assets WHERE project_id = ?`,
				args: [input.project_id],
			});

			const exportData = {
				version: "1.0.0",
				exported_at: now(),
				project_id: input.project_id,
				data: {
					project: project.rows[0],
					folders: folders.rows,
					sources: sources.rows,
					notes: notes.rows,
					note_chunks: noteChunks.rows,
					output_assets: outputAssets.rows,
				},
			};

			const jsonStr = JSON.stringify(exportData, null, 2);
			const filePath = path.resolve(input.export_path);

			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, jsonStr, "utf-8");

			const stats = await fs.stat(filePath);

			logger.info({
				msg: "Project exported",
				projectId: input.project_id,
				path: filePath,
			});

			return {
				success: true,
				file_path: filePath,
				file_size: stats.size,
				export_time: Date.now() - startTime,
			};
		} catch (error) {
			logger.error({ msg: "Project export failed", error: String(error) });
			return {
				success: false,
				export_time: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};

	/**
	 * 导入数据
	 */
	const importData = async (
		_event: IpcMainInvokeEvent,
		input: { import_path: string; overwrite?: boolean },
	): Promise<ImportResult> => {
		try {
			const filePath = path.resolve(input.import_path);
			const jsonStr = await fs.readFile(filePath, "utf-8");
			const parsed = JSON.parse(jsonStr);
			return await performImport(parsed, {
				overwrite: input.overwrite !== false,
				clearAllFirst: Boolean(input.overwrite),
			});
		} catch (error) {
			logger.error({ msg: "Import from file failed", error: String(error) });
			return {
				success: false,
				imported_count: { projects: 0, folders: 0, sources: 0, notes: 0 },
				import_time: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};

	const importDataFromJson = async (
		_event: IpcMainInvokeEvent,
		input: {
			jsonData: string;
			overwrite?: boolean;
			clear_all_first?: boolean;
		},
	): Promise<ImportResult> => {
		const parsed = JSON.parse(input.jsonData || "{}");
		return await performImport(parsed, {
			overwrite: input.overwrite !== false,
			clearAllFirst: input.clear_all_first !== false,
		});
	};

	return {
		export_all_data: exportAllData,
		export_all_data_to_file: exportAllDataToFile,
		export_project: exportProject,
		import_data: importData,
		import_data_from_json: importDataFromJson,
	};
}
