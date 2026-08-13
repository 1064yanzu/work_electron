/**
 * `terminal_create` 的输入守卫。
 *
 * 渲染端能任意指定 shell 可执行文件和环境变量，等于「随便挑一个程序，
 * 带上我给的环境变量，用主进程的权限跑起来」。这里把这个面收窄到：
 *
 * - **shell**：只接受已知的交互式 shell（按 basename 判定），绝对路径必须真实存在
 *   且可执行。传别的一律回落到平台默认 shell，而不是报错——终端打不开对用户
 *   来说比"用了默认 shell"更难理解。
 * - **env**：剔除动态链接器注入类变量（`DYLD_*` / `LD_PRELOAD` / `NODE_OPTIONS` …）。
 *   这些变量能让任意 .so/.dylib 或 JS 在 shell 的每个子进程里执行。
 * - **数量**：同时存在的终端上限 16。每个 pty 都是一个真实进程 + 常驻监听器，
 *   没有上限时一个循环调用就能把机器拖垮。
 */
import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

/** 同时存在的终端数量上限。 */
export const MAX_TERMINALS = 16;

/** 允许的交互式 shell（按 basename 比较，Windows 下忽略大小写与 .exe 后缀）。 */
const ALLOWED_SHELL_BASENAMES = new Set([
	"sh",
	"bash",
	"zsh",
	"fish",
	"dash",
	"ksh",
	"nu",
	"powershell",
	"pwsh",
	"cmd",
]);

/**
 * 会改变子进程加载行为的环境变量 —— 用户/渲染端传进来的一律丢弃。
 *
 * `ZDOTDIR` / `BASH_ENV` / `ENV` 不是链接器变量，但它们能重定向 shell 的启动
 * 脚本，效果等同代码注入，所以放在同一张表里。
 */
const BLOCKED_ENV_KEYS = new Set([
	"DYLD_INSERT_LIBRARIES",
	"DYLD_LIBRARY_PATH",
	"DYLD_FRAMEWORK_PATH",
	"DYLD_FALLBACK_LIBRARY_PATH",
	"DYLD_FALLBACK_FRAMEWORK_PATH",
	"LD_PRELOAD",
	"LD_LIBRARY_PATH",
	"LD_AUDIT",
	"NODE_OPTIONS",
	"ELECTRON_RUN_AS_NODE",
	"BASH_ENV",
	"ENV",
	"ZDOTDIR",
	"PYTHONSTARTUP",
	"PERL5OPT",
	"RUBYOPT",
]);

/** 归一化 shell 的 basename（去掉 .exe、统一小写）。 */
function shellBasename(shell: string): string {
	const base = path.basename(shell.trim()).toLowerCase();
	return base.endsWith(".exe") ? base.slice(0, -4) : base;
}

function isExecutableFile(target: string): boolean {
	try {
		if (!statSync(target).isFile()) return false;
		if (process.platform === "win32") return true;
		accessSync(target, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** 平台默认 shell。用户没指定、或指定的不合法时用它。 */
export function getDefaultShell(): string {
	if (process.platform === "win32") return "powershell.exe";
	const fromEnv = process.env.SHELL;
	if (fromEnv && ALLOWED_SHELL_BASENAMES.has(shellBasename(fromEnv))) {
		return fromEnv;
	}
	return "/bin/zsh";
}

export interface ShellResolution {
	shell: string;
	/** 请求的 shell 被拒绝时为 true，调用方可以据此记日志。 */
	rejected: boolean;
	rejectedValue?: string;
}

/**
 * 解析并校验 shell。
 *
 * 不合法时**回落到默认 shell 而不是抛错**：终端是高频交互入口，
 * 因为一个可疑参数就打不开窗口的体验远差于静默降级 + 日志。
 */
export function resolveShell(requested?: string): ShellResolution {
	const raw = typeof requested === "string" ? requested.trim() : "";
	if (!raw) return { shell: getDefaultShell(), rejected: false };

	if (raw.includes("\0") || !ALLOWED_SHELL_BASENAMES.has(shellBasename(raw))) {
		return {
			shell: getDefaultShell(),
			rejected: true,
			rejectedValue: raw.slice(0, 200),
		};
	}

	// 绝对路径：必须真实存在且可执行，否则 pty.spawn 会抛出难懂的底层错误
	if (path.isAbsolute(raw)) {
		if (!isExecutableFile(raw)) {
			return {
				shell: getDefaultShell(),
				rejected: true,
				rejectedValue: raw.slice(0, 200),
			};
		}
		return { shell: raw, rejected: false };
	}

	// 裸名（`zsh` / `powershell.exe`）交给 PATH 解析，basename 已经过白名单
	return { shell: raw, rejected: false };
}

export interface EnvSanitizeResult {
	env: Record<string, string>;
	/** 被剔除的变量名，供日志与排障使用。 */
	removed: string[];
}

/** 剔除注入类环境变量。 */
export function sanitizeTerminalEnv(
	env?: Record<string, string>,
): EnvSanitizeResult {
	if (!env) return { env: {}, removed: [] };
	const out: Record<string, string> = {};
	const removed: string[] = [];
	for (const [key, value] of Object.entries(env)) {
		if (typeof value !== "string") continue;
		const upper = key.toUpperCase();
		if (BLOCKED_ENV_KEYS.has(upper) || upper.startsWith("DYLD_")) {
			removed.push(key);
			continue;
		}
		out[key] = value;
	}
	return { env: out, removed };
}
