#!/usr/bin/env node
/**
 * sync-open-design.mjs —— 从上游 anthropic-labs/open-design 同步指定文件
 *
 * 使用：
 *   node scripts/sync-open-design.mjs                # 走 sync.json 重新拉取 + 校验 sha256
 *   node scripts/sync-open-design.mjs --update       # 重新拉取后用最新 sha256 覆写 sync.json
 *   node scripts/sync-open-design.mjs --ref <tag>    # 切换上游 ref（branch / tag / commit）
 *
 * 设计意图：
 *   - 本仓库的 design 模块大量引用 open-design 的 frames / templates / library 资源；
 *     上游随时可能修订，我们用一份白名单 + sha256 钉死「确认过的版本」，
 *     方便审计 + 防上游突然变更破坏现有体验。
 *   - 脚本不依赖额外 npm 包，使用 Node 18+ 的 fetch / crypto。
 *
 * 输出：library/vendor/open-design/ 下的 LICENSE / NOTICE / sync.json + 真正资产落到 dst。
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const VENDOR_DIR = path.join(
	REPO_ROOT,
	"electron/main/design/library/vendor/open-design",
);
const LIBRARY_ROOT = path.join(REPO_ROOT, "electron/main/design");
const SYNC_JSON = path.join(VENDOR_DIR, "sync.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const argValue = (name) => {
	const idx = args.indexOf(name);
	return idx >= 0 ? args[idx + 1] : undefined;
};

const UPDATE = flag("--update");
const REF_OVERRIDE = argValue("--ref");

async function readSyncManifest() {
	const raw = await fs.readFile(SYNC_JSON, "utf-8");
	return JSON.parse(raw);
}

async function writeSyncManifest(manifest) {
	const json = `${JSON.stringify(manifest, null, 2)}\n`;
	await fs.writeFile(SYNC_JSON, json, "utf-8");
}

function sha256(buf) {
	return createHash("sha256").update(buf).digest("hex");
}

function rawUrl(manifest, srcPath) {
	const upstream = manifest.upstream
		.replace(/\.git$/, "")
		.replace("https://github.com/", "https://raw.githubusercontent.com/");
	const ref = REF_OVERRIDE || manifest.commit || "main";
	return `${upstream}/${ref}/${srcPath}`;
}

async function fetchUpstream(url) {
	const res = await fetch(url, { redirect: "follow" });
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} ${url}`);
	}
	return Buffer.from(await res.arrayBuffer());
}

async function ensureDir(p) {
	await fs.mkdir(path.dirname(p), { recursive: true });
}

async function main() {
	const manifest = await readSyncManifest();
	console.log(
		`[sync-open-design] upstream=${manifest.upstream} ref=${REF_OVERRIDE || manifest.commit}`,
	);
	const updated = { ...manifest, files: [] };
	let ok = 0;
	let mismatched = 0;
	let refreshed = 0;

	for (const entry of manifest.files) {
		const url = rawUrl(manifest, entry.src);
		const dst = path.join(LIBRARY_ROOT, entry.dst);
		try {
			const buf = await fetchUpstream(url);
			const digest = sha256(buf);
			let action = "ok";
			if (digest !== entry.sha256) {
				if (UPDATE) {
					action = "refreshed";
					refreshed++;
				} else {
					action = "MISMATCH";
					mismatched++;
				}
			} else {
				ok++;
			}
			if (UPDATE || action === "ok" || action === "refreshed") {
				await ensureDir(dst);
				await fs.writeFile(dst, buf);
			}
			updated.files.push({
				src: entry.src,
				dst: entry.dst,
				sha256: UPDATE ? digest : entry.sha256,
			});
			console.log(
				`  ${action.padEnd(10)} ${entry.dst} (${buf.length} bytes${digest === entry.sha256 ? "" : " new=" + digest.slice(0, 12)})`,
			);
		} catch (err) {
			console.error(
				`  FAILED      ${entry.dst} :: ${err instanceof Error ? err.message : String(err)}`,
			);
			updated.files.push(entry);
			mismatched++;
		}
	}

	if (UPDATE) {
		updated.imported_at = new Date().toISOString().slice(0, 10);
		if (REF_OVERRIDE) updated.commit = REF_OVERRIDE;
		await writeSyncManifest(updated);
		console.log(
			`\n[sync-open-design] manifest refreshed; ${refreshed} files updated, ${ok} unchanged.`,
		);
	} else {
		console.log(
			`\n[sync-open-design] ${ok} OK / ${mismatched} mismatch (use --update to accept upstream).`,
		);
		if (mismatched > 0) process.exit(1);
	}
}

main().catch((err) => {
	console.error("[sync-open-design] fatal:", err);
	process.exit(1);
});
