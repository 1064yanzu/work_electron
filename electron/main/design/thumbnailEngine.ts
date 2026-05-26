/**
 * 设计系统缩略图引擎（M2）
 *
 * 工作流程：
 *   1. 用 BrowserWindow（offscreen，show:false，960x600）渲染 systems/<id> 的 showcase
 *      ─ 若 systems/<id>/showcase.html 存在，直接 file:// 加载；
 *      ─ 否则用 DESIGN.md frontmatter 拼装一个色板风格的轻量预览（保证布局不抖）。
 *   2. dom-ready 之后 capturePage() → PNG → 写入 userData/design-thumbnails/<id>.png
 *   3. 同时落盘 <id>.json 记录 mtime/source/version，下次直接返回缓存。
 *   4. 完成后 broadcast `design:thumbnail-ready` 事件让前端切图。
 *
 * 注意：
 *   - 并发上限 2，避免一次开十几个 BrowserWindow 把 GPU 顶满；
 *   - 全程 try/catch，失败时返回 ready:false 让前端继续回退到 swatches 渐变。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { getDesignLibraryRoot } from "./resourcePaths";
import { scanDesignSystems, type DesignSystemSummary } from "./systemRegistry";

const THUMBS_DIRNAME = "design-thumbnails";
const VERSION = 1; // 调整缩略图模板时 bump，老 PNG 自动失效
const WIDTH = 960;
const HEIGHT = 600;
const MAX_CONCURRENCY = 2;

interface CacheMeta {
	id: string;
	source: "showcase" | "swatch-fallback";
	source_mtime_ms: number;
	version: number;
	width: number;
	height: number;
	created_at: number;
}

interface ThumbnailReadyPayload {
	system_id: string;
	path: string;
	mtime_ms: number;
}

function thumbsRoot(): string {
	return path.join(app.getPath("userData"), THUMBS_DIRNAME);
}

function pngPath(systemId: string): string {
	return path.join(thumbsRoot(), `${systemId}.png`);
}

function metaPath(systemId: string): string {
	return path.join(thumbsRoot(), `${systemId}.json`);
}

async function ensureRoot(): Promise<void> {
	await fs.mkdir(thumbsRoot(), { recursive: true });
}

async function readMeta(systemId: string): Promise<CacheMeta | null> {
	try {
		const raw = await fs.readFile(metaPath(systemId), "utf-8");
		const parsed = JSON.parse(raw) as CacheMeta;
		return parsed;
	} catch {
		return null;
	}
}

async function writeMeta(meta: CacheMeta): Promise<void> {
	await fs.writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2), "utf-8");
}

async function statSafe(
	p: string,
): Promise<{ mtimeMs: number; size: number } | null> {
	try {
		const st = await fs.stat(p);
		return { mtimeMs: st.mtimeMs, size: st.size };
	} catch {
		return null;
	}
}

function safeId(id: string): string {
	return id.replace(/[^\w-]/g, "");
}

async function resolveShowcaseSource(
	systemId: string,
): Promise<
	| { kind: "file"; file: string; mtime_ms: number }
	| { kind: "fallback"; mtime_ms: number }
> {
	const id = safeId(systemId);
	const showcaseFile = path.join(
		getDesignLibraryRoot(),
		"systems",
		id,
		"showcase.html",
	);
	const st = await statSafe(showcaseFile);
	if (st) return { kind: "file", file: showcaseFile, mtime_ms: st.mtimeMs };
	const designFile = path.join(
		getDesignLibraryRoot(),
		"systems",
		id,
		"DESIGN.md",
	);
	const stMd = await statSafe(designFile);
	return { kind: "fallback", mtime_ms: stMd?.mtimeMs ?? 0 };
}

function fallbackHtmlForSystem(
	summary: DesignSystemSummary | undefined,
	systemId: string,
): string {
	const title = summary?.title ?? systemId;
	const category = summary?.category ?? "design system";
	const summaryText = summary?.summary ?? "";
	const swatches =
		summary?.swatches && summary.swatches.length > 0
			? summary.swatches.slice(0, 6)
			: ["#F2E9DC", "#E0CFB6", "#C9A98D", "#D96C46"];
	const primary = swatches[0];
	const accent = swatches[swatches.length - 1] || swatches[0];

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  :root {
    color-scheme: light;
    --bg: ${primary};
    --accent: ${accent};
  }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(140deg, ${primary} 0%, ${swatches[2] ?? accent} 60%, ${accent} 100%);
    color: #1A1A1A;
    overflow: hidden;
  }
  .stage {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 56px 64px;
    box-sizing: border-box;
  }
  .badge {
    align-self: flex-start;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.6);
    padding: 6px 14px;
    border-radius: 999px;
    backdrop-filter: blur(8px);
    color: #1A1A1A;
  }
  .title {
    font-size: 64px;
    line-height: 1.05;
    font-weight: 650;
    letter-spacing: -0.025em;
    margin: 0;
    max-width: 700px;
  }
  .summary {
    font-size: 18px;
    color: rgba(0, 0, 0, 0.55);
    max-width: 640px;
    margin: 18px 0 0;
    line-height: 1.55;
  }
  .swatches {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .chip {
    width: 56px;
    height: 56px;
    border-radius: 20px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.25);
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .id {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    letter-spacing: 0.04em;
    color: rgba(0, 0, 0, 0.4);
  }
</style>
</head>
<body>
  <div class="stage">
    <div>
      <span class="badge">${escapeHtml(category)}</span>
      <h1 class="title">${escapeHtml(title)}</h1>
      ${summaryText ? `<p class="summary">${escapeHtml(summaryText)}</p>` : ""}
    </div>
    <div class="footer">
      <div class="swatches">${swatches
				.map(
					(c) => `<div class="chip" style="background:${escapeHtml(c)}"></div>`,
				)
				.join("")}</div>
      <div class="id">/ ${escapeHtml(systemId)} · design system</div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

async function loadShowcaseHtml(systemId: string): Promise<{
	html: string;
	source: "showcase" | "swatch-fallback";
	source_mtime_ms: number;
}> {
	const resolved = await resolveShowcaseSource(systemId);
	if (resolved.kind === "file") {
		const html = await fs.readFile(resolved.file, "utf-8");
		return { html, source: "showcase", source_mtime_ms: resolved.mtime_ms };
	}
	const summaries = await scanDesignSystems();
	const summary = summaries.find((s) => s.id === systemId);
	return {
		html: fallbackHtmlForSystem(summary, systemId),
		source: "swatch-fallback",
		source_mtime_ms: resolved.mtime_ms,
	};
}

async function renderOnce(systemId: string): Promise<{
	pngPath: string;
	mtime_ms: number;
} | null> {
	await ensureRoot();
	const { html, source, source_mtime_ms } = await loadShowcaseHtml(systemId);

	// 用 data-url 加载，避免每次写临时文件
	const dataUrl = `data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf-8").toString("base64")}`;

	const win = new BrowserWindow({
		show: false,
		width: WIDTH,
		height: HEIGHT,
		useContentSize: true,
		webPreferences: {
			offscreen: true,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			javascript: true,
			webSecurity: true,
		},
	});

	try {
		await win.loadURL(dataUrl);
		// 等一帧让字体 / paint 落地
		await new Promise((r) => setTimeout(r, 400));
		const image = await win.webContents.capturePage();
		const png = image.toPNG();
		const out = pngPath(systemId);
		await fs.writeFile(out, png);
		const meta: CacheMeta = {
			id: systemId,
			source,
			source_mtime_ms,
			version: VERSION,
			width: WIDTH,
			height: HEIGHT,
			created_at: Date.now(),
		};
		await writeMeta(meta);
		const st = await statSafe(out);
		return { pngPath: out, mtime_ms: st?.mtimeMs ?? Date.now() };
	} catch (err) {
		console.warn(`[thumbnailEngine] render failed for ${systemId}`, err);
		return null;
	} finally {
		try {
			win.destroy();
		} catch {
			// ignore
		}
	}
}

async function isCacheValid(systemId: string): Promise<{
	valid: boolean;
	path: string;
	mtime_ms?: number;
}> {
	const png = pngPath(systemId);
	const st = await statSafe(png);
	if (!st) return { valid: false, path: png };
	const meta = await readMeta(systemId);
	if (!meta) return { valid: false, path: png };
	if (meta.version !== VERSION) return { valid: false, path: png };
	const resolved = await resolveShowcaseSource(systemId);
	if (Math.abs(resolved.mtime_ms - meta.source_mtime_ms) > 5) {
		return { valid: false, path: png };
	}
	return { valid: true, path: png, mtime_ms: st.mtimeMs };
}

// —— 并发控制 ——
const inflight = new Map<
	string,
	Promise<{ pngPath: string; mtime_ms: number } | null>
>();
const queue: Array<() => void> = [];
let running = 0;

function schedule<T>(task: () => Promise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const run = async () => {
			running += 1;
			try {
				const v = await task();
				resolve(v);
			} catch (e) {
				reject(e);
			} finally {
				running -= 1;
				const next = queue.shift();
				if (next) next();
			}
		};
		if (running < MAX_CONCURRENCY) run();
		else queue.push(run);
	});
}

/**
 * 同步入口：若有缓存且仍有效，立即返回 ready:true；否则在后台调度生成，
 * 返回 ready:false 让前端先用渐变占位渲染。
 */
export async function getSystemThumbnail(
	systemId: string,
	broadcast: (payload: ThumbnailReadyPayload & { base64?: string }) => void,
): Promise<{
	path: string;
	ready: boolean;
	mtime_ms?: number;
	base64?: string;
}> {
	const id = safeId(systemId);
	if (!id) throw new Error(`非法的 system_id: ${systemId}`);

	const cache = await isCacheValid(id);
	if (cache.valid) {
		let base64: string | undefined;
		try {
			const buf = await fs.readFile(cache.path);
			base64 = buf.toString("base64");
		} catch {
			// ignore
		}
		return { path: cache.path, ready: true, mtime_ms: cache.mtime_ms, base64 };
	}

	// 后台触发生成（去重）
	if (!inflight.has(id)) {
		const job = schedule(() => renderOnce(id)).finally(() => {
			inflight.delete(id);
		});
		inflight.set(id, job);
		void job
			.then(async (r) => {
				if (!r) return;
				try {
					let base64: string | undefined;
					try {
						const buf = await fs.readFile(r.pngPath);
						base64 = buf.toString("base64");
					} catch {}
					broadcast({
						system_id: id,
						path: r.pngPath,
						mtime_ms: r.mtime_ms,
						base64,
					});
				} catch {
					// ignore
				}
			})
			.catch(() => {
				// 失败不抛，前端会继续显示渐变占位
			});
	}

	return { path: cache.path, ready: false };
}

/**
 * 触发完整缓存清理（暴露给设置面板按钮等场景使用，目前内部不调用）
 */
export async function clearAllThumbnails(): Promise<void> {
	try {
		await fs.rm(thumbsRoot(), { recursive: true, force: true });
	} catch {
		// ignore
	}
}

export type { ThumbnailReadyPayload };
