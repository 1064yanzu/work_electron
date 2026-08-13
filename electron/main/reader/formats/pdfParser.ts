/**
 * PDF 解析纯实现（主进程与 parser worker 共享）。
 *
 * pdf-parse 对大文件的全文抽取是重 CPU 操作，会阻塞主进程事件循环；
 * 通过 workers/parserHost 派发到 utilityProcess 执行，本文件保持纯 Node
 * 实现（禁止引用 electron 运行时 API），worker 与主进程内联降级共用同一份逻辑。
 */
import fs from "node:fs/promises";
import path from "node:path";

import type { ReaderTocItem } from "../../../shared/ipc-schema";
import type { ParsedBook } from "./types";
import { txtCountWords } from "./txt";

type PdfParseResult = {
	numpages?: number;
	numPages?: number;
	text?: string;
	info?: Record<string, unknown> | null;
	metadata?: Record<string, unknown> | null;
};

async function loadPdfParse(): Promise<{
	parse: (data: Uint8Array) => Promise<PdfParseResult>;
}> {
	// pdf-parse 在该项目中已有用例：new PDFParse({ data: Uint8Array }).getText()
	type LooseGetText = { text: string; total_pages?: number } & Record<
		string,
		unknown
	>;
	type LooseGetInfo = {
		numpages?: number;
		info?: Record<string, unknown> | null;
		metadata?: Record<string, unknown> | null;
	} & Record<string, unknown>;

	const mod = (await import("pdf-parse")) as unknown as {
		default?: unknown;
		PDFParse?: new (opts: {
			data: Uint8Array;
		}) => {
			getText(): Promise<LooseGetText>;
			getInfo?(): Promise<LooseGetInfo>;
			destroy(): Promise<void>;
		};
	};

	const PDFParse =
		mod.PDFParse ?? (mod.default as typeof mod.PDFParse | undefined);

	if (PDFParse) {
		return {
			async parse(data: Uint8Array) {
				const inst = new PDFParse({ data });
				try {
					const text = (await inst.getText()) as LooseGetText;
					let info: PdfParseResult["info"] = null;
					let metadata: PdfParseResult["metadata"] = null;
					let numpages: number | undefined =
						typeof text.total_pages === "number" ? text.total_pages : undefined;
					if (typeof inst.getInfo === "function") {
						try {
							const meta = (await inst.getInfo()) as LooseGetInfo;
							info = (meta?.info as Record<string, unknown> | null) ?? null;
							metadata =
								(meta?.metadata as Record<string, unknown> | null) ?? null;
							if (!numpages && typeof meta?.numpages === "number") {
								numpages = meta.numpages;
							}
						} catch {}
					}
					return {
						numpages,
						text: text.text || "",
						info,
						metadata,
					};
				} finally {
					await inst.destroy();
				}
			},
		};
	}

	// fallback：旧式 pdf-parse 默认导出函数
	const fn = mod as unknown as (
		data: Uint8Array | Buffer,
	) => Promise<PdfParseResult>;
	return {
		async parse(data: Uint8Array) {
			return fn(data);
		},
	};
}

export async function parsePdfBook(absolutePath: string): Promise<ParsedBook> {
	const buf = await fs.readFile(absolutePath);
	const data = new Uint8Array(buf);
	const baseName = path.basename(absolutePath, path.extname(absolutePath));

	try {
		const pdf = await loadPdfParse();
		const result = await pdf.parse(data);
		const text = result.text || "";
		const numPages = Number(result.numpages || result.numPages || 0) || null;
		const info = (result.info as Record<string, unknown> | null) || null;

		const title =
			(typeof info?.Title === "string" && info.Title.trim()) || baseName;
		const author =
			typeof info?.Author === "string" && info.Author.trim()
				? info.Author.trim()
				: "";
		const subject =
			typeof info?.Subject === "string" ? info.Subject.trim() : "";

		const toc: ReaderTocItem[] = numPages
			? Array.from({ length: numPages }, (_, i) => ({
					id: `page-${i + 1}`,
					label: `第 ${i + 1} 页`,
					href: `page-${i + 1}`,
					level: 1,
				}))
			: [];

		return {
			title: title || baseName,
			authors: author ? [author] : [],
			language: null,
			format: "pdf",
			page_count: numPages,
			word_count: txtCountWords(text),
			toc,
			metadata: {
				info,
				subject: subject || undefined,
				producer:
					typeof info?.Producer === "string" ? info.Producer : undefined,
				creator: typeof info?.Creator === "string" ? info.Creator : undefined,
			},
			full_text: text,
			cover: null,
		};
	} catch (err) {
		// PDF 解析失败：仍然写入书架（前端可加载渲染），但缺 TOC 与全文
		return {
			title: baseName,
			authors: [],
			language: null,
			format: "pdf",
			page_count: null,
			word_count: null,
			toc: [],
			metadata: {
				parse_error: err instanceof Error ? err.message : String(err),
			},
			full_text: "",
			cover: null,
		};
	}
}
