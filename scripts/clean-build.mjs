#!/usr/bin/env node
/**
 * 清理构建输出，避免 vite-plugin-electron 历史 hash 文件残留进安装包。
 * 只删除仓库内的可再生成产物，不触碰 release 与用户运行时数据。
 */
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const targets = ["dist", "dist-electron"];

for (const target of targets) {
	const absolutePath = resolve(projectRoot, target);
	await rm(absolutePath, { recursive: true, force: true });
	console.log("[clean-build] removed", target);
}
