/**
 * /cli 子命令解析器（IM 远程终端控制指令族）
 *
 * 完整语法（详见 getCliHelpText）：
 *   /cli                        → help
 *   /cli help                   → help
 *   /cli list                   → 列出当前活跃 pty
 *   /cli status                 → 当前会话信息
 *   /cli start <preset|cmd>     → 启动 pty 跑预设 CLI 或自定义命令
 *      [--cwd <path>]
 *   /cli stop                   → 停止当前 pty
 *   /cli key <name>             → 发送特殊键
 *   /cli ctrl-c | ctrl-d | ctrl-z | tab | esc | enter | up | down | left | right | backspace
 *                               → 发送特殊键（快捷写法）
 *   /cli up [N] / down [N] / top / bottom / page-up / page-down
 *                               → 屏幕滚动（不发送给 pty，仅切换 viewport）
 *   /cli resize <cols>[x<rows>] → 修改当前会话屏幕尺寸
 *   /cli color <on|off|auto>    → 切换颜色渲染（仅本会话）
 *   /cli speed <fast|normal|slow> → 切换 snapshot 节流（150/350/800ms）
 *   /cli history                → 列出最近输入
 *   /cli !N | /cli recall N     → 重发历史第 N 条
 *   /cli get <path>             → 从 cwd 下载文件回 IM
 *   /cli more                   → 翻折叠的下一页
 *   /cli confirm | cancel       → 确认/取消待确认的危险命令
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

export type CliScrollDir =
	| "up"
	| "down"
	| "top"
	| "bottom"
	| "page-up"
	| "page-down";

export type CliColorMode = "on" | "off" | "auto";

export type CliSpeedMode = "fast" | "normal" | "slow";

export type ParsedCliCommand =
	| { kind: "help" }
	| { kind: "list" }
	| { kind: "status" }
	| { kind: "stop" }
	| { kind: "start"; target: string; cwd?: string }
	| { kind: "key"; key: CliKeyName }
	| { kind: "text"; text: string }
	| { kind: "scroll"; dir: CliScrollDir; amount?: number }
	| { kind: "resize"; cols: number; rows?: number }
	| { kind: "color"; mode: CliColorMode }
	| { kind: "speed"; mode: CliSpeedMode }
	| { kind: "history" }
	| { kind: "recall"; index: number }
	| { kind: "get"; path: string }
	| { kind: "more" }
	| { kind: "confirm" }
	| { kind: "cancel" }
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

const SCROLL_HEAD_MAP: Record<string, CliScrollDir> = {
	up: "up",
	scrollup: "up",
	down: "down",
	scrolldown: "down",
	top: "top",
	home: "top",
	bottom: "bottom",
	end: "bottom",
	"page-up": "page-up",
	pageup: "page-up",
	pgup: "page-up",
	"page-down": "page-down",
	pagedown: "page-down",
	pgdn: "page-down",
};

const COLOR_MODE_MAP: Record<string, CliColorMode> = {
	on: "on",
	color: "on",
	colour: "on",
	ansi: "on",
	off: "off",
	plain: "off",
	mono: "off",
	auto: "auto",
};

const SPEED_MODE_MAP: Record<string, CliSpeedMode> = {
	fast: "fast",
	quick: "fast",
	normal: "normal",
	default: "normal",
	slow: "slow",
	low: "slow",
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

function parseResizeArg(arg: string): { cols: number; rows?: number } | null {
	const m = arg.match(/^(\d+)(?:[x×*](\d+))?$/i);
	if (!m) return null;
	const cols = Number(m[1]);
	const rows = m[2] ? Number(m[2]) : undefined;
	if (!Number.isFinite(cols) || cols < 30 || cols > 240) return null;
	if (rows !== undefined && (!Number.isFinite(rows) || rows < 8 || rows > 80))
		return null;
	return rows !== undefined ? { cols, rows } : { cols };
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

	// ─── 体验升级子命令（2026-05-13） ──────────────────────

	const scrollDir = SCROLL_HEAD_MAP[head];
	if (scrollDir) {
		// /cli up 5  /cli down 10
		if (scrollDir === "up" || scrollDir === "down") {
			const amount = tail[0] ? Number(tail[0]) : undefined;
			if (
				amount !== undefined &&
				(!Number.isFinite(amount) || amount < 1 || amount > 1000)
			) {
				return { kind: "unknown", reason: "滚屏行数应在 1-1000 之间" };
			}
			return { kind: "scroll", dir: scrollDir, amount };
		}
		return { kind: "scroll", dir: scrollDir };
	}

	if (head === "resize") {
		const parsed = tail[0] ? parseResizeArg(tail[0]) : null;
		if (!parsed) {
			return {
				kind: "unknown",
				reason:
					"/cli resize 需要列数（30-240），可选行数。例：/cli resize 80x30",
			};
		}
		return { kind: "resize", cols: parsed.cols, rows: parsed.rows };
	}

	if (head === "color" || head === "colour") {
		const mode = tail[0] ? COLOR_MODE_MAP[tail[0].toLowerCase()] : undefined;
		if (!mode) {
			return {
				kind: "unknown",
				reason: "/cli color 需要 on / off / auto",
			};
		}
		return { kind: "color", mode };
	}

	if (head === "speed") {
		const mode = tail[0] ? SPEED_MODE_MAP[tail[0].toLowerCase()] : undefined;
		if (!mode) {
			return {
				kind: "unknown",
				reason: "/cli speed 需要 fast / normal / slow",
			};
		}
		return { kind: "speed", mode };
	}

	if (head === "history" || head === "hist") return { kind: "history" };

	if (head === "recall") {
		const idx = tail[0] ? Number(tail[0]) : NaN;
		if (!Number.isFinite(idx) || idx < 1) {
			return {
				kind: "unknown",
				reason: "/cli recall 需要历史编号（≥1，可用 /cli history 查看）",
			};
		}
		return { kind: "recall", index: Math.floor(idx) };
	}

	// /cli !3 这种简写
	if (head.startsWith("!")) {
		const idx = Number(head.slice(1));
		if (!Number.isFinite(idx) || idx < 1) {
			return { kind: "unknown", reason: "/cli ! 后需要编号（如 /cli !3）" };
		}
		return { kind: "recall", index: Math.floor(idx) };
	}

	if (head === "get" || head === "download" || head === "dl") {
		const path = tail.join(" ").trim();
		if (!path) {
			return { kind: "unknown", reason: "/cli get 需要文件相对路径" };
		}
		return { kind: "get", path };
	}

	if (head === "more" || head === "next") return { kind: "more" };

	if (head === "confirm" || head === "ok" || head === "yes-confirm") {
		return { kind: "confirm" };
	}
	if (head === "cancel" || head === "abort") return { kind: "cancel" };

	const directKey = normalizeKeyAlias(head);
	if (directKey) return { kind: "key", key: directKey };

	return { kind: "unknown", reason: `未知子命令：${head}` };
}

export function getCliHelpText(): string {
	return [
		"远程终端 (`/cli`) 帮助：",
		"  会话控制：",
		"    /cli start <preset|cmd> [--cwd <path>]  启动",
		"    /cli stop                                停止",
		"    /cli status / list                        状态 / 列表",
		"  按键：",
		"    /cli ctrl-c | tab | esc | enter | up/down/left/right",
		"    /cli key <name>                          通用按键",
		"  屏幕：",
		"    /cli up [N] | down [N]                   滚动 N 行（默认 5）",
		"    /cli top | bottom                         跳极端",
		"    /cli page-up | page-down                  翻页",
		"    /cli resize 80x30                         改尺寸",
		"    /cli color on|off|auto                    切颜色",
		"    /cli speed fast|normal|slow               改快照频率",
		"  历史与文件：",
		"    /cli history                              列出最近输入",
		"    /cli !N  或  /cli recall N                重发第 N 条",
		"    /cli get <相对路径>                       下载文件回 IM",
		"    /cli more                                 翻折叠下一页",
		"    /cli confirm | cancel                     确认/取消危险命令",
		"快捷形式（无需 /cli 前缀，仅在有活跃会话时生效）：",
		"  /k <name>            等价 /cli key",
		"  /⏎ /⎋ /↑ /↓ /← /→ /⇥ /⌫    单字符按键",
		"  /i <text>             注入文本作为 stdin（自动加换行）",
		"  /up /down /top /bottom /pgup /pgdn   滚屏",
		"  /more /history /confirm /cancel       同名子命令",
		"  /!N                   重发历史第 N 条",
		"  /get <path>           下载文件",
		"启动后，未带 / 前缀的普通消息会作为 stdin 注入（自动追加换行）。",
	].join("\n");
}

/**
 * 终端短指令前缀正则。
 *
 * 命中以下任意一种：
 *   /k <key>          —— 通用按键短形式
 *   /<single-emoji>   —— 单字符快捷（⏎ ⎋ ↑ ↓ ← → ⇥ ⌫）
 *   /i <text>         —— 注入 stdin（自动换行）
 *   /up /down /top /bottom /pgup /pgdn —— 滚屏
 *   /!N                —— 重发历史
 *   /history /more /confirm /cancel —— 同名子命令
 *   /get <path>        —— 下载文件
 *
 * 当前不支持的写法返回 null（由调用方继续向后探测）。
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

	// 滚屏短指令
	const lower = trimmed.toLowerCase();
	const scrollMatch = lower.match(
		/^\/(up|down|top|bottom|pgup|pgdn|page-up|page-down)(?:\s+(\d+))?$/,
	);
	if (scrollMatch) {
		const dir = SCROLL_HEAD_MAP[scrollMatch[1]] ?? null;
		if (dir) {
			const amount = scrollMatch[2] ? Number(scrollMatch[2]) : undefined;
			if (
				amount !== undefined &&
				(!Number.isFinite(amount) || amount < 1 || amount > 1000)
			) {
				return { kind: "unknown", reason: "滚屏行数应在 1-1000 之间" };
			}
			return { kind: "scroll", dir, amount };
		}
	}

	// /!N
	const recallMatch = trimmed.match(/^\/!(\d+)$/);
	if (recallMatch) {
		const idx = Number(recallMatch[1]);
		if (!Number.isFinite(idx) || idx < 1) {
			return { kind: "unknown", reason: "/!N 中 N 为历史编号（≥1）" };
		}
		return { kind: "recall", index: Math.floor(idx) };
	}

	// 同名子命令短形式
	if (lower === "/history" || lower === "/hist") return { kind: "history" };
	if (lower === "/more") return { kind: "more" };
	if (lower === "/confirm") return { kind: "confirm" };
	if (lower === "/cancel") return { kind: "cancel" };

	// /get <path>
	const getMatch = trimmed.match(/^\/get(?:\s+([\s\S]+))?$/i);
	if (getMatch) {
		const path = (getMatch[1] || "").trim();
		if (!path) return { kind: "unknown", reason: "/get 需要文件路径" };
		return { kind: "get", path };
	}

	// /resize 80x30
	const resizeMatch = trimmed.match(/^\/resize\s+(\S+)$/i);
	if (resizeMatch) {
		const parsed = parseResizeArg(resizeMatch[1]);
		if (!parsed)
			return { kind: "unknown", reason: "/resize 需要 <cols>x<rows>" };
		return { kind: "resize", cols: parsed.cols, rows: parsed.rows };
	}

	return null;
}
