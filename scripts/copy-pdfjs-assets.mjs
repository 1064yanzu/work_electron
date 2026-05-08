#!/usr/bin/env node
/**
 * 把 pdfjs-dist 自带的 cmaps / standard_fonts / wasm 资源拷贝到 public/pdfjs/，
 * 让 react-pdf / pdfjs 能在运行时加载它们，避免 console 大量出现：
 *   - "Cannot substitute the font because of its name: ..."
 *   - "Ensure that the `cMapUrl` and `cMapPacked` API parameters are provided."
 *   - "JpxImage#instantiateWasm: Ensure that the `wasmUrl` API parameter is provided."
 *   - "OpenJPEG failed to initialize"
 *
 * 这些资源体量较大，不适合直接 commit；通过本脚本在 dev / build 前同步。
 */
import { mkdir, cp, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const pdfjsRoot = resolve(projectRoot, "node_modules/pdfjs-dist");
const publicRoot = resolve(projectRoot, "public/pdfjs");

const targets = [
	{ from: "cmaps", to: "cmaps" },
	{ from: "standard_fonts", to: "standard_fonts" },
	{ from: "wasm", to: "wasm" },
];

async function exists(p) {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

async function main() {
	if (!(await exists(pdfjsRoot))) {
		console.warn(
			"[copy-pdfjs-assets] node_modules/pdfjs-dist 不存在，请先 npm install。",
		);
		return;
	}
	await mkdir(publicRoot, { recursive: true });
	for (const { from, to } of targets) {
		const src = join(pdfjsRoot, from);
		const dest = join(publicRoot, to);
		if (!(await exists(src))) continue;
		await cp(src, dest, { recursive: true, force: true });
	}
	console.log("[copy-pdfjs-assets] done →", publicRoot);
}

main().catch((err) => {
	console.error("[copy-pdfjs-assets] failed:", err);
	process.exit(1);
});
