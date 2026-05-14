#!/usr/bin/env node
/**
 * 从 build/icon.png（必须 1024×1024）生成跨平台图标资源：
 *   - build/icon.icns（mac，借助系统自带的 sips + iconutil）
 *   - build/icon.ico（win，借助 npx png-to-ico，跨平台）
 *
 * electron-builder 会自动从 buildResources（即 build/）按文件名识别这两个文件，
 * 不需要改 electron-builder.json5。如果两个文件都已存在且 mtime ≥ icon.png，
 * 直接 skip，避免每次 build 重复生成。
 *
 * 非 mac 环境无法跑 iconutil，会跳过 icns 生成（保留旧文件或交给 electron-builder
 * 从 png 兜底）。ico 任何平台都能生成。
 */
import { spawn } from "node:child_process";
import { access, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const buildDir = resolve(projectRoot, "build");
const pngPath = join(buildDir, "icon.png");
const icnsPath = join(buildDir, "icon.icns");
const icoPath = join(buildDir, "icon.ico");

async function exists(p) {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

async function mtime(p) {
	try {
		return (await stat(p)).mtimeMs;
	} catch {
		return 0;
	}
}

function run(cmd, args, opts = {}) {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(cmd, args, {
			stdio: ["ignore", "pipe", "pipe"],
			...opts,
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", rejectPromise);
		child.on("close", (code) => {
			if (code === 0) resolvePromise({ stdout, stderr });
			else
				rejectPromise(
					new Error(
						`${cmd} ${args.join(" ")} exited with code ${code}\n${stderr}`,
					),
				);
		});
	});
}

async function generateIcns() {
	if (process.platform !== "darwin") {
		console.log("[generate-icons] 非 mac 环境，跳过 icns 生成");
		return false;
	}
	// 1024 / 512 / 256 / 128 / 64 / 32 / 16 + retina @2x，iconutil 要求严格命名
	const sizes = [
		{ size: 16, name: "icon_16x16.png" },
		{ size: 32, name: "icon_16x16@2x.png" },
		{ size: 32, name: "icon_32x32.png" },
		{ size: 64, name: "icon_32x32@2x.png" },
		{ size: 128, name: "icon_128x128.png" },
		{ size: 256, name: "icon_128x128@2x.png" },
		{ size: 256, name: "icon_256x256.png" },
		{ size: 512, name: "icon_256x256@2x.png" },
		{ size: 512, name: "icon_512x512.png" },
		{ size: 1024, name: "icon_512x512@2x.png" },
	];
	const iconset = join(buildDir, "icon.iconset");
	await rm(iconset, { recursive: true, force: true });
	await mkdir(iconset, { recursive: true });
	for (const { size, name } of sizes) {
		await run("sips", [
			"-z",
			String(size),
			String(size),
			pngPath,
			"--out",
			join(iconset, name),
		]);
	}
	await run("iconutil", ["-c", "icns", iconset, "-o", icnsPath]);
	await rm(iconset, { recursive: true, force: true });
	console.log("[generate-icons] icns →", icnsPath);
	return true;
}

async function generateIco() {
	// png-to-ico 默认 stdout 输出 ico 二进制；这里通过 node 子进程读 stdout 写入文件。
	const child = spawn("npx", ["--yes", "png-to-ico", pngPath], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	const chunks = [];
	let stderr = "";
	child.stdout.on("data", (chunk) => chunks.push(chunk));
	child.stderr.on("data", (chunk) => {
		stderr += chunk.toString();
	});
	await new Promise((resolvePromise, rejectPromise) => {
		child.on("error", rejectPromise);
		child.on("close", (code) => {
			if (code === 0) resolvePromise(undefined);
			else rejectPromise(new Error(`png-to-ico exited ${code}\n${stderr}`));
		});
	});
	const buffer = Buffer.concat(chunks);
	if (buffer.length === 0) {
		throw new Error("png-to-ico 输出为空");
	}
	await writeFile(icoPath, buffer);
	console.log("[generate-icons] ico  →", icoPath);
}

async function main() {
	if (!(await exists(pngPath))) {
		console.warn(
			"[generate-icons] build/icon.png 不存在，跳过图标生成（请放置 1024×1024 PNG）。",
		);
		return;
	}
	const pngMtime = await mtime(pngPath);
	const icnsMtime = await mtime(icnsPath);
	const icoMtime = await mtime(icoPath);
	const icnsFresh = icnsMtime >= pngMtime && icnsMtime > 0;
	const icoFresh = icoMtime >= pngMtime && icoMtime > 0;

	// mac 上要求 icns、win/linux 上不强制要求；ico 任意平台都要求
	const wantIcns = process.platform === "darwin";
	if ((!wantIcns || icnsFresh) && icoFresh) {
		console.log("[generate-icons] 图标已是最新，skip");
		return;
	}

	if (wantIcns && !icnsFresh) {
		try {
			await generateIcns();
		} catch (err) {
			console.warn(
				"[generate-icons] icns 生成失败（保留旧文件或由 electron-builder 兜底）：",
				err instanceof Error ? err.message : err,
			);
		}
	}

	if (!icoFresh) {
		try {
			await generateIco();
		} catch (err) {
			console.warn(
				"[generate-icons] ico 生成失败：",
				err instanceof Error ? err.message : err,
			);
		}
	}
}

main().catch((err) => {
	console.error("[generate-icons] failed:", err);
	process.exit(1);
});
