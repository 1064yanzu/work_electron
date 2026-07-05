/**
 * Artifacts IPC Handlers
 * Agent 产物管理服务
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { IpcMainInvokeEvent } from "electron";
import { app, dialog, shell } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type {
	ArtifactCleanupResult,
	ArtifactFileType,
	ArtifactMetadata,
	ArtifactSettings,
	Source,
} from "../../../shared/types";
import type { DbContext } from "../../db/client";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

// 默认设置
const DEFAULT_SETTINGS: ArtifactSettings = {
	storage_path: path.join(app.getPath("documents"), "Agent产物"),
	auto_cleanup: true,
	retention_days: 30,
	max_per_session: 100,
	max_total_size: 1024 * 1024 * 1024, // 1GB
};

// 文件扩展名到类型的映射
const EXT_TYPE_MAP: Record<string, ArtifactFileType> = {
	// 图片
	".png": "image",
	".jpg": "image",
	".jpeg": "image",
	".gif": "image",
	".svg": "image",
	".webp": "image",
	".bmp": "image",
	".ico": "image",
	// PDF
	".pdf": "pdf",
	// 文本
	".txt": "text",
	".md": "text",
	".markdown": "text",
	".csv": "text",
	".log": "text",
	// 代码
	".js": "code",
	".ts": "code",
	".jsx": "code",
	".tsx": "code",
	".py": "code",
	".java": "code",
	".c": "code",
	".cpp": "code",
	".h": "code",
	".cs": "code",
	".go": "code",
	".rs": "code",
	".rb": "code",
	".php": "code",
	".swift": "code",
	".kt": "code",
	".sh": "code",
	".bash": "code",
	".zsh": "code",
	".sql": "code",
	".json": "code",
	".xml": "code",
	".yaml": "code",
	".yml": "code",
	".toml": "code",
	".ini": "code",
	".conf": "code",
	".css": "code",
	".scss": "code",
	".less": "code",
	// HTML
	".html": "html",
	".htm": "html",
	".xhtml": "html",
	// 视频
	".mp4": "video",
	".webm": "video",
	".avi": "video",
	".mov": "video",
	".mkv": "video",
	// 音频
	".mp3": "audio",
	".wav": "audio",
	".ogg": "audio",
	".flac": "audio",
	".aac": "audio",
	".m4a": "audio",
	// 压缩包
	".zip": "archive",
	".rar": "archive",
	".7z": "archive",
	".tar": "archive",
	".gz": "archive",
	".bz2": "archive",
	// 文档
	".doc": "document",
	".docx": "document",
	".odt": "document",
	".rtf": "document",
	// 表格
	".xls": "spreadsheet",
	".xlsx": "spreadsheet",
	".ods": "spreadsheet",
	// 演示文稿
	".ppt": "presentation",
	".pptx": "presentation",
	".odp": "presentation",
	".key": "presentation",
};

function getFileType(fileName: string): ArtifactFileType {
	const ext = path.extname(fileName).toLowerCase();
	return EXT_TYPE_MAP[ext] || "other";
}

// 简单的 MIME 类型映射
const MIME_TYPE_MAP: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".bmp": "image/bmp",
	".ico": "image/x-icon",
	".pdf": "application/pdf",
	".txt": "text/plain",
	".md": "text/markdown",
	".csv": "text/csv",
	".json": "application/json",
	".xml": "application/xml",
	".html": "text/html",
	".htm": "text/html",
	".css": "text/css",
	".js": "application/javascript",
	".ts": "text/typescript",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".zip": "application/zip",
	".doc": "application/msword",
	".docx":
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xls": "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".ppt": "application/vnd.ms-powerpoint",
	".pptx":
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function getMimeType(fileName: string): string {
	const ext = path.extname(fileName).toLowerCase();
	return MIME_TYPE_MAP[ext] || "application/octet-stream";
}

export function createArtifactHandlers(db: DbContext) {
	let cachedSettings: ArtifactSettings | null = null;

	// 获取设置（带缓存）
	async function getSettings(): Promise<ArtifactSettings> {
		if (cachedSettings) return cachedSettings;

		const row = await db.client.execute({
			sql: `SELECT value FROM app_config WHERE key = ?`,
			args: ["artifact_settings"],
		});

		if (row.rows.length > 0) {
			try {
				cachedSettings = JSON.parse(row.rows[0].value as string);
				return cachedSettings!;
			} catch {
				// 解析失败，使用默认值
			}
		}

		cachedSettings = DEFAULT_SETTINGS;
		return cachedSettings;
	}

	// 确保存储目录存在
	async function ensureStorageDir(sessionId?: string): Promise<string> {
		const settings = await getSettings();
		const baseDir = sessionId
			? path.join(settings.storage_path, sessionId)
			: settings.storage_path;

		await fs.mkdir(baseDir, { recursive: true });
		return baseDir;
	}

	// 解析数据库行为 ArtifactMetadata
	function parseArtifact(row: Record<string, unknown>): ArtifactMetadata {
		return {
			id: row.id as string,
			session_id: row.session_id as string,
			file_name: row.file_name as string,
			file_path: row.file_path as string,
			file_type: row.file_type as ArtifactFileType,
			file_size: row.file_size as number,
			mime_type: row.mime_type as string,
			tool_call_id: row.tool_call_id as string | undefined,
			description: row.description as string | undefined,
			created_at: row.created_at as number,
			expires_at: row.expires_at as number | undefined,
		};
	}

	// 保存产物
	const artifact_save: Handler<"artifact_save"> = async (_event, input) => {
		const id = crypto.randomUUID();
		const settings = await getSettings();
		const storageDir = await ensureStorageDir(input.session_id);

		// 生成唯一文件名
		const ext = path.extname(input.file_name);
		const baseName = path.basename(input.file_name, ext);
		const uniqueFileName = `${baseName}-${id.slice(0, 8)}${ext}`;
		const filePath = path.join(storageDir, uniqueFileName);

		// 写入文件
		const encoding = input.encoding === "base64" ? "base64" : "utf-8";
		const buffer =
			encoding === "base64"
				? Buffer.from(input.content, "base64")
				: Buffer.from(input.content, "utf-8");

		await fs.writeFile(filePath, buffer);

		const fileType = getFileType(input.file_name);
		const mimeType = getMimeType(input.file_name);
		const now = Date.now();

		// 计算过期时间
		const expiresAt = settings.auto_cleanup
			? now + settings.retention_days * 24 * 60 * 60 * 1000
			: null;

		// 保存到数据库
		await db.client.execute({
			sql: `INSERT INTO artifacts (id, session_id, file_name, file_path, file_type, file_size, mime_type, tool_call_id, description, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.session_id,
				input.file_name,
				filePath,
				fileType,
				buffer.byteLength,
				mimeType,
				input.tool_call_id ?? null,
				input.description ?? null,
				now,
				expiresAt,
			],
		});

		return {
			id,
			session_id: input.session_id,
			file_name: input.file_name,
			file_path: filePath,
			file_type: fileType,
			file_size: buffer.byteLength,
			mime_type: mimeType,
			tool_call_id: input.tool_call_id,
			description: input.description,
			created_at: now,
			expires_at: expiresAt ?? undefined,
		};
	};

	// 列出产物
	const artifact_list: Handler<"artifact_list"> = async (_event, input) => {
		let sql = `SELECT * FROM artifacts WHERE 1=1`;
		const args: (string | number)[] = [];

		if (input.session_id) {
			sql += ` AND session_id = ?`;
			args.push(input.session_id);
		}

		sql += ` ORDER BY created_at DESC`;

		if (input.limit) {
			sql += ` LIMIT ?`;
			args.push(input.limit);
		}

		const rows = await db.client.execute({ sql, args });
		return rows.rows.map((row) =>
			parseArtifact(row as Record<string, unknown>),
		);
	};

	// 获取单个产物
	const artifact_get: Handler<"artifact_get"> = async (_event, input) => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM artifacts WHERE id = ?`,
			args: [input.id],
		});

		if (rows.rows.length === 0) return null;
		return parseArtifact(rows.rows[0] as Record<string, unknown>);
	};

	// 删除产物
	const artifact_delete: Handler<"artifact_delete"> = async (_event, input) => {
		// 先获取文件路径
		const artifact = await artifact_get(_event, { id: input.id });
		if (artifact) {
			// 删除文件
			try {
				await fs.unlink(artifact.file_path);
			} catch {
				// 文件可能已经不存在，忽略错误
			}
		}

		// 从数据库删除
		await db.client.execute({
			sql: `DELETE FROM artifacts WHERE id = ?`,
			args: [input.id],
		});

		return { success: true };
	};

	// 在 Finder/Explorer 中显示
	const artifact_reveal: Handler<"artifact_reveal"> = async (_event, input) => {
		const artifact = await artifact_get(_event, { id: input.id });
		if (!artifact) {
			throw new Error(`Artifact not found: ${input.id}`);
		}

		shell.showItemInFolder(artifact.file_path);
		return { success: true };
	};

	// 下载到用户选择的位置
	const artifact_download: Handler<"artifact_download"> = async (
		_event,
		input,
	) => {
		const artifact = await artifact_get(_event, { id: input.id });
		if (!artifact) {
			throw new Error(`Artifact not found: ${input.id}`);
		}

		let destPath = input.dest_path;

		// 如果没有指定目标路径，弹出保存对话框
		if (!destPath) {
			const result = await dialog.showSaveDialog({
				defaultPath: artifact.file_name,
				filters: [{ name: "All Files", extensions: ["*"] }],
			});

			if (result.canceled || !result.filePath) {
				throw new Error("用户取消了保存操作");
			}

			destPath = result.filePath;
		}

		// 复制文件
		await fs.copyFile(artifact.file_path, destPath);

		return { path: destPath };
	};

	// 导入到资料库
	const artifact_import_to_library: Handler<
		"artifact_import_to_library"
	> = async (_event, input) => {
		const artifact = await artifact_get(_event, { id: input.id });
		if (!artifact) {
			throw new Error(`Artifact not found: ${input.id}`);
		}

		const id = crypto.randomUUID();
		const now = Date.now();

		// 确定资料类型
		const kindMap: Record<ArtifactFileType, Source["kind"]> = {
			image: "image",
			video: "audio", // 暂时归类为 audio
			audio: "audio",
			pdf: "document",
			document: "document",
			spreadsheet: "document",
			presentation: "document",
			text: "text",
			code: "text",
			html: "web",
			archive: "document",
			other: "document",
		};

		const kind = kindMap[artifact.file_type] || "document";

		// pathToFileURL 跨平台处理：Windows 盘符 + 空格/特殊字符编码
		const fileUrl = pathToFileURL(artifact.file_path).toString();

		// 创建资料
		await db.client.execute({
			sql: `INSERT INTO sources (id, title, kind, tags, url, folder_id, source_type, category, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				artifact.file_name,
				kind,
				"[]",
				fileUrl,
				input.folder_id ?? null,
				"import",
				"document",
				artifact.description ?? `从 Agent 产物导入: ${artifact.file_name}`,
				now,
				now,
			],
		});

		return {
			id,
			title: artifact.file_name,
			kind,
			tags: [],
			url: fileUrl,
			folder_id: input.folder_id,
			source_type: "import",
			category: "document",
			description:
				artifact.description ?? `从 Agent 产物导入: ${artifact.file_name}`,
			created_at: now,
			updated_at: now,
		};
	};

	// 清理过期产物（逻辑抽为模块级 cleanupExpiredArtifacts，供 dbMaintenance 调度共用）
	const artifact_cleanup: Handler<"artifact_cleanup"> = async (
		_event,
		input,
	) => {
		return cleanupExpiredArtifacts(db, Boolean(input.force));
	};

	// 获取设置
	const artifact_get_settings: Handler<"artifact_get_settings"> = async () => {
		return await getSettings();
	};

	// 更新设置
	const artifact_update_settings: Handler<"artifact_update_settings"> = async (
		_event,
		input,
	) => {
		const current = await getSettings();
		const updated = { ...current, ...input };

		await db.client.execute({
			sql: `INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)`,
			args: ["artifact_settings", JSON.stringify(updated), Date.now()],
		});

		cachedSettings = updated;
		return updated;
	};

	return {
		artifact_save,
		artifact_list,
		artifact_get,
		artifact_delete,
		artifact_reveal,
		artifact_download,
		artifact_import_to_library,
		artifact_cleanup,
		artifact_get_settings,
		artifact_update_settings,
	};
}

// =====================================================================
// 模块级清理函数（IPC handler 与 dbMaintenance 24h 调度共用）
// =====================================================================

/** 删除一批产物行 + 对应磁盘文件。文件不存在视为已删除；其他文件错误记入 errors 并跳过该行。 */
async function removeArtifactRows(
	db: DbContext,
	rows: Record<string, unknown>[],
): Promise<ArtifactCleanupResult> {
	const result: ArtifactCleanupResult = {
		deleted_count: 0,
		freed_bytes: 0,
		errors: [],
	};

	for (const row of rows) {
		const id = row.id as string;
		const filePath = row.file_path as string | null;
		const fileName = (row.file_name as string) || id;
		const fileSize = Number(row.file_size ?? 0);

		try {
			if (filePath) {
				try {
					await fs.unlink(filePath);
					result.freed_bytes += Number.isFinite(fileSize) ? fileSize : 0;
				} catch (err) {
					// ENOENT：文件已不存在，行照删；其他错误保留行，下次重试
					if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
				}
			}

			await db.client.execute({
				sql: `DELETE FROM artifacts WHERE id = ?`,
				args: [id],
			});
			result.deleted_count++;
		} catch (err) {
			result.errors.push(
				`删除 ${fileName} 失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	return result;
}

/** 清理过期产物（expires_at 已到期）。force=true 时删除所有设置了 expires_at 的产物。 */
export async function cleanupExpiredArtifacts(
	db: DbContext,
	force = false,
): Promise<ArtifactCleanupResult> {
	let sql = `SELECT id, file_path, file_name, file_size FROM artifacts WHERE expires_at IS NOT NULL`;
	const args: number[] = [];
	if (!force) {
		sql += ` AND expires_at < ?`;
		args.push(Date.now());
	}
	const rows = await db.client.execute({ sql, args });
	return removeArtifactRows(db, rows.rows as Record<string, unknown>[]);
}

/** D3：清理孤儿产物 —— 所属 agent 会话已被删除（artifacts 表无外键，需应用层兜底）。 */
export async function cleanupOrphanArtifacts(
	db: DbContext,
): Promise<ArtifactCleanupResult> {
	const rows = await db.client.execute(
		`SELECT a.id, a.file_path, a.file_name, a.file_size FROM artifacts a
		 LEFT JOIN agent_sessions s ON s.id = a.session_id
		 WHERE s.id IS NULL`,
	);
	return removeArtifactRows(db, rows.rows as Record<string, unknown>[]);
}

/** D3：删除指定会话的全部产物行 + 磁盘文件（删除 agent 会话时显式级联调用）。 */
export async function deleteArtifactsBySession(
	db: DbContext,
	sessionId: string,
): Promise<ArtifactCleanupResult> {
	const rows = await db.client.execute({
		sql: `SELECT id, file_path, file_name, file_size FROM artifacts WHERE session_id = ?`,
		args: [sessionId],
	});
	const result = await removeArtifactRows(
		db,
		rows.rows as Record<string, unknown>[],
	);

	// 尝试移除产物的会话子目录（仅当已空；非空/不存在时静默跳过）
	const dirs = new Set<string>();
	for (const row of rows.rows) {
		const filePath = row.file_path as string | null;
		if (filePath) dirs.add(path.dirname(filePath));
	}
	for (const dir of dirs) {
		try {
			await fs.rmdir(dir);
		} catch {
			// 目录非空或不存在，忽略
		}
	}

	return result;
}
