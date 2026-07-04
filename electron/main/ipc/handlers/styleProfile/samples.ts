/**
 * styleProfile/samples.ts — 样本管理 + 文件解析 + zip 批量导入
 */
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema, StyleSample } from "../../../../shared/ipc-schema";
import type { DbContext } from "../../../db/client";
import { randomUUID } from "node:crypto";
import { readFile, unlink, mkdtemp } from "node:fs/promises";
import { extname, basename, join } from "node:path";
import { tmpdir } from "node:os";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function rowToSample(row: Record<string, unknown>): StyleSample {
	return {
		id: row.id as string,
		profile_id: row.profile_id as string,
		title: (row.title as string | null) ?? null,
		content: row.content as string,
		content_type:
			(row.content_type as StyleSample["content_type"]) ?? "article",
		authorization_status:
			(row.authorization_status as StyleSample["authorization_status"]) ??
			"self_authored",
		word_count: (row.word_count as number) ?? 0,
		created_at: row.created_at as number,
	};
}

function countWords(text: string): number {
	// 中英文混合字数统计：中文按字符，英文按单词
	const chinese = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
	const english = (
		text.replace(/[\u4e00-\u9fff]/g, " ").match(/\b\w+\b/g) ?? []
	).length;
	return chinese + english;
}

async function parseFileContent(
	filePath: string,
): Promise<{ content: string; title: string }> {
	const ext = extname(filePath).toLowerCase();
	const titleFromPath = basename(filePath, ext);

	if (ext === ".txt" || ext === ".md") {
		const content = await readFile(filePath, "utf-8");
		// md 文件尝试从第一个 # 标题提取
		const mdTitle = content.match(/^#+\s+(.+)/m)?.[1];
		return { content, title: mdTitle ?? titleFromPath };
	}

	if (ext === ".docx") {
		try {
			// 动态 require mammoth（主进程已有此依赖用于文档处理）
			const mammoth = await import("mammoth");
			const result = await mammoth.extractRawText({ path: filePath });
			return { content: result.value, title: titleFromPath };
		} catch {
			throw new Error(`解析 docx 文件失败：${filePath}`);
		}
	}

	if (ext === ".pdf") {
		try {
			const { PDFParse } = await import("pdf-parse");
			const buffer = await readFile(filePath);
			const parser = new PDFParse({ data: buffer });
			const data = await parser.getText();
			return { content: data.text, title: titleFromPath };
		} catch {
			throw new Error(`解析 PDF 文件失败：${filePath}`);
		}
	}

	throw new Error(`不支持的文件格式：${ext}。支持：txt, md, docx, pdf`);
}

/** 直接向数据库插入样本（供内部批量调用） */
async function insertSampleRow(
	db: DbContext,
	params: {
		profile_id: string;
		title: string | null;
		content: string;
		word_count: number;
	},
): Promise<void> {
	const id = randomUUID();
	const now = Date.now();
	await db.client.execute({
		sql: `INSERT INTO style_samples
      (id, profile_id, title, content, content_type, authorization_status, word_count, created_at)
      VALUES (?, ?, ?, ?, 'article', 'self_authored', ?, ?)`,
		args: [
			id,
			params.profile_id,
			params.title,
			params.content,
			params.word_count,
			now,
		],
	});
	await db.client.execute({
		sql: `UPDATE style_profiles SET updated_at = ? WHERE id = ?`,
		args: [now, params.profile_id],
	});
}

const SUPPORTED_EXTS = new Set([".txt", ".md", ".docx", ".pdf"]);
const MAX_ENTRY_SIZE = 20 * 1024 * 1024; // 20MB 单文件上限

export function createStyleSampleHandlers(db: DbContext) {
	const addSample: Handler<"style_sample_add"> = async (_event, input) => {
		const id = randomUUID();
		const now = Date.now();
		const wordCount = countWords(input.content);

		await db.client.execute({
			sql: `INSERT INTO style_samples
        (id, profile_id, title, content, content_type, authorization_status, word_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.profile_id,
				input.title ?? null,
				input.content,
				input.content_type ?? "article",
				input.authorization_status ?? "self_authored",
				wordCount,
				now,
			],
		});

		// 更新 profile updated_at
		await db.client.execute({
			sql: `UPDATE style_profiles SET updated_at = ? WHERE id = ?`,
			args: [now, input.profile_id],
		});

		const rows = await db.client.execute({
			sql: `SELECT * FROM style_samples WHERE id = ?`,
			args: [id],
		});
		return rowToSample(rows.rows[0] as Record<string, unknown>);
	};

	const removeSample: Handler<"style_sample_remove"> = async (
		_event,
		input,
	) => {
		await db.client.execute({
			sql: `DELETE FROM style_samples WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	const listSamples: Handler<"style_sample_list"> = async (_event, input) => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM style_samples WHERE profile_id = ? ORDER BY created_at ASC`,
			args: [input.profile_id],
		});
		return rows.rows.map((r) => rowToSample(r as Record<string, unknown>));
	};

	const parseFile: Handler<"style_sample_parse_file"> = async (
		_event,
		input,
	) => {
		const { content, title } = await parseFileContent(input.file_path);
		const wordCount = countWords(content);
		return { content, title, word_count: wordCount };
	};

	/**
	 * 从 zip 压缩包批量导入样本。
	 * - txt/md 直接从内存读取，无需临时文件
	 * - docx/pdf 解压到系统临时目录解析后删除
	 */
	const importFromZip: Handler<"style_sample_import_from_zip"> = async (
		_event,
		input,
	) => {
		const StreamZip = (await import("node-stream-zip")).default;
		const zip = new StreamZip.async({ file: input.zip_path });

		let imported = 0;
		let failed = 0;
		const results: Array<{ file: string; success: boolean; error?: string }> =
			[];

		// 临时目录（仅 docx/pdf 使用）
		let tmpDir: string | null = null;

		try {
			const entries = await zip.entries();

			for (const [entryName, entry] of Object.entries(entries)) {
				// 跳过目录
				if ((entry as { isDirectory: boolean }).isDirectory) continue;

				const ext = extname(entryName).toLowerCase();
				if (!SUPPORTED_EXTS.has(ext)) continue;

				if ((entry as { size: number }).size > MAX_ENTRY_SIZE) {
					results.push({
						file: entryName,
						success: false,
						error: "文件超过 20MB 上限",
					});
					failed++;
					continue;
				}

				const shortName = basename(entryName, ext);

				try {
					let content: string;
					let title: string;

					if (ext === ".txt" || ext === ".md") {
						// 直接从 zip 内存读取
						const buf = await zip.entryData(entryName);
						content = buf.toString("utf-8");
						const mdTitle = content.match(/^#+\s+(.+)/m)?.[1];
						title = mdTitle ?? shortName;
					} else {
						// docx/pdf 需要临时文件
						if (!tmpDir) {
							tmpDir = await mkdtemp(join(tmpdir(), "style-zip-"));
						}
						const tmpFile = join(tmpDir, basename(entryName));
						await zip.extract(entryName, tmpFile);
						try {
							const parsed = await parseFileContent(tmpFile);
							content = parsed.content;
							title = parsed.title;
						} finally {
							await unlink(tmpFile).catch(() => {});
						}
					}

					const wordCount = countWords(content);
					await insertSampleRow(db, {
						profile_id: input.profile_id,
						title,
						content,
						word_count: wordCount,
					});

					imported++;
					results.push({ file: entryName, success: true });
				} catch (e) {
					failed++;
					results.push({
						file: entryName,
						success: false,
						error: e instanceof Error ? e.message : String(e),
					});
				}
			}
		} finally {
			await zip.close();
			// 清理临时目录
			if (tmpDir) {
				const { rmdir } = await import("node:fs/promises");
				await rmdir(tmpDir).catch(() => {});
			}
		}

		return { imported, failed, results };
	};

	return {
		style_sample_add: addSample,
		style_sample_remove: removeSample,
		style_sample_list: listSamples,
		style_sample_parse_file: parseFile,
		style_sample_import_from_zip: importFromZip,
	};
}
