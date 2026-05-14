/**
 * 设计模块多格式 + 多目标导出引擎
 *
 * 支持的格式：
 *   - html-inline       单文件 HTML，CSS/JS/图像 inline 成 data URI
 *   - html-project      目录形态：index.html + assets/ + screens/
 *   - pdf               BrowserWindow + printToPDF
 *   - screenshots       按断点 desktop/tablet/mobile capturePage
 *   - zip               html-project + 元数据 + screenshots 一起打包
 *   - markdown          设计简报 / 方向 / 系统 / 自检分（不含 HTML）
 *
 * 目标：
 *   - path / save-dialog / current-thread / thread / folder
 *
 * 备注：避免引入额外 npm 依赖，ZIP 用 BrowserWindow + js 端 manual 拼装的备选
 * 路径较为复杂，因此本期暂用「目录形态 + 元数据 JSON」承担 zip 目标——
 * UI 上显示为「ZIP 包（目录形态）」，方便用户压缩后分享。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserWindow } from "electron";
import { copySessionDirTo, getMainArtifactPath, listSessionFiles } from "./designsDir";

export type DesignExportFormat =
	| "html-inline"
	| "html-project"
	| "pdf"
	| "screenshots"
	| "zip"
	| "markdown";

export type DesignBreakpoint = "desktop" | "tablet" | "mobile";

export interface ExportOptions {
	page_size?: "A4" | "Letter" | "16:9";
	breakpoints?: DesignBreakpoint[];
	subfolder_name?: string;
}

export interface ExportContext {
	session_id: string;
	session_title: string;
	mode?: string;
	direction_id?: string;
	system_id?: string;
	discovery_answers?: unknown;
	critique_scores?: unknown;
}

export interface ExportResult {
	paths: string[];
}

const BREAKPOINT_WIDTH: Record<DesignBreakpoint, number> = {
	desktop: 1440,
	tablet: 834,
	mobile: 390,
};

const PAGE_SIZE_HEIGHT: Record<DesignBreakpoint, number> = {
	desktop: 900,
	tablet: 1112,
	mobile: 844,
};

function safeSegment(value: string, fallback: string): string {
	const s = String(value ?? "")
		.trim()
		.replace(/[\\/:*?"<>|]/g, "-")
		.replace(/\s+/g, "-");
	return s || fallback;
}

async function ensureDir(p: string): Promise<void> {
	await fs.mkdir(p, { recursive: true });
}

async function readBinaryAsDataURI(filePath: string): Promise<string | null> {
	try {
		const buf = await fs.readFile(filePath);
		const ext = path.extname(filePath).toLowerCase().slice(1);
		const mime = (
			{
				png: "image/png",
				jpg: "image/jpeg",
				jpeg: "image/jpeg",
				gif: "image/gif",
				svg: "image/svg+xml",
				webp: "image/webp",
				woff: "font/woff",
				woff2: "font/woff2",
				ttf: "font/ttf",
				otf: "font/otf",
				ico: "image/x-icon",
				css: "text/css",
				js: "application/javascript",
			} as Record<string, string>
		)[ext] || "application/octet-stream";
		return `data:${mime};base64,${buf.toString("base64")}`;
	} catch {
		return null;
	}
}

/**
 * 把单 HTML 内的相对路径资源全部内联成 data URI。
 * 用正则做轻量替换，不引第三方 parser。覆盖 src=, href= 两种属性形态。
 */
async function inlineAssetsInHtml(htmlPath: string): Promise<string> {
	const baseDir = path.dirname(htmlPath);
	let html = await fs.readFile(htmlPath, "utf-8");

	const pattern = /\b(src|href)\s*=\s*(['"])([^'"]+)\2/gi;
	const replacements: Array<{ match: string; replacement: string }> = [];
	let m: RegExpExecArray | null;
	const seen = new Set<string>();
	while ((m = pattern.exec(html))) {
		const url = m[3];
		if (!url || /^(https?:|data:|#|mailto:|javascript:|file:)/i.test(url)) continue;
		if (seen.has(m[0])) continue;
		seen.add(m[0]);
		const resolved = path.resolve(baseDir, url);
		const data = await readBinaryAsDataURI(resolved);
		if (!data) continue;
		replacements.push({
			match: m[0],
			replacement: `${m[1]}=${m[2]}${data}${m[2]}`,
		});
	}

	for (const r of replacements) {
		html = html.split(r.match).join(r.replacement);
	}

	// <link rel="stylesheet" href="x.css"> 不会被 data URI 直接命中——这里再补一次：
	// 把 link[rel=stylesheet] 替换成 <style>...</style>
	const linkPattern = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/gi;
	const linkReplacements: Array<{ match: string; replacement: string }> = [];
	let lm: RegExpExecArray | null;
	while ((lm = linkPattern.exec(html))) {
		const url = lm[1];
		if (/^(https?:|data:)/i.test(url)) continue;
		try {
			const cssPath = path.resolve(baseDir, url);
			const css = await fs.readFile(cssPath, "utf-8");
			linkReplacements.push({
				match: lm[0],
				replacement: `<style>\n${css}\n</style>`,
			});
		} catch {
			// ignore
		}
	}
	for (const r of linkReplacements) {
		html = html.split(r.match).join(r.replacement);
	}

	return html;
}

async function resolveSubfolder(target: string, ctx: ExportContext, options?: ExportOptions): Promise<string> {
	const subfolder = safeSegment(options?.subfolder_name || ctx.session_title || "design", "design");
	const full = path.join(target, subfolder);
	await ensureDir(full);
	return full;
}

// =================================
// 各格式实现
// =================================

export async function exportHtmlInline(
	ctx: ExportContext,
	targetPath: string,
): Promise<ExportResult> {
	const mainHtml = await getMainArtifactPath(ctx.session_id);
	if (!mainHtml) throw new Error("当前会话没有可导出的 HTML，请先生成设计稿");
	const inlined = await inlineAssetsInHtml(mainHtml);

	const ext = path.extname(targetPath).toLowerCase();
	const outFile = ext === ".html" ? targetPath : path.join(targetPath, `${safeSegment(ctx.session_title, "design")}.html`);
	await ensureDir(path.dirname(outFile));
	await fs.writeFile(outFile, inlined, "utf-8");
	return { paths: [outFile] };
}

export async function exportHtmlProject(
	ctx: ExportContext,
	targetDir: string,
	options?: ExportOptions,
): Promise<ExportResult> {
	const outDir = await resolveSubfolder(targetDir, ctx, options);
	await copySessionDirTo(ctx.session_id, outDir);
	// 附带一份元数据
	const metaPath = path.join(outDir, "design.meta.json");
	const meta = {
		session_id: ctx.session_id,
		title: ctx.session_title,
		mode: ctx.mode,
		direction_id: ctx.direction_id,
		system_id: ctx.system_id,
		discovery_answers: ctx.discovery_answers,
		critique_scores: ctx.critique_scores,
		exported_at: Date.now(),
	};
	await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
	return { paths: [outDir] };
}

async function renderWithHiddenWindow(
	url: string,
	width: number,
	height: number,
	work: (win: BrowserWindow) => Promise<void>,
): Promise<void> {
	const win = new BrowserWindow({
		width,
		height,
		show: false,
		webPreferences: {
			offscreen: false,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	try {
		await win.loadURL(url);
		// 等一帧确保 paint
		await new Promise((r) => setTimeout(r, 250));
		await work(win);
	} finally {
		win.destroy();
	}
}

function fileUrl(p: string): string {
	// 用 pathToFileURL 正确处理 Windows 盘符（C:\ → file:///C:/）
	// 与路径中的空格/特殊字符编码，避免历史上 `file://${norm}` 在 Windows
	// 上漏掉根斜杠 + 不做 encodeURI 的双重 bug。
	return pathToFileURL(p).toString();
}

export async function exportPdf(
	ctx: ExportContext,
	targetPath: string,
	options?: ExportOptions,
): Promise<ExportResult> {
	const mainHtml = await getMainArtifactPath(ctx.session_id);
	if (!mainHtml) throw new Error("当前会话没有可导出的 HTML");

	const outFile = path.extname(targetPath).toLowerCase() === ".pdf"
		? targetPath
		: path.join(targetPath, `${safeSegment(ctx.session_title, "design")}.pdf`);
	await ensureDir(path.dirname(outFile));

	const pageSize = options?.page_size ?? "A4";
	const printPageSize =
		pageSize === "16:9"
			? { width: 33867, height: 19050 } // microns; 13.33" × 7.5"
			: pageSize === "Letter"
				? "Letter"
				: "A4";

	await renderWithHiddenWindow(fileUrl(mainHtml), 1440, 900, async (win) => {
		const buffer = await win.webContents.printToPDF({
			pageSize: printPageSize as never,
			printBackground: true,
			landscape: pageSize === "16:9",
		});
		await fs.writeFile(outFile, buffer);
	});

	return { paths: [outFile] };
}

export async function exportScreenshots(
	ctx: ExportContext,
	targetDir: string,
	options?: ExportOptions,
): Promise<ExportResult> {
	const mainHtml = await getMainArtifactPath(ctx.session_id);
	if (!mainHtml) throw new Error("当前会话没有可导出的 HTML");

	const outDir = await resolveSubfolder(targetDir, ctx, options);
	const breakpoints = options?.breakpoints && options.breakpoints.length > 0
		? options.breakpoints
		: (["desktop", "tablet", "mobile"] as DesignBreakpoint[]);

	const outPaths: string[] = [];

	for (const bp of breakpoints) {
		const width = BREAKPOINT_WIDTH[bp];
		const height = PAGE_SIZE_HEIGHT[bp];
		const out = path.join(outDir, `cover-${bp}.png`);
		await renderWithHiddenWindow(fileUrl(mainHtml), width, height, async (win) => {
			const image = await win.webContents.capturePage();
			await fs.writeFile(out, image.toPNG());
		});
		outPaths.push(out);
	}

	return { paths: outPaths };
}

export async function exportZip(
	ctx: ExportContext,
	targetDir: string,
	options?: ExportOptions,
): Promise<ExportResult> {
	// 不引入额外 npm 依赖：导出目录形态 + 截图 + 元数据；UI 提示用户手动压缩
	const outDir = await resolveSubfolder(targetDir, ctx, {
		...options,
		subfolder_name: `${safeSegment(options?.subfolder_name || ctx.session_title, "design")}-bundle`,
	});

	// 1. 复制工程文件
	await copySessionDirTo(ctx.session_id, outDir);

	// 2. 截图
	try {
		const shotsDir = path.join(outDir, "screenshots");
		await ensureDir(shotsDir);
		await exportScreenshots(ctx, outDir, {
			...options,
			subfolder_name: "screenshots",
		});
	} catch {
		// 截图失败不阻断
	}

	// 3. 元数据
	const meta = {
		session_id: ctx.session_id,
		title: ctx.session_title,
		mode: ctx.mode,
		direction_id: ctx.direction_id,
		system_id: ctx.system_id,
		discovery_answers: ctx.discovery_answers,
		critique_scores: ctx.critique_scores,
		exported_at: Date.now(),
	};
	await fs.writeFile(
		path.join(outDir, "design.meta.json"),
		JSON.stringify(meta, null, 2),
		"utf-8",
	);

	return { paths: [outDir] };
}

export async function exportMarkdown(
	ctx: ExportContext,
	targetPath: string,
): Promise<ExportResult> {
	const outFile = path.extname(targetPath).toLowerCase() === ".md"
		? targetPath
		: path.join(targetPath, `${safeSegment(ctx.session_title, "design")}.md`);
	await ensureDir(path.dirname(outFile));

	const lines: string[] = [
		`# ${ctx.session_title}`,
		"",
		`- Session ID: \`${ctx.session_id}\``,
		`- Mode: ${ctx.mode ?? "—"}`,
		`- Direction: ${ctx.direction_id ?? "—"}`,
		`- System: ${ctx.system_id ?? "—"}`,
		`- Exported at: ${new Date().toISOString()}`,
		"",
	];

	if (ctx.discovery_answers && typeof ctx.discovery_answers === "object") {
		lines.push("## Discovery 答卷", "", "```json");
		lines.push(JSON.stringify(ctx.discovery_answers, null, 2));
		lines.push("```", "");
	}

	if (ctx.critique_scores && typeof ctx.critique_scores === "object") {
		lines.push("## 5 维自检", "", "```json");
		lines.push(JSON.stringify(ctx.critique_scores, null, 2));
		lines.push("```", "");
	}

	const files = await listSessionFiles(ctx.session_id);
	if (files.length > 0) {
		lines.push("## 工作目录文件清单", "");
		for (const f of files) {
			if (f.is_dir) continue;
			lines.push(`- ${f.relative} (${f.size.toLocaleString()} bytes)`);
		}
	}

	await fs.writeFile(outFile, lines.join("\n"), "utf-8");
	return { paths: [outFile] };
}
