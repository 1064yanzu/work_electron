/**
 * 源文件扫描器
 * 替代原来从数据库查询 sources + notes 的逻辑
 * 直接扫描 scopePath 目录中的文件，支持增量处理
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScannedSource, WikiSchema } from "./types";

// ---------------------------------------------------------------------------
// 文件扫描
// ---------------------------------------------------------------------------

/**
 * 扫描 scopePath 目录中的文档类文件
 * 遵循 schema 中的扩展名和忽略规则
 */
export async function scanSourceFiles(
	scopePath: string,
	schema: WikiSchema,
): Promise<ScannedSource[]> {
	const resolved = path.resolve(scopePath);
	const sources: ScannedSource[] = [];
	const extensionSet = new Set(
		schema.scan_extensions.map((e) => e.toLowerCase()),
	);
	const ignoreSet = new Set(schema.scan_ignore_patterns);

	await walkDir(resolved, sources, extensionSet, ignoreSet, resolved);

	return sources;
}

async function walkDir(
	dirPath: string,
	sources: ScannedSource[],
	extensions: Set<string>,
	ignorePatterns: Set<string>,
	rootPath: string,
	depth = 0,
): Promise<void> {
	// 限制扫描深度，避免过深递归
	if (depth > 5) return;

	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(dirPath, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);

		// 跳过忽略的目录/文件
		if (ignorePatterns.has(entry.name)) continue;
		// 跳过隐藏文件/目录（以 . 开头），除了显式配置的
		if (entry.name.startsWith(".")) continue;

		if (entry.isDirectory()) {
			await walkDir(
				fullPath,
				sources,
				extensions,
				ignorePatterns,
				rootPath,
				depth + 1,
			);
		} else if (entry.isFile()) {
			const ext = path.extname(entry.name).toLowerCase();
			if (!extensions.has(ext)) continue;

			try {
				const stat = await fs.stat(fullPath);
				sources.push({
					path: fullPath,
					name: entry.name,
					ext,
					size: stat.size,
				});
			} catch {
				// 单个文件 stat 失败不影响整体
			}
		}
	}
}

// ---------------------------------------------------------------------------
// 增量过滤
// ---------------------------------------------------------------------------

/**
 * 对比 schema 中的 processed_sources，找出新增或已修改的文件
 */
export async function filterNewSources(
	files: ScannedSource[],
	schema: WikiSchema,
): Promise<ScannedSource[]> {
	const newSources: ScannedSource[] = [];

	for (const file of files) {
		const existing = schema.processed_sources[file.path];

		if (!existing) {
			// 从未处理过
			newSources.push(file);
			continue;
		}

		// 文件大小变化 → 可能已修改
		if (existing.size !== file.size) {
			newSources.push(file);
			continue;
		}

		// 文件大小相同 → 计算 hash 确认
		try {
			const hash = await computeFileHash(file.path);
			if (hash !== existing.hash) {
				newSources.push(file);
			}
		} catch {
			// hash 计算失败，保守地将其视为新文件
			newSources.push(file);
		}
	}

	return newSources;
}

// ---------------------------------------------------------------------------
// 文件内容提取
// ---------------------------------------------------------------------------

/**
 * 根据文件类型提取文本内容
 */
export async function extractFileContent(
	filePath: string,
): Promise<string> {
	const ext = path.extname(filePath).toLowerCase();

	switch (ext) {
		case ".pdf":
			return extractPdfContent(filePath);
		case ".md":
		case ".txt":
			return fs.readFile(filePath, "utf-8");
		case ".html":
		case ".htm":
			return extractHtmlContent(filePath);
		case ".docx":
		case ".doc":
			return extractDocxContent(filePath);
		default:
			return fs.readFile(filePath, "utf-8");
	}
}

async function extractPdfContent(filePath: string): Promise<string> {
	try {
		const buffer = await fs.readFile(filePath);
		const { PDFParse } = await import("pdf-parse");
		const pdf = new PDFParse({ data: new Uint8Array(buffer) });
		const result = await pdf.getText();
		await pdf.destroy();
		return typeof result === "string" ? result : String(result || "");
	} catch (err) {
		console.warn(
			`[sourceScanner] PDF extraction failed for ${filePath}:`,
			err,
		);
		return "";
	}
}

async function extractHtmlContent(filePath: string): Promise<string> {
	try {
		const html = await fs.readFile(filePath, "utf-8");
		// 使用已有的 htmlToText 工具
		const { htmlToText } = await import("../htmlToText");
		return htmlToText(html);
	} catch {
		// 回退：简单地移除 HTML 标签
		const html = await fs.readFile(filePath, "utf-8");
		return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
	}
}

async function extractDocxContent(filePath: string): Promise<string> {
	try {
		const buffer = await fs.readFile(filePath);
		// 尝试使用 mammoth
		const mammoth = await import("mammoth");
		const result = await mammoth.extractRawText({ buffer });
		return result.value || "";
	} catch {
		console.warn(
			`[sourceScanner] DOCX extraction failed for ${filePath}, trying as text`,
		);
		try {
			return await fs.readFile(filePath, "utf-8");
		} catch {
			return "";
		}
	}
}

// ---------------------------------------------------------------------------
// 文件哈希
// ---------------------------------------------------------------------------

/**
 * 计算文件的 SHA256 哈希
 */
export async function computeFileHash(filePath: string): Promise<string> {
	const buffer = await fs.readFile(filePath);
	const hash = createHash("sha256").update(buffer).digest("hex");
	return `sha256:${hash}`;
}

// ---------------------------------------------------------------------------
// Schema 更新
// ---------------------------------------------------------------------------

/**
 * 将文件标记为已处理，更新 schema
 */
export function markSourceProcessed(
	schema: WikiSchema,
	filePath: string,
	hash: string,
	size: number,
): void {
	schema.processed_sources[filePath] = {
		hash,
		processed_at: Date.now(),
		size,
	};
}
