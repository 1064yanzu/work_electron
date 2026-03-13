/**
 * 跨平台 CLI 二进制检测服务
 *
 * 统一 Claude Code 与 Codex 两个后端的 CLI 路径检测逻辑，
 * 支持 macOS / Linux / Windows，优先使用用户手动配置的路径。
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ─── 类型 ────────────────────────────────────────────────────────

export type CliBackendId = "claude-code" | "codex";
export type CliSource =
	| "user_configured"
	| "system_detected"
	| "sdk_bundled"
	| "not_found";

export interface CliBinaryInfo {
	backend: CliBackendId;
	path: string | null;
	source: CliSource;
	version: string | null;
	detectedAt: number;
	error?: string;
}

export interface DetectOptions {
	/** 用户在设置中手动配置的路径（优先级最高） */
	userConfiguredPath?: string;
	/** 跳过缓存 */
	skipCache?: boolean;
}

// ─── 候选路径 ─────────────────────────────────────────────────────

const home = os.homedir();
const platform = os.platform();

function getCandidatePaths(backend: CliBackendId): string[] {
	const binaryName = backend === "claude-code" ? "claude" : "codex";

	if (platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA || "";
		const appData = process.env.APPDATA || "";
		const programFiles = process.env.ProgramFiles || "C:\\Program Files";
		return [
			localAppData &&
				path.join(localAppData, "Programs", binaryName, `${binaryName}.exe`),
			appData && path.join(appData, "npm", `${binaryName}.cmd`),
			path.join(programFiles, binaryName, `${binaryName}.exe`),
		].filter(Boolean) as string[];
	}

	// macOS & Linux 共享路径
	const paths = [
		`/usr/local/bin/${binaryName}`,
		path.join(home, ".local", "bin", binaryName),
		path.join(home, ".npm-global", "bin", binaryName),
	];

	if (platform === "darwin") {
		// Homebrew Apple Silicon
		paths.splice(1, 0, `/opt/homebrew/bin/${binaryName}`);
	}

	if (platform === "linux") {
		paths.push(`/snap/bin/${binaryName}`);
	}

	return paths;
}

// ─── Shell fallback ───────────────────────────────────────────────

const SHELL_TIMEOUT_MS = 5_000;

async function detectViaShell(binaryName: string): Promise<string | null> {
	try {
		if (platform === "win32") {
			const { stdout } = await execFileAsync(
				"where.exe",
				[`${binaryName}.exe`],
				{ timeout: SHELL_TIMEOUT_MS },
			);
			const firstLine = stdout.trim().split(/\r?\n/)[0];
			return firstLine && fs.existsSync(firstLine) ? firstLine : null;
		}

		// macOS / Linux：通过 login shell 获取完整 PATH
		const { stdout } = await execFileAsync(
			"bash",
			["-lc", `command -v ${binaryName}`],
			{ timeout: SHELL_TIMEOUT_MS },
		);
		const result = stdout.trim();
		return result && fs.existsSync(result) ? result : null;
	} catch {
		return null;
	}
}

// ─── 版本获取 ─────────────────────────────────────────────────────

async function getCliVersion(binaryPath: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(binaryPath, ["--version"], {
			timeout: SHELL_TIMEOUT_MS,
		});
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

// ─── SDK 内嵌 fallback (仅 Claude Code) ──────────────────────────

export function resolveSdkBundledCli(): string | null {
	try {
		const p = require.resolve("@anthropic-ai/claude-agent-sdk/cli.js");
		return fs.existsSync(p) ? p : null;
	} catch {
		return null;
	}
}

// ─── 缓存 ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000; // 60 秒
const cache = new Map<CliBackendId, CliBinaryInfo>();

export function invalidateCliCache(backend?: CliBackendId): void {
	if (backend) {
		cache.delete(backend);
	} else {
		cache.clear();
	}
}

function getCached(backend: CliBackendId): CliBinaryInfo | null {
	const entry = cache.get(backend);
	if (!entry) return null;
	if (Date.now() - entry.detectedAt > CACHE_TTL_MS) {
		cache.delete(backend);
		return null;
	}
	return entry;
}

// ─── 核心检测 ─────────────────────────────────────────────────────

export async function detectCliBinary(
	backend: CliBackendId,
	options?: DetectOptions,
): Promise<CliBinaryInfo> {
	// 1. 缓存命中
	if (!options?.skipCache) {
		const cached = getCached(backend);
		if (cached) return cached;
	}

	const binaryName = backend === "claude-code" ? "claude" : "codex";
	const now = Date.now();

	// 2. 用户手动配置路径（优先级最高）
	if (options?.userConfiguredPath?.trim()) {
		const userPath = options.userConfiguredPath.trim();
		if (fs.existsSync(userPath)) {
			const version = await getCliVersion(userPath);
			const info: CliBinaryInfo = {
				backend,
				path: userPath,
				source: "user_configured",
				version,
				detectedAt: now,
			};
			cache.set(backend, info);
			return info;
		}
		// 用户配置了路径但文件不存在 → 继续自动检测，附上 warning
		const info: CliBinaryInfo = {
			backend,
			path: null,
			source: "not_found",
			version: null,
			detectedAt: now,
			error: `用户配置的路径不存在: ${userPath}`,
		};
		// 不缓存错误，允许下次重试
		return info;
	}

	// 3. 系统候选路径逐个检查
	for (const candidate of getCandidatePaths(backend)) {
		if (fs.existsSync(candidate)) {
			const version = await getCliVersion(candidate);
			const info: CliBinaryInfo = {
				backend,
				path: candidate,
				source: "system_detected",
				version,
				detectedAt: now,
			};
			cache.set(backend, info);
			return info;
		}
	}

	// 4. Shell fallback (command -v / where.exe)
	const shellResult = await detectViaShell(binaryName);
	if (shellResult) {
		const version = await getCliVersion(shellResult);
		const info: CliBinaryInfo = {
			backend,
			path: shellResult,
			source: "system_detected",
			version,
			detectedAt: now,
		};
		cache.set(backend, info);
		return info;
	}

	// 5. SDK 内嵌 fallback (仅 Claude Code)
	if (backend === "claude-code") {
		const sdkPath = resolveSdkBundledCli();
		if (sdkPath) {
			const info: CliBinaryInfo = {
				backend,
				path: sdkPath,
				source: "sdk_bundled",
				version: null, // SDK 内嵌版本号不易获取
				detectedAt: now,
			};
			cache.set(backend, info);
			return info;
		}
	}

	// 6. 未找到
	const info: CliBinaryInfo = {
		backend,
		path: null,
		source: "not_found",
		version: null,
		detectedAt: now,
		error:
			backend === "claude-code"
				? "未检测到 Claude Code CLI，也未找到 SDK 内嵌版本。"
				: "未检测到 Codex CLI，请先安装 codex。",
	};
	cache.set(backend, info);
	return info;
}
