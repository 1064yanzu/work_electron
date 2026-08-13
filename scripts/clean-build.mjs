#!/usr/bin/env node
/**
 * 清理构建输出，避免 vite-plugin-electron 历史 hash 文件残留进安装包。
 * 只删除仓库内的可再生成产物，不触碰 release 与用户运行时数据。
 *
 * 模式：
 *   - 默认（npm run clean:build / prepare:build）：删除整个 dist 与 dist-electron
 *   - --dev（npm run predev 或手动）：清理 dist-electron 中过期的 hash 文件，
 *     按「产物基名」分组、每组只保留 mtime 最新的一份
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

	// 按「产物基名」分组，每组只留 mtime 最新的一份。
	//
	// 为什么不是简单的 "保留最新 20 个"：vite-plugin-electron 每次重建都产出
	// `<name>-<hash>.js`（+ `.map`），主进程 bundle 单个就有 8MB 量级。全局取
	// 前 20 个会出现两种坏情况：产物种类多时（index / preload / worker...）
	// 某些种类的**当前有效文件**被挤出前 20 被误删，开发期直接起不来；
	// 产物种类少时又白留 19 份历史垃圾。按基名分组两个问题一起解决。
	//
	// 历史事故：dist-electron 里攒了 111 个 index-*.js，electron-builder
	// 把整个目录打进 app.asar，安装包体积异常膨胀。
	const groups = new Map();
	for (const file of files) {
		// `index-D4kXq2.js` → `index`；`index-D4kXq2.js.map` → `index` + `.map` 后缀
		const isMap = file.name.endsWith(".map");
		const jsName = isMap ? file.name.slice(0, -4) : file.name;
		const match = /^(.*?)-[A-Za-z0-9_-]{6,}\.js$/.exec(jsName);
		// 不带 hash 的文件（如手工放进去的资源）不参与淘汰
		if (!match) continue;
		const key = `${match[1]}${isMap ? ".map" : ""}`;
		const existing = groups.get(key);
		if (!existing) {
			groups.set(key, [file]);
		} else {
			existing.push(file);
		}
	}

	const toRemove = [];
	for (const [, group] of groups) {
		if (group.length <= 1) continue;
		group.sort((a, b) => b.mtime - a.mtime);
		toRemove.push(...group.slice(1));
	}

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
