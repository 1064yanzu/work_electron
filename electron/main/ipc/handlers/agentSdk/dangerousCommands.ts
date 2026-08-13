/**
 * Bash 危险命令识别。
 *
 * ## 为什么需要它
 *
 * 本应用的 Agent 默认跑在 `permissionMode: "bypassPermissions"`（等价于
 * `claude --dangerously-skip-permissions`）。这是刻意的产品选择：逐条弹窗会把
 * agent 的工作流打断到不可用。代价是 Bash 分支实际上是**无条件放行**的——
 * 模型只要生成一条 `rm -rf ~`，主进程不会拦。
 *
 * 这里做的不是重新引入审批墙，而是划出一条**很窄的红线**：只匹配那些
 * "跑了就没法回退、且几乎不可能是用户真实意图" 的模式。命中后不 deny，
 * 而是转成 AskUserQuestion 交互卡让用户拍板——正常开发命令（`rm -rf node_modules`、
 * `rm -rf dist`）一条都不会被拦。
 *
 * ## 设计约束
 *
 * - **宁可漏报不可误报**：每误拦一次都在削弱 bypassPermissions 的产品价值。
 *   因此不做"未知命令一律拦"这类保守策略（历史上的 `bashAnalyzer.ts` 就是那么做的，
 *   结果是没人敢启用）。
 * - **不做完整 shell 解析**：真要绕过总能绕（base64 解码后 eval、变量拼接……）。
 *   这层防的是"模型犯浑"，不是"人类攻击者"。真正的边界是 OS 权限与沙盒。
 */
import os from "node:os";
import path from "node:path";

export interface DangerousCommandMatch {
	/** 匹配到的规则标识，用于日志与遥测。 */
	rule: string;
	/** 给用户看的中文说明（会显示在审批卡上）。 */
	reason: string;
}

/** 需要保护的 shell / SSH 配置文件（相对家目录）。 */
const PROTECTED_HOME_ENTRIES = [
	".ssh",
	".zshrc",
	".zprofile",
	".zshenv",
	".bashrc",
	".bash_profile",
	".profile",
	".gitconfig",
	".npmrc",
	".aws",
	".kube",
];

/** 顶层系统目录：删这些等于毁系统。 */
const CRITICAL_SYSTEM_DIRS = [
	"/",
	"/etc",
	"/usr",
	"/bin",
	"/sbin",
	"/var",
	"/lib",
	"/boot",
	"/System",
	"/Library",
	"/Applications",
	"/Users",
	"/home",
];

/**
 * 把命令里的 `$HOME` / `${HOME}` / `~` 展开成真实家目录，并去掉包裹引号。
 * 只为路径比对服务，不追求还原 shell 的完整展开语义。
 */
function normalizeForPathMatch(command: string, homeDir: string): string {
	return command
		.replace(/\$\{HOME\}/g, homeDir)
		.replace(/\$HOME\b/g, homeDir)
		.replace(/(^|[\s='"])~(?=\/|\s|$)/g, `$1${homeDir}`)
		.replace(/["']/g, "");
}

/** 参数里是否出现了指向 `target` 本身（而非其子路径）的路径。 */
function mentionsExactPath(normalized: string, target: string): boolean {
	const resolved = path.resolve(target);
	// 末尾允许有 `/`、`/*`、`/.`，这些都等价于"整个目录"
	const escaped = resolved.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(
		`(^|\\s)${escaped}(/\\*?|/\\.)?(\\s|$|;|&|\\|)`,
		"m",
	);
	return pattern.test(normalized);
}

/** 参数里是否出现了 `target` 或它的任意子路径。 */
function mentionsPathOrChild(normalized: string, target: string): boolean {
	const resolved = path.resolve(target);
	const escaped = resolved.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(^|[\\s=><])${escaped}(/|\\s|$|;|&|\\|)`, "m").test(
		normalized,
	);
}

/**
 * 按 `&&` / `||` / `;` / 换行拆成子命令。
 *
 * 管道 `|` **不拆**：`curl x | sh` 的危险性正来自管道两端的组合，
 * 拆开之后两边单看都人畜无害。
 */
function splitSequentialSegments(command: string): string[] {
	return command
		.split(/(?:&&|\|\||;|\n)/g)
		.map((s) => s.trim())
		.filter(Boolean);
}

/** `rm` 是否带了递归或强制标志（支持 `-rf` / `-r -f` / `--recursive` 等写法）。 */
function hasDestructiveRmFlags(segment: string): boolean {
	return /\brm\b[^|;&]*?(\s-{1,2}[A-Za-z-]*(?:r|R|f|recursive|force)[A-Za-z-]*)/.test(
		segment,
	);
}

function checkSegment(
	segment: string,
	homeDir: string,
): DangerousCommandMatch | null {
	const normalized = normalizeForPathMatch(segment, homeDir);
	const lower = normalized.toLowerCase();

	// --- 管道到 shell：远程脚本直接执行 ---
	if (
		/\b(curl|wget|fetch)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|dash|ksh|python3?|node|perl|ruby)\b/.test(
			lower,
		)
	) {
		return {
			rule: "pipe-to-shell",
			reason:
				"这条命令会把网络上下载的内容直接交给 shell 执行（curl/wget | sh）。远端脚本内容不可见，等于把机器交给对方。",
		};
	}

	// --- fork bomb ---
	if (/:\s*\(\s*\)\s*\{.*\|.*&.*\}\s*;?\s*:/.test(normalized)) {
		return {
			rule: "fork-bomb",
			reason: "这条命令是 fork bomb，执行后会耗尽系统进程数导致机器失去响应。",
		};
	}

	// --- 磁盘级破坏 ---
	if (/\bmkfs(\.\w+)?\b/.test(lower)) {
		return {
			rule: "mkfs",
			reason: "这条命令会格式化文件系统，磁盘上的数据将无法恢复。",
		};
	}
	if (/\bdd\b[^|;&]*\bof=\/dev\/(disk|sd|nvme|hd)/.test(lower)) {
		return {
			rule: "dd-to-device",
			reason: "这条命令会用 dd 直接写裸设备，会覆盖分区表 / 整块磁盘。",
		};
	}

	// --- rm：只在目标是根 / 家目录 / 顶层系统目录时拦 ---
	if (/\brm\b/.test(lower) && hasDestructiveRmFlags(normalized)) {
		if (mentionsExactPath(normalized, homeDir)) {
			return {
				rule: "rm-home",
				reason: `这条命令会递归删除整个家目录（${homeDir}），包括所有个人文件、密钥与配置。`,
			};
		}
		for (const dir of CRITICAL_SYSTEM_DIRS) {
			if (mentionsExactPath(normalized, dir)) {
				return {
					rule: "rm-system-dir",
					reason: `这条命令会递归删除系统级目录 ${dir}，会直接破坏操作系统。`,
				};
			}
		}
		// `rm -rf $SOMETHING_UNSET/` 展开后就是 `rm -rf /`，同样致命
		if (/\brm\b[^|;&]*\s\$\{?\w+\}?\/(\s|$)/.test(normalized)) {
			return {
				rule: "rm-unexpanded-var",
				reason:
					"这条命令用未确认取值的变量拼出删除路径；变量为空时会退化成 `rm -rf /`。",
			};
		}
	}

	// --- sudo + 破坏性动词 ---
	if (/\bsudo\b/.test(lower)) {
		if (
			/\bsudo\b[^|;&]*\b(rm|dd|mkfs|shred|chown|chmod|kill|pkill)\b/.test(lower)
		) {
			return {
				rule: "sudo-destructive",
				reason:
					"这条命令用 sudo 提权执行破坏性操作，会绕过普通用户的文件权限保护。",
			};
		}
	}

	// --- 递归放开全局权限 ---
	if (
		/\bchmod\b[^|;&]*(-{1,2}[A-Za-z]*R[A-Za-z]*)\s+0?777\b/.test(normalized)
	) {
		return {
			rule: "chmod-777-recursive",
			reason:
				"这条命令会递归把目标改成 777（任何用户可读写执行），是典型的权限灾难。",
		};
	}

	// --- 写 / 删 shell 与 SSH 配置 ---
	const writesSomewhere =
		/(^|\s)(>|>>)\s*\S/.test(normalized) ||
		/\b(tee|cp|mv|ln|install|rsync|shred|truncate|chmod|chown)\b/.test(lower) ||
		/\brm\b/.test(lower) ||
		/\bsed\b[^|;&]*\s-i\b/.test(normalized);

	if (writesSomewhere) {
		for (const entry of PROTECTED_HOME_ENTRIES) {
			const target = path.join(homeDir, entry);
			if (mentionsPathOrChild(normalized, target)) {
				return {
					rule: "write-protected-home-file",
					reason: `这条命令会改写或删除 ~/${entry}。这类文件控制着你的 shell 启动行为与远程登录凭证，被篡改后每开一个终端都会重新执行注入的内容。`,
				};
			}
		}
		if (mentionsPathOrChild(normalized, "/etc")) {
			return {
				rule: "write-etc",
				reason: "这条命令会改写 /etc 下的系统配置。",
			};
		}
	}

	// --- crontab 覆盖（等价于装了个开机自启后门）---
	if (/\bcrontab\b[^|;&]*\s-r\b/.test(lower)) {
		return {
			rule: "crontab-remove",
			reason: "这条命令会清空当前用户的全部定时任务。",
		};
	}

	return null;
}

/**
 * 检查一条 Bash 命令是否命中危险模式。
 *
 * @param command Bash 工具的 `command` 参数原文
 * @param homeDir 家目录（可注入，便于测试）；默认取 `os.homedir()`
 * @returns 命中返回匹配详情，未命中返回 null
 */
export function detectDangerousBashCommand(
	command: unknown,
	homeDir: string = os.homedir(),
): DangerousCommandMatch | null {
	const text = typeof command === "string" ? command.trim() : "";
	if (!text) return null;

	for (const segment of splitSequentialSegments(text)) {
		const hit = checkSegment(segment, homeDir);
		if (hit) return hit;
	}
	return null;
}
