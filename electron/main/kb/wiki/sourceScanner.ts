/**
 * 源文件扫描器
 * 替代原来从数据库查询 sources + notes 的逻辑
 * 直接扫描 scopePath 目录中的文件，支持增量处理
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { ScannedSource, SkippedReason, WikiSchema } from "./types";

/**
 * 解析 pdf.worker.mjs 文件的绝对路径。
 * 优先使用 pdf-parse 自带的 worker（与其内部 pdfjs-dist 版本匹配），
 * 回退到 pdfjs-dist 的 legacy/最新 worker。找不到则返回 null。
 */
function resolvePdfWorkerPath(): string | null {
	try {
		// CJS 输出中 require 原生可用；ESM 下用 createRequire 兜底
		const req =
			typeof require === "function" ? require : createRequire(import.meta.url);
		const candidates = [
			"pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs",
			"pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs",
			"pdfjs-dist/legacy/build/pdf.worker.mjs",
			"pdfjs-dist/build/pdf.worker.mjs",
		];
		for (const id of candidates) {
			try {
				return req.resolve(id);
			} catch {
				// 继续尝试下一个候选
			}
		}
	} catch (err) {
		console.warn("[sourceScanner] Failed to resolve PDF worker path:", err);
	}
	return null;
}

let pdfWorkerInitialized = false;
function ensurePdfWorker(PDFParse: {
	setWorker: (path: string) => string;
}): void {
	if (pdfWorkerInitialized) return;
	const workerPath = resolvePdfWorkerPath();
	if (workerPath) {
		try {
			PDFParse.setWorker(workerPath);
			console.log(`[sourceScanner] PDF worker set to: ${workerPath}`);
		} catch (err) {
			console.warn("[sourceScanner] setWorker call failed:", err);
		}
	} else {
		console.warn("[sourceScanner] 无法定位 pdf.worker.mjs；PDF 提取可能失败。");
	}
	pdfWorkerInitialized = true;
}

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
 * 对比 schema 中的 processed_sources / skipped_sources，找出新增或已修改的文件
 * 同时跳过：
 *  - 已成功生成过页面的文件（processed_sources，hash + size 相同时）
 *  - 上次被判定无法提取内容的文件（skipped_sources，hash + size 相同时）
 * 当 hash 或 size 发生变化时，两者都会被当成「新文件」重新尝试。
 */
export async function filterNewSources(
	files: ScannedSource[],
	schema: WikiSchema,
): Promise<ScannedSource[]> {
	const newSources: ScannedSource[] = [];

	for (const file of files) {
		const processed = schema.processed_sources[file.path];
		const skipped = schema.skipped_sources?.[file.path];
		const known = processed ?? skipped;

		if (!known) {
			// 从未处理过也未被跳过
			newSources.push(file);
			continue;
		}

		// 文件大小变化 → 可能已修改，重新尝试
		if (known.size !== file.size) {
			newSources.push(file);
			continue;
		}

		// 文件大小相同 → 计算 hash 确认
		try {
			const hash = await computeFileHash(file.path);
			if (hash !== known.hash) {
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
export async function extractFileContent(filePath: string): Promise<string> {
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
		const pdfParseModule = await import("pdf-parse");
		const PDFParse = pdfParseModule.PDFParse;
		ensurePdfWorker(PDFParse);
		const pdf = new PDFParse({ data: new Uint8Array(buffer) });
		const result = await pdf.getText();
		await pdf.destroy();
		// pdf-parse v2 的 TextResult 对象带 text 字段（整篇文本）
		if (result && typeof result === "object" && "text" in result) {
			return String((result as { text: unknown }).text ?? "");
		}
		return typeof result === "string" ? result : String(result || "");
	} catch (err) {
		console.warn(`[sourceScanner] PDF extraction failed for ${filePath}:`, err);
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
		return html
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim();
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
 * 将文件标记为已处理（成功生成过页面），更新 schema。
 * 同时清理 skipped_sources 中的旧记录（如果之前被跳过过）。
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
	if (schema.skipped_sources && schema.skipped_sources[filePath]) {
		delete schema.skipped_sources[filePath];
	}
}

/**
 * 将文件标记为已跳过（扫描到但未能生成页面），更新 schema。
 * 同时清理 processed_sources 中的旧记录（如果之前曾成功生成过页面、现在又失败了）。
 */
export function markSourceSkipped(
	schema: WikiSchema,
	filePath: string,
	hash: string,
	size: number,
	reason: SkippedReason,
	reasonDetail?: string,
): void {
	if (!schema.skipped_sources) schema.skipped_sources = {};
	schema.skipped_sources[filePath] = {
		hash,
		skipped_at: Date.now(),
		size,
		reason,
		reason_detail: reasonDetail,
	};
	if (schema.processed_sources[filePath]) {
		delete schema.processed_sources[filePath];
	}
}

/**
 * 清空 skipped_sources，允许下次生成时重新尝试这些文件。
 * 返回被清空的数量。
 */
export function resetSkippedSources(schema: WikiSchema): number {
	if (!schema.skipped_sources) return 0;
	const count = Object.keys(schema.skipped_sources).length;
	schema.skipped_sources = {};
	return count;
}

/**
 * 清空 processed_sources，允许下次生成时重新处理所有文件。
 * 返回被清空的数量。不会影响已存在的 wiki 页面文件，只会重置「增量过滤记忆」。
 */
export function resetProcessedSources(schema: WikiSchema): number {
	const count = Object.keys(schema.processed_sources).length;
	schema.processed_sources = {};
	return count;
}
