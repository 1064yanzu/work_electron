/**
 * harness 探测 —— 判断本机装了哪些 AI CLI，以及各自的能力。
 *
 * 判定口径：
 * - `binPath`：CLI 可执行文件（决定「能否注入」——没有可执行文件就没法在 pty 里起它）
 * - `sessionDir`：会话目录（决定「能否读取历史」——目录不存在就没有资产可摄取）
 * 两者独立：装了 CLI 但从没用过 → 可注入不可读；卸载了 CLI 但历��还在 → 可读不可注入。
 *
 * 首次实现覆盖 claude-code + codex 的完整读写；gemini-cli / opencode 只做探测与注入，
 * 其会话格式待后续补 adapter（新增 harness = 新增一个 adapter 文件，其余层零改动）。
 */
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { HarnessDetection, HarnessKind } from "./types";

const execFileAsync = promisify(execFile);

/** 单个 harness 的静态描述。 */
interface HarnessSpec {
	harness: HarnessKind;
	label: string;
	/** 可执行文件名（用 which 查） */
	bin: string;
	/** 会话目录 */
	sessionDir: string;
	/** 是否已实现 adapter（能读历史） */
	hasAdapter: boolean;
	/** 在 pty 中启动该 CLI 的命令 */
	launchCommand: string;
}

export const HARNESS_SPECS: HarnessSpec[] = [
	{
		harness: "claude-code",
		label: "Claude Code",
		bin: "claude",
		sessionDir: path.join(homedir(), ".claude", "projects"),
		hasAdapter: true,
		launchCommand: "claude",
	},
	{
		harness: "codex",
		label: "Codex",
		bin: "codex",
		sessionDir: path.join(homedir(), ".codex", "sessions"),
		hasAdapter: true,
		launchCommand: "codex",
	},
	{
		harness: "gemini-cli",
		label: "Gemini CLI",
		bin: "gemini",
		sessionDir: path.join(homedir(), ".gemini", "tmp"),
		hasAdapter: false,
		launchCommand: "gemini",
	},
	{
		harness: "opencode",
		label: "OpenCode",
		bin: "opencode",
		sessionDir: path.join(homedir(), ".local", "share", "opencode", "storage"),
		hasAdapter: false,
		launchCommand: "opencode",
	},
];

/** 按 harness 种类取 spec。 */
export function getHarnessSpec(harness: HarnessKind): HarnessSpec | undefined {
	return HARNESS_SPECS.find((s) => s.harness === harness);
}

/**
 * PATH 兜底目录：GUI 启动的 Electron 拿不到用户 shell 的完整 PATH，
 * `which` 会漏掉 nvm / npm-global / homebrew 里的 CLI。
 */
const EXTRA_PATH_DIRS = [
	path.join(homedir(), ".local", "bin"),
	path.join(homedir(), ".npm-global", "bin"),
	"/opt/homebrew/bin",
	"/usr/local/bin",
	path.join(homedir(), ".bun", "bin"),
	path.join(homedir(), ".volta", "bin"),
];

/** 查可执行文件绝对路径；找不到返回 null。 */
async function whichBin(bin: string): Promise<string | null> {
	// 先走 which（尊重用户真实 PATH）
	try {
		const { stdout } = await execFileAsync("which", [bin], {
			timeout: 3000,
			env: {
				...process.env,
				PATH: `${process.env.PATH ?? ""}:${EXTRA_PATH_DIRS.join(":")}`,
			},
		});
		const found = stdout.trim().split("\n")[0]?.trim();
		if (found) return found;
	} catch {
		// which 未命中，继续走目录穷举
	}
	for (const dir of EXTRA_PATH_DIRS) {
		const candidate = path.join(dir, bin);
		try {
			await access(candidate);
			return candidate;
		} catch {
			// 继续下一个候选目录
		}
	}
	return null;
}

/** 目录是否存在。 */
async function dirExists(dir: string): Promise<boolean> {
	try {
		await access(dir);
		return true;
	} catch {
		return false;
	}
}

/**
 * 探测全部 harness。
 *
 * @param sessionCounts 各 harness 已摄取的会话数（由调用方从 DB 查好传入，
 *                      避免本模块依赖 DB）
 */
export async function detectHarnesses(
	sessionCounts: Partial<Record<HarnessKind, number>> = {},
): Promise<HarnessDetection[]> {
	return await Promise.all(
		HARNESS_SPECS.map(async (spec) => {
			const [binPath, hasDir] = await Promise.all([
				whichBin(spec.bin),
				dirExists(spec.sessionDir),
			]);
			return {
				harness: spec.harness,
				label: spec.label,
				installed: Boolean(binPath) || hasDir,
				binPath,
				sessionDir: hasDir ? spec.sessionDir : null,
				canRead: spec.hasAdapter && hasDir,
				canInject: Boolean(binPath),
				launchCommand: spec.launchCommand,
				sessionCount: sessionCounts[spec.harness] ?? 0,
			} satisfies HarnessDetection;
		}),
	);
}

/** 取某 harness 在 pty 中的启动命令（注入层用）。 */
export function launchCommandFor(harness: HarnessKind): string | null {
	return getHarnessSpec(harness)?.launchCommand ?? null;
}
