import fs from "node:fs/promises";
import path from "node:path";

import type { ChapterContent, FormatHandler, ParsedBook } from "./types";

/**
 * MOBI / AZW3 一阶段：识别 + 友好提示。
 * 大部分 MOBI/AZW3 流通带 DRM，纯 JS 解码 KF8 + Huffman 复杂且容易踩 DRM 法律边界。
 * 第一版策略：
 *   1. 探测文件头，区分 PalmDOC / MOBI / KF8。
 *   2. 检测 DRM 标记，给出"请先脱壳或转 EPUB"提示。
 *   3. parse 仍然返回一本"占位书"，让书架体验闭环；getChapter 返回引导内容。
 */

type MobiHeader = {
	magic: "BOOKMOBI" | "TPZ3" | "TPZ" | string;
	hasDrm: boolean;
	isKf8: boolean;
};

async function probeHeader(absolutePath: string): Promise<MobiHeader> {
	const buf = await fs.readFile(absolutePath);
	const head = buf.slice(0, 70);
	const magic = head.slice(60, 68).toString("latin1");
	let isKf8 = false;
	let hasDrm = false;

	if (magic.startsWith("BOOKMOBI")) {
		// MOBI/KF8 头：在 PDB record0 头部 / EXTH 检测 DRM
		// 简化：扫前 4KB 字符串中是否含 DRMP/EXTH-401(DRM Server ID)
		const front = buf.slice(0, Math.min(buf.length, 16_000));
		const txt = front.toString("latin1");
		hasDrm = /DRMP/.test(txt) || /\bdrm\b/i.test(txt);
		isKf8 = /BOUNDARY/.test(txt) || /\bcdic\b/i.test(txt);
	}

	return { magic, hasDrm, isKf8 };
}

function buildPlaceholderHtml(
	bookName: string,
	header: MobiHeader,
	format: "mobi" | "azw3",
): string {
	const drmNote = header.hasDrm
		? `<p class="warn">⚠️ 检测到 DRM 保护标记。Kindle 商城购买的 MOBI/AZW3 通常带有 DRM，无法在第三方阅读器中打开。</p>`
		: `<p>检测到无 DRM 保护，但 ${format.toUpperCase()} 的纯 JS 解码（PalmDOC + Huffman + KF8）尚在路线图中。</p>`;

	return `
		<div class="reader-placeholder">
			<h2>${bookName}</h2>
			<p>当前格式：<code>${format.toUpperCase()}</code>${header.isKf8 ? "（KF8）" : ""}</p>
			${drmNote}
			<h3>推荐做法</h3>
			<ol>
				<li>使用 <a href="https://calibre-ebook.com/">Calibre</a> 把书转换为 <strong>EPUB</strong> 后重新导入。</li>
				<li>EPUB 是 IPO Workbench 阅读器的一等公民，支持目录跳转、划词高亮、书签、AI 副驾驶、TTS。</li>
				<li>若版权方提供原生 EPUB / PDF，请优先选择这两种格式。</li>
			</ol>
		</div>
	`.trim();
}

export const mobiFormatHandler: FormatHandler = {
	format: "mobi",

	async parse(absolutePath): Promise<ParsedBook> {
		const baseName = path.basename(absolutePath, path.extname(absolutePath));
		const header = await probeHeader(absolutePath);

		return {
			title: baseName,
			authors: [],
			language: null,
			format: "mobi",
			page_count: 1,
			word_count: 0,
			toc: [
				{
					id: "info",
					label: "格式说明",
					href: "info",
					level: 1,
				},
			],
			metadata: {
				_format_note: "mobi/azw3 placeholder — convert to EPUB recommended",
				_has_drm: header.hasDrm,
				_is_kf8: header.isKf8,
				_magic: header.magic,
			},
			full_text: "",
			cover: null,
		};
	},

	async getChapter(absolutePath, _chapterId): Promise<ChapterContent> {
		const baseName = path.basename(absolutePath, path.extname(absolutePath));
		const header = await probeHeader(absolutePath);
		const html = buildPlaceholderHtml(baseName, header, "mobi");
		return {
			id: "info",
			title: "格式说明",
			html,
			text: "",
			prev_id: null,
			next_id: null,
			word_count: 0,
		};
	},
};

export const azw3FormatHandler: FormatHandler = {
	...mobiFormatHandler,
	format: "azw3",
	async parse(absolutePath) {
		const result = await mobiFormatHandler.parse(absolutePath);
		return { ...result, format: "azw3" };
	},
	async getChapter(absolutePath, chapterId) {
		const baseName = path.basename(absolutePath, path.extname(absolutePath));
		const header = await probeHeader(absolutePath);
		const html = buildPlaceholderHtml(baseName, header, "azw3");
		return {
			id: chapterId || "info",
			title: "格式说明",
			html,
			text: "",
			prev_id: null,
			next_id: null,
			word_count: 0,
		};
	},
};
