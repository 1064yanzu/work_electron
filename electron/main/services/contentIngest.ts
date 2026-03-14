import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { net } from "electron";
import { JSDOM, VirtualConsole } from "jsdom";
import mammoth from "mammoth";

import type { DbContext } from "../db/client";
import type {
	Note,
	Source,
	SourceCategory,
	SourceKind,
	SourceOrigin,
} from "../../shared/types";
import { extractArticleFromHtml } from "../kb/extractArticleFromHtml";
import { rebuildNoteChunks } from "../kb/rebuildNoteChunks";
import { syncSourceToVault } from "../storage/sync";
import { requireAbsoluteLocalPath } from "../utils/localPaths";

export type FetchUrlContentInput = {
	url: string;
	title?: string;
	tags?: string[];
	project_id?: string;
	folder_id?: string;
	source_type?: SourceOrigin;
	category?: SourceCategory;
};

export type UploadFileContentInput = {
	title: string;
	content: string;
	file_type: string;
	tags?: string[];
	project_id?: string;
	folder_id?: string;
	source_type?: SourceOrigin;
	category?: SourceCategory;
};

export type ImportLocalFilesInput = {
	paths: string[];
	tags?: string[];
	project_id?: string;
	folder_id?: string;
	source_type?: SourceOrigin;
};

type MetaExtract = {
	title?: string;
	description?: string;
	thumbnail?: string;
	author?: string;
	published_at?: number;
};

function normalizeUrlInput(url: string): string {
	const raw = String(url || "").trim();
	if (!raw) return "";
	if (/^(https?:\/\/|file:\/\/)/i.test(raw)) return raw;
	return `https://${raw}`;
}

async function fetchHtmlDocument(url: string): Promise<{
	finalUrl: string;
	html: string;
	contentType: string;
}> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 25_000);
	try {
		const res = await net.fetch(url, {
			method: "GET",
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
			signal: controller.signal,
		});

		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}

		const contentType = res.headers.get("content-type") || "";
		const html = await res.text();
		const finalUrl = res.url || url;
		return { finalUrl, html, contentType };
	} finally {
		clearTimeout(timer);
	}
}

function parsePublishedAt(value: string): number | undefined {
	const raw = value.trim();
	if (!raw) return undefined;
	const ts = Date.parse(raw);
	if (Number.isFinite(ts)) return ts;
	return undefined;
}

function extractMetaFromHtml(html: string, baseUrl: string): MetaExtract {
	try {
		const virtualConsole = new VirtualConsole();
		const dom = new JSDOM(html, { url: baseUrl, virtualConsole });
		const doc = dom.window.document;

		const getMeta = (sel: string) =>
			doc.querySelector(sel)?.getAttribute("content")?.trim() || "";

		const title =
			getMeta('meta[property="og:title"]') ||
			getMeta('meta[name="twitter:title"]') ||
			(doc.title || "").trim() ||
			undefined;

		const description =
			getMeta('meta[property="og:description"]') ||
			getMeta('meta[name="description"]') ||
			getMeta('meta[name="twitter:description"]') ||
			undefined;

		const thumbnail =
			getMeta('meta[property="og:image"]') ||
			getMeta('meta[name="twitter:image"]') ||
			undefined;

		const author =
			getMeta('meta[name="author"]') ||
			getMeta('meta[property="article:author"]') ||
			undefined;

		const published_at =
			parsePublishedAt(getMeta('meta[property="article:published_time"]')) ||
			parsePublishedAt(getMeta('meta[name="article:published_time"]')) ||
			parsePublishedAt(getMeta('meta[property="og:published_time"]')) ||
			parsePublishedAt(getMeta('meta[name="date"]')) ||
			parsePublishedAt(getMeta('meta[property="datePublished"]')) ||
			undefined;

		return { title, description, thumbnail, author, published_at };
	} catch {
		return {};
	}
}

function guessKindFromExtension(ext: string): SourceKind {
	const e = ext.replace(/^\./, "").toLowerCase();
	if (["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(e)) {
		return "document";
	}
	if (
		["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tif", "tiff"].includes(
			e,
		)
	) {
		return "image";
	}
	if (["mp3", "wav", "m4a", "aac", "flac"].includes(e)) return "audio";
	return "text";
}

function guessCategoryForKind(kind: SourceKind): SourceCategory {
	if (kind === "document") return "document";
	if (kind === "image") return "image";
	if (kind === "audio") return "audio";
	return "article";
}

function stripHtmlToText(html: string): string {
	try {
		const virtualConsole = new VirtualConsole();
		const dom = new JSDOM(html, { virtualConsole });
		const text = dom.window.document.body?.textContent || "";
		return text.replace(/\s+/g, " ").trim();
	} catch {
		return html
			.replace(/<[^>]*>/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}
}

async function insertSource(
	db: DbContext,
	input: Omit<Source, "created_at" | "updated_at">,
): Promise<Source> {
	const timestamp = Date.now();
	await db.client.execute({
		sql: `INSERT INTO sources (id, title, kind, scope, tags, url, project_id, folder_id, source_type, origin_type, category, description, thumbnail, author, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			input.id,
			input.title,
			input.kind,
			input.scope ?? "global",
			JSON.stringify(input.tags ?? []),
			input.url ?? null,
			input.project_id ?? null,
			input.folder_id ?? null,
			input.source_type,
			input.origin_type ??
				sourceTypeToOriginType(input.source_type) ??
				"manual",
			input.category,
			input.description ?? null,
			input.thumbnail ?? null,
			input.author ?? null,
			input.published_at ?? null,
			timestamp,
			timestamp,
		],
	});

	return { ...input, created_at: timestamp, updated_at: timestamp };
}

function sourceTypeToOriginType(
	sourceType: SourceOrigin | undefined,
): "manual" | "web_clip" | "import" | "agent_output" {
	if (sourceType === "browser_clip") return "web_clip";
	if (sourceType === "import") return "import";
	return "manual";
}

async function insertNote(
	db: DbContext,
	input: Omit<Note, "created_at" | "updated_at">,
): Promise<Note> {
	const timestamp = Date.now();
	await db.client.execute({
		sql: `INSERT INTO notes (id, source_id, content, content_html, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
		args: [
			input.id,
			input.source_id ?? null,
			input.content,
			input.content_html ?? null,
			timestamp,
			timestamp,
		],
	});

	await rebuildNoteChunks({
		db,
		noteId: input.id,
		sourceId: input.source_id ?? null,
		content: input.content,
	});

	return { ...input, created_at: timestamp, updated_at: timestamp };
}

export async function ingestUrlContent(
	db: DbContext,
	payload: FetchUrlContentInput,
): Promise<{ source: Source; note: Note }> {
	const normalizedUrl = normalizeUrlInput(payload.url);
	if (!normalizedUrl) throw new Error("URL 不能为空");

	const { finalUrl, html } = await fetchHtmlDocument(normalizedUrl);
	const meta = extractMetaFromHtml(html, finalUrl);

	const extracted = extractArticleFromHtml({
		html,
		url: finalUrl,
		titleHint: payload.title || meta.title,
	});

	const title =
		(payload.title || extracted.title || meta.title || finalUrl).trim() ||
		finalUrl;

	const description =
		(extracted.excerpt || meta.description || "").trim() || undefined;

	const thumbnail = meta.thumbnail || undefined;
	const author = extracted.byline || meta.author || undefined;
	const published_at = meta.published_at;

	const contentText = extracted.text || stripHtmlToText(html);
	const contentHtml = extracted.html || undefined;

	const source = await insertSource(db, {
		id: randomUUID(),
		title,
		kind: "web",
		tags: payload.tags ?? [],
		scope: "global",
		url: finalUrl,
		project_id: undefined,
		folder_id: payload.folder_id,
		source_type: payload.source_type ?? "manual",
		origin_type: sourceTypeToOriginType(payload.source_type),
		category: payload.category ?? "article",
		description,
		thumbnail,
		author,
		published_at,
	});

	const note = await insertNote(db, {
		id: randomUUID(),
		source_id: source.id,
		content: contentText || title,
		content_html: contentHtml,
	});
	await syncSourceToVault(db, source.id);

	return { source, note };
}

export async function ingestUploadedFileContent(
	db: DbContext,
	payload: UploadFileContentInput,
): Promise<{ source: Source; note: Note }> {
	const title = String(payload.title || "").trim();
	if (!title) throw new Error("标题不能为空");

	const fileType = String(payload.file_type || "").trim();
	const kind = guessKindFromExtension(fileType);
	const category = payload.category ?? guessCategoryForKind(kind);

	const content = String(payload.content ?? "");
	const contentHtml =
		fileType.toLowerCase() === "html" || fileType.toLowerCase() === "htm"
			? content
			: undefined;
	const contentText = contentHtml ? stripHtmlToText(contentHtml) : content;

	const source = await insertSource(db, {
		id: randomUUID(),
		title,
		kind,
		tags: payload.tags ?? [],
		scope: "global",
		url: undefined,
		project_id: undefined,
		folder_id: payload.folder_id,
		source_type: payload.source_type ?? "manual",
		origin_type: sourceTypeToOriginType(payload.source_type),
		category,
		description: undefined,
		thumbnail: undefined,
		author: undefined,
		published_at: undefined,
	});

	const note = await insertNote(db, {
		id: randomUUID(),
		source_id: source.id,
		content: contentText || title,
		content_html: contentHtml,
	});
	await syncSourceToVault(db, source.id);

	return { source, note };
}

async function ingestLocalFile(
	db: DbContext,
	options: {
		filePath: string;
		tags: string[];
		project_id?: string;
		folder_id?: string;
		source_type: SourceOrigin;
	},
): Promise<{ source: Source; note: Note }> {
	const absPath = requireAbsoluteLocalPath(options.filePath);
	const ext = path.extname(absPath).toLowerCase();
	const baseName = path.basename(absPath);
	const fileUrl = pathToFileURL(absPath).toString();

	const kind = guessKindFromExtension(ext);
	const category = guessCategoryForKind(kind);

	const { contentText, contentHtml } = await (async () => {
		if (ext === ".docx") {
			const result = await mammoth.convertToHtml({ path: absPath });
			const html = result.value || "";
			return {
				contentText: stripHtmlToText(html) || baseName,
				contentHtml: html || undefined,
			};
		}

		if (ext === ".pdf") {
			const html = `<div data-type="pdf" data-src="${fileUrl}"></div>`;
			return { contentText: baseName, contentHtml: html };
		}

		if (kind === "image") {
			const md = `![${baseName}](${fileUrl})`;
			const html = `<figure><img src="${fileUrl}" alt="${baseName}" /><figcaption>${baseName}</figcaption></figure>`;
			return { contentText: md, contentHtml: html };
		}

		const raw = await fs.readFile(absPath, "utf-8");
		if (ext === ".html" || ext === ".htm") {
			const extracted = extractArticleFromHtml({
				html: raw,
				url: fileUrl,
				titleHint: baseName,
			});
			return {
				contentText: extracted.text || stripHtmlToText(raw) || baseName,
				contentHtml: extracted.html || raw || undefined,
			};
		}

		return { contentText: raw, contentHtml: undefined };
	})();

	const source = await insertSource(db, {
		id: randomUUID(),
		title: baseName,
		kind,
		tags: options.tags,
		scope: "global",
		url: undefined,
		project_id: undefined,
		folder_id: options.folder_id,
		source_type: options.source_type,
		origin_type: sourceTypeToOriginType(options.source_type),
		category,
		description: undefined,
		thumbnail: undefined,
		author: undefined,
		published_at: undefined,
	});

	const note = await insertNote(db, {
		id: randomUUID(),
		source_id: source.id,
		content: contentText || baseName,
		content_html: contentHtml,
	});
	await syncSourceToVault(db, source.id);

	return { source, note };
}

export async function importLocalFilesToSources(
	db: DbContext,
	payload: ImportLocalFilesInput,
): Promise<Array<{ source: Source; note: Note }>> {
	const paths = Array.isArray(payload.paths)
		? payload.paths.map((p) => String(p || "").trim()).filter(Boolean)
		: [];
	if (paths.length === 0) return [];

	const tags = Array.isArray(payload.tags)
		? payload.tags.map((t) => String(t).trim()).filter(Boolean)
		: [];

	const source_type: SourceOrigin = payload.source_type ?? "import";

	const results: Array<{ source: Source; note: Note }> = [];
	for (const filePath of paths) {
		try {
			const { source, note } = await ingestLocalFile(db, {
				filePath,
				tags,
				project_id: payload.project_id,
				folder_id: payload.folder_id,
				source_type,
			});
			results.push({ source, note });
		} catch (e) {
			// 单个文件失败不影响整体导入
			// 保持和前端队列 UX 一致：继续处理后续文件
			console.warn(
				"[import_local_files] Failed:",
				filePath,
				e instanceof Error ? e.message : String(e),
			);
		}
	}
	return results;
}
