/**
 * Installer —— 把 marketplace entry 下载并安装到 ~/.claude/skills/{name}
 *
 * 流程：
 *   resolving  —— 计算 archive URL（根据 artifact.kind 拼出 GitHub archive 或直接用 url）
 *   downloading—— 多镜像 race 下载 zip 到临时文件
 *   verifying  —— 若 entry 自带 sha256，做严格校验
 *   extracting —— 解压到临时目录
 *   writing    —— 找到含 SKILL.md 的根（或 subdir）拷贝到目标
 *   done
 *
 * 进度通过 onProgress 回调推送，由 IPC handler 转成 webContents.send 事件。
 */

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { net } from "electron";
import StreamZip from "node-stream-zip";
import { getManagedSkillsRootDir } from "../ipc/handlers/skillRoots";
import { upsertInstalledRecord, removeInstalledRecord } from "./localIndex";
import {
	DEFAULT_MIRROR_TEMPLATES,
	type MirrorTemplate,
	fetchWithMirrors,
} from "./mirrorRouter";
import type {
	InstallPhase,
	InstalledRecord,
	MarketplaceArtifactSource,
	MarketplaceEntry,
} from "./types";

export interface InstallOptions {
	mirrors?: MirrorTemplate[];
	onProgress?: (p: {
		phase: InstallPhase;
		percent: number;
		message?: string;
	}) => void;
	signal?: AbortSignal;
}

export interface InstallResult {
	name: string;
	location: string;
	usedUrl: string;
	sha256?: string;
}

function sanitizeDirName(name: string): string {
	const cleaned = name
		.trim()
		.replace(/[\\/:"*?<>|]+/g, "-")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^\.+/, "")
		.slice(0, 80);
	return cleaned || `skill-${Date.now()}`;
}

function archiveUrlFor(artifact: MarketplaceArtifactSource): string {
	if (artifact.kind === "url") return artifact.url;
	const { owner, repo, ref } = artifact;
	// codeload 比 archive 更稳定且支持镜像
	return `https://github.com/${owner}/${repo}/archive/${encodeURIComponent(
		ref,
	)}.zip`;
}

async function streamDownload(
	url: string,
	mirrors: MirrorTemplate[],
	dest: string,
	onPercent?: (percent: number, totalBytes?: number) => void,
	signal?: AbortSignal,
): Promise<{ usedUrl: string; sha256: string }> {
	// 先用 mirrorRouter 拿 winning response（已开始流式接收）
	const { response, usedUrl } = await fetchWithMirrors(url, mirrors, {
		method: "GET",
		timeoutMs: 60_000,
	});
	if (!response.body) throw new Error("响应没有 body");

	const totalHeader = response.headers.get("content-length");
	const total = totalHeader ? Number.parseInt(totalHeader, 10) : 0;

	const hash = createHash("sha256");
	const out = createWriteStream(dest);
	let received = 0;

	const reader = response.body.getReader();
	try {
		while (true) {
			if (signal?.aborted) {
				try {
					await reader.cancel();
				} catch {
					// noop
				}
				throw new Error("ABORTED");
			}
			const { value, done } = await reader.read();
			if (done) break;
			if (value) {
				hash.update(value);
				received += value.byteLength;
				await new Promise<void>((resolve, reject) => {
					out.write(Buffer.from(value), (err) =>
						err ? reject(err) : resolve(),
					);
				});
				if (onPercent) {
					if (total > 0) {
						onPercent(
							Math.min(99, Math.round((received / total) * 100)),
							total,
						);
					} else {
						onPercent(-1, undefined);
					}
				}
			}
		}
	} finally {
		out.end();
		await new Promise<void>((resolve) => out.on("close", () => resolve()));
	}

	return { usedUrl, sha256: hash.digest("hex") };
}

async function findSkillRoot(
	extractRoot: string,
	subdir?: string,
): Promise<string> {
	const target = subdir ? path.join(extractRoot, subdir) : extractRoot;

	async function searchSkillMd(
		dir: string,
		depth: number,
	): Promise<string | null> {
		if (depth > 4) return null;
		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });
			for (const ent of entries) {
				if (ent.name === "SKILL.md" && ent.isFile()) {
					return dir;
				}
			}
			for (const ent of entries) {
				if (ent.isDirectory()) {
					const found = await searchSkillMd(
						path.join(dir, ent.name),
						depth + 1,
					);
					if (found) return found;
				}
			}
		} catch {
			// noop
		}
		return null;
	}

	// archive 解压通常会多一层 {repo}-{ref}/，先检查 target
	const direct = await searchSkillMd(target, 0);
	if (direct) return direct;

	// 退一步在 extractRoot 下找单一子目录
	if (subdir) {
		try {
			const stat = await fs.stat(target);
			if (stat.isDirectory()) {
				const inner = await searchSkillMd(target, 0);
				if (inner) return inner;
			}
		} catch {
			// noop
		}
	}

	throw new Error(
		`安装包内未找到 SKILL.md（已检查 ${subdir ? `子目录 ${subdir}` : "根目录"}）`,
	);
}

async function copyDir(src: string, dest: string) {
	await fs.mkdir(dest, { recursive: true });
	const entries = await fs.readdir(src, { withFileTypes: true });
	for (const ent of entries) {
		const s = path.join(src, ent.name);
		const d = path.join(dest, ent.name);
		if (ent.isDirectory()) {
			await copyDir(s, d);
		} else if (ent.isFile()) {
			await fs.copyFile(s, d);
		}
	}
}

async function rmrf(p: string) {
	try {
		await fs.rm(p, { recursive: true, force: true });
	} catch {
		// noop
	}
}

export async function installEntry(
	entry: MarketplaceEntry,
	opts: InstallOptions = {},
): Promise<InstallResult> {
	const mirrors = opts.mirrors ?? DEFAULT_MIRROR_TEMPLATES;
	const emit = (phase: InstallPhase, percent: number, message?: string) =>
		opts.onProgress?.({ phase, percent, message });

	emit("resolving", 2, "解析下载地址");
	const archiveUrl = archiveUrlFor(entry.artifact);

	const tmpDir = await fs.mkdtemp(path.join(tmpdir(), "skill-install-"));
	const archivePath = path.join(tmpDir, "skill.zip");
	const extractDir = path.join(tmpDir, "extract");

	try {
		emit("downloading", 5, "下载中");
		const { usedUrl, sha256 } = await streamDownload(
			archiveUrl,
			mirrors,
			archivePath,
			(percent) => {
				if (percent >= 0) {
					emit("downloading", 5 + Math.floor(percent * 0.6), "下载中");
				}
			},
			opts.signal,
		);

		if (entry.sha256) {
			emit("verifying", 70, "校验完整性");
			if (entry.sha256.toLowerCase() !== sha256.toLowerCase()) {
				throw new Error(
					`SHA256 不匹配：期望 ${entry.sha256.slice(0, 8)}…，实际 ${sha256.slice(0, 8)}…`,
				);
			}
		}

		emit("extracting", 75, "解压中");
		await fs.mkdir(extractDir, { recursive: true });
		const zip = new StreamZip.async({ file: archivePath });
		try {
			await zip.extract(null, extractDir);
		} finally {
			await zip.close();
		}

		emit("writing", 90, "写入到 ~/.claude/skills");
		const subdir =
			entry.artifact.kind === "github" ? entry.artifact.subdir : undefined;
		// archive 解压后通常是单一根目录 {repo}-{ref}/，先尝试进入它
		const entries = await fs.readdir(extractDir, { withFileTypes: true });
		const dirEnts = entries.filter((e) => e.isDirectory());
		const rootCandidate =
			dirEnts.length === 1
				? path.join(extractDir, dirEnts[0].name)
				: extractDir;
		const skillRoot = await findSkillRoot(rootCandidate, subdir);

		const dirName = sanitizeDirName(entry.name);
		const root = getManagedSkillsRootDir();
		await fs.mkdir(root, { recursive: true });
		const destDir = path.join(root, dirName);

		// 已存在则覆盖（让"更新"复用此路径）
		await rmrf(destDir);
		await copyDir(skillRoot, destDir);

		const record: InstalledRecord = {
			sourceId: entry.sourceId,
			entryId: entry.id,
			name: entry.name,
			version: entry.version,
			installedAt: Date.now(),
			sourceUrl: usedUrl,
			sha256,
			artifact: entry.artifact,
		};
		await upsertInstalledRecord(entry.name, record);

		emit("done", 100, "安装完成");
		return { name: entry.name, location: destDir, usedUrl, sha256 };
	} finally {
		await rmrf(tmpDir);
	}
}

export async function uninstallByName(name: string): Promise<void> {
	const root = getManagedSkillsRootDir();
	const dirName = sanitizeDirName(name);
	const target = path.join(root, dirName);
	await rmrf(target);
	await removeInstalledRecord(name);
}

/** 仅做轻量探活：用 net.fetch 拉头几个字节，看 response.ok */
export async function probeReachable(
	url: string,
	timeoutMs = 5_000,
): Promise<boolean> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const r = await net.fetch(url, {
			method: "GET",
			headers: { Range: "bytes=0-127" },
			signal: ctrl.signal,
		});
		return r.ok || r.status === 206;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}
