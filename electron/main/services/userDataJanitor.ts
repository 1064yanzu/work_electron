/**
 * userData 缓存清理器
 *
 * 扫描 / 报告 / 执行三段式。**默认 dry-run**，UI 显示报告后用户确认才真正删除。
 *
 * 覆盖目录（按 key 分组）：
 *   - reader-library   电子书与封面缓存，保留近 60 天访问
 *   - agent-sandboxes  Agent SDK 工作目录沙盒，保留近 30 天访问
 *   - cache            通用缓存（含 generated-images 等）
 *   - media            TTS 音频等媒体缓存
 *   - remote-control-dedupe  远控去重缓存
 *
 * 每个 scope 都先扫描得到符合"可清理"标准的文件 + 总字节数，再决定是否清理。
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

export interface JanitorScopeReport {
	key: string;
	label: string;
	root: string;
	files: number;
	bytes: number;
}

export interface JanitorScanResult {
	scopes: JanitorScopeReport[];
	total_bytes: number;
}

export interface JanitorExecuteResult {
	removed: number;
	bytes: number;
	errors: Array<{ path: string; error: string }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface ScopeDef {
	key: string;
	label: string;
	dir: () => string;
	keepDays: number;
}

const SCOPES: ScopeDef[] = [
	{
		key: "reader-library",
		label: "阅读器图书与封面缓存",
		dir: () => path.join(app.getPath("userData"), "reader-library"),
		keepDays: 60,
	},
	{
		key: "agent-sandboxes",
		label: "Agent 沙盒工作目录",
		dir: () => path.join(app.getPath("userData"), "agent-sandboxes"),
		keepDays: 30,
	},
	{
		key: "cache",
		label: "通用缓存（含生成图片等）",
		dir: () => path.join(app.getPath("userData"), "cache"),
		keepDays: 30,
	},
	{
		key: "media",
		label: "媒体缓存（TTS 音频等）",
		dir: () => path.join(app.getPath("userData"), "media"),
		keepDays: 30,
	},
	{
		key: "remote-control-dedupe",
		label: "远控去重缓存",
		dir: () => path.join(app.getPath("userData"), "remote-control", "dedupe"),
		keepDays: 14,
	},
];

async function walkExpired(
	dir: string,
	cutoffMs: number,
): Promise<Array<{ path: string; size: number; isDir: boolean }>> {
	const out: Array<{ path: string; size: number; isDir: boolean }> = [];
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fsp.readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		try {
			const st = await fsp.stat(full);
			if (entry.isDirectory()) {
				const children = await walkExpired(full, cutoffMs);
				out.push(...children);
				// 如果当前目录下所有子项都过期且目录本身访问时间也过期，加入候选
				// 简化：只看子项 + 自身 mtime
				if (st.mtimeMs < cutoffMs) {
					out.push({ path: full, size: 0, isDir: true });
				}
			} else if (entry.isFile()) {
				const lastTouch = Math.max(st.mtimeMs, st.atimeMs);
				if (lastTouch < cutoffMs) {
					out.push({ path: full, size: st.size, isDir: false });
				}
			}
		} catch {
			// 单个 entry 失败跳过
		}
	}
	return out;
}

export async function scanUserData(): Promise<JanitorScanResult> {
	const reports: JanitorScopeReport[] = [];
	let total = 0;
	for (const def of SCOPES) {
		const root = def.dir();
		const cutoff = Date.now() - def.keepDays * DAY_MS;
		const items = await walkExpired(root, cutoff);
		const files = items.filter((i) => !i.isDir);
		const bytes = files.reduce((s, i) => s + i.size, 0);
		reports.push({
			key: def.key,
			label: def.label,
			root,
			files: files.length,
			bytes,
		});
		total += bytes;
	}
	return { scopes: reports, total_bytes: total };
}

export async function executeUserData(
	scopes?: string[],
): Promise<JanitorExecuteResult> {
	const allow = scopes && scopes.length > 0 ? new Set(scopes) : null;
	let removed = 0;
	let bytes = 0;
	const errors: Array<{ path: string; error: string }> = [];

	for (const def of SCOPES) {
		if (allow && !allow.has(def.key)) continue;
		const root = def.dir();
		const cutoff = Date.now() - def.keepDays * DAY_MS;
		const items = await walkExpired(root, cutoff);
		// 先删文件，再删空目录（按路径深度倒序，确保子项先于父项）
		const ordered = [...items].sort((a, b) => b.path.length - a.path.length);
		for (const item of ordered) {
			try {
				if (item.isDir) {
					// 仅在目录已空时删除（rmdir 失败会抛 ENOTEMPTY）
					await fsp.rmdir(item.path).catch(() => {});
				} else {
					await fsp.unlink(item.path);
					removed++;
					bytes += item.size;
				}
			} catch (err) {
				errors.push({
					path: item.path,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}

	return { removed, bytes, errors };
}
