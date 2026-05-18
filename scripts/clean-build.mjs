#!/usr/bin/env node
/**
 * 清理构建输出，避免 vite-plugin-electron 历史 hash 文件残留进安装包。
 * 只删除仓库内的可再生成产物，不触碰 release 与用户运行时数据。
 *
 * 模式：
 *   - 默认（npm run clean:build / prepare:build）：删除整个 dist 与 dist-electron
 *   - --dev（npm run predev 或手动）：只清理 dist-electron 中过期的 hash 文件，
 *     保留最新 20 个；首次 vite dev 不会触发，开发期间 HMR 累积过多时手动跑一次
 */
import { readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const isDevMode = process.argv.includes("--dev");

if (!isDevMode) {
	const targets = ["dist", "dist-electron"];
	for (const target of targets) {
		const absolutePath = resolve(projectRoot, target);
		await rm(absolutePath, { recursive: true, force: true });
		console.log("[clean-build] removed", target);
	}
} else {
	const KEEP_LATEST = 20;
	const distElectron = resolve(projectRoot, "dist-electron");
	let entries;
	try {
		entries = await readdir(distElectron);
	} catch {
		// 目录不存在视为干净，不做事
		process.exit(0);
	}

	const files = [];
	for (const name of entries) {
		if (!name.endsWith(".js") && !name.endsWith(".map")) continue;
		const full = join(distElectron, name);
		try {
			const st = await stat(full);
			if (!st.isFile()) continue;
			files.push({ name, full, mtime: st.mtimeMs, size: st.size });
		} catch {
			// stat 失败跳过
		}
	}

	// 按 mtime 倒序，保留最新 KEEP_LATEST 个
	files.sort((a, b) => b.mtime - a.mtime);
	const toRemove = files.slice(KEEP_LATEST);
	if (toRemove.length === 0) {
		console.log("[clean-build:dev] dist-electron 无可清理 hash 文件");
		process.exit(0);
	}
	let bytes = 0;
	for (const f of toRemove) {
		bytes += f.size;
		await rm(f.full, { force: true });
	}
	console.log(
		`[clean-build:dev] 清理 ${toRemove.length} 个旧 hash 文件，释放约 ${(bytes / 1024 / 1024).toFixed(1)} MB`,
	);
}
