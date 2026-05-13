/**
 * /cli 子命令解析器（IM 远程终端控制指令族）
 *
 * 语法：
 *   /cli                        → help
 *   /cli help                   → help
 *   /cli list                   → 列出当前活跃 pty
 *   /cli status                 → 当前会话信息
 *   /cli start <preset|cmd>     → 启动 pty 跑预设 CLI 或自定义命令
 *      [--cwd <path>]
 *   /cli stop                   → 停止当前 pty
 *   /cli key <name>             → 发送特殊键
 *   /cli ctrl-c | ctrl-d | ctrl-z | tab | esc | enter | up | down | left | right | backspace
 *                               → 上面 /cli key <name> 的快捷写法
 *
 * 普通文本（不以 /cli 开头）在 ptyBridge 里直接作为 stdin 注入，不走本解析器。
 */

export type CliKeyName =
	| "ctrl-c"
	| "ctrl-d"
	| "ctrl-z"
	| "ctrl-l"
	| "tab"
	| "esc"
	| "enter"
	| "up"
	| "down"
	| "left"
	| "right"
	| "backspace"
	| "space"
	| "pageup"
	| "pagedown"
	| "home"
	| "end";

export type ParsedCliCommand =
	| { kind: "help" }
	| { kind: "list" }
	| { kind: "status" }
	| { kind: "stop" }
	| { kind: "start"; target: string; cwd?: string }
	| { kind: "key"; key: CliKeyName }
	| { kind: "text"; text: string }
	| { kind: "unknown"; reason: string };

const KEY_ALIAS_MAP: Record<string, CliKeyName> = {
	"ctrl-c": "ctrl-c",
	"ctrl+c": "ctrl-c",
	ctrlc: "ctrl-c",
	"^c": "ctrl-c",
	"ctrl-d": "ctrl-d",
	"ctrl+d": "ctrl-d",
	ctrld: "ctrl-d",
	"^d": "ctrl-d",
	"ctrl-z": "ctrl-z",
	"ctrl+z": "ctrl-z",
	ctrlz: "ctrl-z",
	"^z": "ctrl-z",
	"ctrl-l": "ctrl-l",
	"ctrl+l": "ctrl-l",
	ctrll: "ctrl-l",
	tab: "tab",
	esc: "esc",
	escape: "esc",
	enter: "enter",
	return: "enter",
	up: "up",
	down: "down",
	left: "left",
	right: "right",
	backspace: "backspace",
	bs: "backspace",
	space: "space",
	pageup: "pageup",
	pagedown: "pagedown",
	home: "home",
	end: "end",
	// 单字符 emoji 快捷（IM 文本输入更顺手）
	"⏎": "enter",
	"⎋": "esc",
	"↑": "up",
	"↓": "down",
	"←": "left",
	"→": "right",
	"⇥": "tab",
	"⌫": "backspace",
};

/**
 * pty 控制字节序列。
 * 方向键 / 功能键沿用 xterm 序列；vt 风格 TUI 也都识别。
 */
export const KEY_SEQUENCE: Record<CliKeyName, string> = {
	"ctrl-c": "\x03",
	"ctrl-d": "\x04",
	"ctrl-z": "\x1a",
	"ctrl-l": "\x0c",
	tab: "\t",
	esc: "\x1b",
	enter: "\r",
	up: "\x1b[A",
	down: "\x1b[B",
	right: "\x1b[C",
	left: "\x1b[D",
	backspace: "\x7f",
	space: " ",
	pageup: "\x1b[5~",
	pagedown: "\x1b[6~",
	home: "\x1b[H",
	end: "\x1b[F",
};

export function normalizeKeyAlias(input: string): CliKeyName | null {
	const lower = input.trim().toLowerCase();
	return KEY_ALIAS_MAP[lower] ?? null;
}

/**
 * 把 `--cwd <path>` 形式从 tokens 中抠出来。其他 tokens 作为命令片段返回。
 */
function extractCwdFlag(tokens: string[]): { rest: string[]; cwd?: string } {
	const rest: string[] = [];
	let cwd: string | undefined;
	let i = 0;
	while (i < tokens.length) {
		const t = tokens[i];
		if (t === "--cwd" || t === "-C") {
			const value = tokens[i + 1];
			if (value) cwd = value;
			i += 2;
			continue;
		}
		if (t.startsWith("--cwd=")) {
			cwd = t.slice("--cwd=".length);
			i += 1;
			continue;
		}
		rest.push(t);
		i += 1;
	}
	return { rest, cwd };
}

/**
 * 解析 `/cli ...` 文本。
 *
 * @param text 原始消息文本（必须已经是 `/cli` 开头）
 * @returns ParsedCliCommand
 */
export function parseCliCommand(text: string): ParsedCliCommand {
	const trimmed = text.trim();
	const match = trimmed.match(/^\/cli(?:\s+([\s\S]*))?$/i);
	if (!match) return { kind: "unknown", reason: "不是 /cli 指令" };
	const body = (match[1] || "").trim();
	if (!body) return { kind: "help" };

	const tokens = body.split(/\s+/).filter(Boolean);
	const head = (tokens[0] || "").toLowerCase();
	const tail = tokens.slice(1);

	if (head === "help" || head === "?") return { kind: "help" };
	if (head === "list" || head === "ls") return { kind: "list" };
	if (head === "status") return { kind: "status" };
	if (head === "stop" || head === "exit" || head === "kill") {
		return { kind: "stop" };
	}
	if (head === "start" || head === "run") {
		if (tail.length === 0) {
			return { kind: "unknown", reason: "/cli start 需要指定 preset 或命令" };
		}
		const { rest, cwd } = extractCwdFlag(tail);
		const target = rest.join(" ").trim();
		if (!target) {
			return { kind: "unknown", reason: "/cli start 需要指定 preset 或命令" };
		}
		return { kind: "start", target, cwd };
	}
	if (head === "key") {
		const keyName = tail[0];
		if (!keyName) return { kind: "unknown", reason: "/cli key 需要键名" };
		const normalized = normalizeKeyAlias(keyName);
		if (!normalized) {
			return { kind: "unknown", reason: `未知按键：${keyName}` };
		}
		return { kind: "key", key: normalized };
	}
	const directKey = normalizeKeyAlias(head);
	if (directKey) return { kind: "key", key: directKey };

	return { kind: "unknown", reason: `未知子命令：${head}` };
}

export function getCliHelpText(): string {
	return [
		"远程终端 (`/cli`) 帮助：",
		"  /cli start <preset|cmd> [--cwd <path>]  启动预设 CLI 或任意命令",
		"  /cli stop                                停止当前会话",
		"  /cli status                              查看当前会话状态",
		"  /cli list                                列出活跃会话",
		"  /cli ctrl-c | ctrl-d | tab | esc | enter | up/down/left/right",
		"                                           发送特殊键",
		"  /cli key <name>                          通用按键发送",
		"快捷形式（无需 /cli 前缀）：",
		"  /k <name>                                等价 /cli key",
		"  /⏎ /⎋ /↑ /↓ /←/→ /⇥ /⌫                  单字符按键",
		"启动后，未带 / 前缀的普通消息会作为 stdin 注入（自动追加换行）。",
	].join("\n");
}

/**
 * 终端短指令前缀正则。
 *
 * 命中以下任意一种：
 *   /k <key>          —— 通用按键短形式
 *   /<single-emoji>   —— 单字符快捷（⏎ ⎋ ↑ ↓ ← → ⇥ ⌫）
 *
 * 都会被改写为 ParsedCliCommand.key 形态，由 ptyBridgeService 复用既有 KEY
 * 分支处理。当前不支持的写法返回 null（由调用方继续向后探测）。
 */
export function tryParseTerminalShortcut(
	text: string,
): ParsedCliCommand | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith("/")) return null;

	// /k <name>
	const kMatch = trimmed.match(/^\/k(?:\s+(\S+))?\s*$/i);
	if (kMatch) {
		const name = kMatch[1];
		if (!name)
			return { kind: "unknown", reason: "/k 需要按键名（例：/k enter）" };
		const normalized = normalizeKeyAlias(name);
		if (!normalized) return { kind: "unknown", reason: `未知按键：${name}` };
		return { kind: "key", key: normalized };
	}

	// /i <text>   作为 stdin 注入（按钮卡片回调用，普通用户也可以手输）
	const iMatch = trimmed.match(/^\/i(?:\s+([\s\S]+))?$/i);
	if (iMatch) {
		const body = (iMatch[1] || "").trim();
		if (!body) return { kind: "unknown", reason: "/i 需要内容（例：/i y）" };
		return { kind: "text", text: body };
	}

	// /<single-symbol>：必须正好是「斜杠 + 一个字符」，不能带空格或后缀
	const symMatch = trimmed.match(/^\/(\S)$/);
	if (symMatch) {
		const symbol = symMatch[1];
		const normalized = normalizeKeyAlias(symbol);
		if (normalized) return { kind: "key", key: normalized };
	}

	return null;
}
