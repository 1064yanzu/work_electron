/**
 * 导入导出 IPC Handlers
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";

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
	/**
	 * 导出所有数据为 JSON
	 */
	const exportAllData = async (
		_event: IpcMainInvokeEvent,
		input: { export_path: string },
	): Promise<ExportResult> => {
		const startTime = Date.now();

		try {
			// 收集所有数据
			const projects = await db.client.execute(`SELECT * FROM projects`);
			const folders = await db.client.execute(`SELECT * FROM folders`);
			const sources = await db.client.execute(`SELECT * FROM sources`);
			const notes = await db.client.execute(`SELECT * FROM notes`);
			const noteChunks = await db.client.execute(`SELECT * FROM note_chunks`);
			const providers = await db.client.execute(`SELECT * FROM providers`);
			const appConfig = await db.client.execute(`SELECT * FROM app_config`);
			const outputAssets = await db.client.execute(
				`SELECT * FROM output_assets`,
			);

			const exportData = {
				version: "1.0.0",
				exported_at: now(),
				data: {
					projects: projects.rows,
					folders: folders.rows,
					sources: sources.rows,
					notes: notes.rows,
					note_chunks: noteChunks.rows,
					providers: providers.rows,
					app_config: appConfig.rows,
					output_assets: outputAssets.rows,
				},
			};

			const jsonStr = JSON.stringify(exportData, null, 2);
			const filePath = path.resolve(input.export_path);

			// 确保目录存在
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, jsonStr, "utf-8");

			const stats = await fs.stat(filePath);

			logger.info({ msg: "Data exported", path: filePath, size: stats.size });

			return {
				success: true,
				file_path: filePath,
				file_size: stats.size,
				export_time: Date.now() - startTime,
			};
		} catch (error) {
			logger.error({ msg: "Export failed", error: String(error) });
			return {
				success: false,
				export_time: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
			};
		}
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
		const startTime = Date.now();
		const imported = { projects: 0, folders: 0, sources: 0, notes: 0 };

		try {
			const filePath = path.resolve(input.import_path);
			const jsonStr = await fs.readFile(filePath, "utf-8");
			const importData = JSON.parse(jsonStr) as {
				version: string;
				data: {
					projects?: unknown[];
					folders?: unknown[];
					sources?: unknown[];
					notes?: unknown[];
					project?: unknown;
				};
			};

			// 检查版本
			if (!importData.version || !importData.data) {
				return {
					success: false,
					imported_count: imported,
					import_time: Date.now() - startTime,
					error: "Invalid import file format",
				};
			}

			// 导入项目
			const projectData =
				importData.data.projects ??
				(importData.data.project ? [importData.data.project] : []);
			for (const p of projectData) {
				const project = p as Record<string, unknown>;
				const id = input.overwrite ? (project.id as string) : randomUUID();
				try {
					await db.client.execute({
						sql: `INSERT OR REPLACE INTO projects (id, name, description, color, icon, is_archived, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
						args: [
							id,
							project.name as string,
							(project.description as string) ?? null,
							(project.color as string) ?? "#6366f1",
							(project.icon as string) ?? "folder",
							project.is_archived ? 1 : 0,
							(project.created_at as number) ?? now(),
							now(),
						],
					});
					imported.projects++;
				} catch (err) {
					logger.warn({ msg: "Import project error", id, error: String(err) });
				}
			}

			// 导入文件夹
			for (const f of importData.data.folders ?? []) {
				const folder = f as Record<string, unknown>;
				const id = input.overwrite ? (folder.id as string) : randomUUID();
				try {
					await db.client.execute({
						sql: `INSERT OR REPLACE INTO folders (id, project_id, parent_id, name, color, icon, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
						args: [
							id,
							(folder.project_id as string) ?? null,
							(folder.parent_id as string) ?? null,
							folder.name as string,
							(folder.color as string) ?? null,
							(folder.icon as string) ?? null,
							(folder.created_at as number) ?? now(),
							now(),
						],
					});
					imported.folders++;
				} catch (err) {
					logger.warn({ msg: "Import folder error", id, error: String(err) });
				}
			}

			// 导入 Sources
			for (const s of importData.data.sources ?? []) {
				const source = s as Record<string, unknown>;
				const id = input.overwrite ? (source.id as string) : randomUUID();
				try {
					await db.client.execute({
						sql: `INSERT OR REPLACE INTO sources (id, title, kind, tags, url, project_id, folder_id, source_type, category, description, author, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						args: [
							id,
							source.title as string,
							(source.kind as string) ?? "text",
							typeof source.tags === "string"
								? source.tags
								: JSON.stringify(source.tags ?? []),
							(source.url as string) ?? null,
							(source.project_id as string) ?? null,
							(source.folder_id as string) ?? null,
							(source.source_type as string) ?? "manual",
							(source.category as string) ?? "article",
							(source.description as string) ?? null,
							(source.author as string) ?? null,
							(source.created_at as number) ?? now(),
							now(),
						],
					});
					imported.sources++;
				} catch (err) {
					logger.warn({ msg: "Import source error", id, error: String(err) });
				}
			}

			// 导入 Notes
			for (const n of importData.data.notes ?? []) {
				const note = n as Record<string, unknown>;
				const id = input.overwrite ? (note.id as string) : randomUUID();
				try {
					await db.client.execute({
						sql: `INSERT OR REPLACE INTO notes (id, source_id, content, content_html, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?)`,
						args: [
							id,
							(note.source_id as string) ?? null,
							note.content as string,
							(note.content_html as string) ?? null,
							(note.created_at as number) ?? now(),
							now(),
						],
					});
					imported.notes++;
				} catch (err) {
					logger.warn({ msg: "Import note error", id, error: String(err) });
				}
			}

			logger.info({ msg: "Data imported", imported });

			return {
				success: true,
				imported_count: imported,
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

	return {
		export_all_data: exportAllData,
		export_project: exportProject,
		import_data: importData,
	};
}
