/**
 * 设计模块工作目录管理
 *
 * - 设计工作区根：<userData>/designs/
 * - 每个设计会话独立子目录：<userData>/designs/<session_id>/
 *   Agent SDK 启动时把这个子目录作为 cwd，所有 HTML / assets 都生成在这里。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

const DESIGN_ROOT_DIRNAME = "designs";

export function getDesignsRoot(): string {
	return path.join(app.getPath("userData"), DESIGN_ROOT_DIRNAME);
}

export async function ensureDesignsRoot(): Promise<string> {
	const root = getDesignsRoot();
	await fs.mkdir(root, { recursive: true });
	return root;
}

export function getSessionDir(sessionId: string): string {
	if (!sessionId || !/^[\w-]+$/.test(sessionId)) {
		throw new Error(`非法的设计会话 ID: ${sessionId}`);
	}
	return path.join(getDesignsRoot(), sessionId);
}

export async function createSessionDir(sessionId: string): Promise<string> {
	const dir = getSessionDir(sessionId);
	await fs.mkdir(dir, { recursive: true });
	return dir;
}

export async function deleteSessionDir(sessionId: string): Promise<void> {
	const dir = getSessionDir(sessionId);
	try {
		await fs.rm(dir, { recursive: true, force: true });
	} catch {
		// 静默：目录可能已被外部删除
	}
}

export interface SessionFileEntry {
	path: string;
	name: string;
	relative: string;
	size: number;
	mtime_ms: number;
	is_dir: boolean;
}

export async function listSessionFiles(
	sessionId: string,
): Promise<SessionFileEntry[]> {
	const root = getSessionDir(sessionId);
	const out: SessionFileEntry[] = [];

	async function walk(dir: string) {
		let ents: import("node:fs").Dirent[];
		try {
			ents = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const ent of ents) {
			const full = path.join(dir, ent.name);
			const rel = path.relative(root, full);
			let stat;
			try {
				stat = await fs.stat(full);
			} catch {
				continue;
			}
			out.push({
				path: full,
				name: ent.name,
				relative: rel,
				size: stat.isFile() ? stat.size : 0,
				mtime_ms: stat.mtimeMs,
				is_dir: stat.isDirectory(),
			});
			if (ent.isDirectory()) await walk(full);
		}
	}

	await walk(root);
	return out;
}

/**
 * 找到当前会话工作目录的主交付物路径：
 *   优先 index.html → home.html → 第一个 .html 文件
 */
export async function getMainArtifactPath(
	sessionId: string,
): Promise<string | null> {
	const root = getSessionDir(sessionId);
	try {
		await fs.access(path.join(root, "index.html"));
		return path.join(root, "index.html");
	} catch {
		// fall through
	}
	try {
		await fs.access(path.join(root, "home.html"));
		return path.join(root, "home.html");
	} catch {
		// fall through
	}
	const files = await listSessionFiles(sessionId);
	const html = files.find(
		(f) => !f.is_dir && f.name.toLowerCase().endsWith(".html"),
	);
	return html?.path ?? null;
}

/**
 * 递归复制整个会话目录到目标。target 必须是绝对路径。
 * 如果 target 不存在会创建；存在但已有同名子目录则合并（覆盖同名文件）。
 */
export async function copySessionDirTo(
	sessionId: string,
	target: string,
): Promise<string> {
	const src = getSessionDir(sessionId);
	if (!path.isAbsolute(target)) {
		throw new Error(`目标路径必须是绝对路径: ${target}`);
	}
	await fs.mkdir(target, { recursive: true });
	await fs.cp(src, target, { recursive: true, force: true });
	return target;
}
