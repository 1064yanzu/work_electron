// 快捷键注册中心 — 按键序列化 / 匹配 / 平台化展示

import { isMac } from "../platform";

export interface ParsedKeys {
	/** ⌘(mac，兼容 Ctrl) / Ctrl(其他平台)。与历史行为一致：mac 上 Ctrl 也命中 mod */
	mod: boolean;
	/** 明确要求 Ctrl（跨平台一致，如终端场景），与 mod 互斥 */
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	/** 归一化小写主键，如 "k"、"`"、"."、"arrowup" */
	key: string;
}

/** 解析 "mod+shift+k" 形式的按键串；无主键时返回 null */
export function parseKeys(keys: string): ParsedKeys | null {
	const parts = keys
		.split("+")
		.map((p) => p.trim().toLowerCase())
		.filter(Boolean);
	const parsed: ParsedKeys = {
		mod: false,
		ctrl: false,
		alt: false,
		shift: false,
		key: "",
	};
	for (const part of parts) {
		if (part === "mod" || part === "cmd" || part === "meta") parsed.mod = true;
		else if (part === "ctrl" || part === "control") parsed.ctrl = true;
		else if (part === "alt" || part === "option") parsed.alt = true;
		else if (part === "shift") parsed.shift = true;
		else parsed.key = part;
	}
	if (!parsed.key) return null;
	return parsed;
}

/** 规范化按键串，供冲突判定："cmd+K" → "mod+k" */
export function normalizeKeys(keys: string): string | null {
	const p = parseKeys(keys);
	if (!p) return null;
	const parts: string[] = [];
	if (p.mod) parts.push("mod");
	if (p.ctrl) parts.push("ctrl");
	if (p.alt) parts.push("alt");
	if (p.shift) parts.push("shift");
	parts.push(p.key);
	return parts.join("+");
}

/**
 * 从 e.code 还原布局无关主键。
 * mac 上 Option+数字/字母 的 e.key 是合成字符（如 ⌥1 → "¡"），
 * 必须用 e.code 兜底，否则 Alt 系快捷键在 mac 上永远匹配不上。
 */
const CODE_TO_KEY: Record<string, string> = {
	Backquote: "`",
	Period: ".",
	Comma: ",",
	Slash: "/",
	Minus: "-",
	Equal: "=",
	BracketLeft: "[",
	BracketRight: "]",
	Semicolon: ";",
	Quote: "'",
	Backslash: "\\",
};

function keyFromCode(code: string): string | null {
	if (code.startsWith("Digit")) return code.slice(5);
	if (code.startsWith("Key")) return code.slice(3).toLowerCase();
	return CODE_TO_KEY[code] ?? null;
}

/** 事件是否精确命中按键定义（修饰键需完全一致，避免 mod+shift+k 误触 mod+k） */
export function eventMatchesKeys(e: KeyboardEvent, p: ParsedKeys): boolean {
	const modActive = e.metaKey || e.ctrlKey;
	if (p.mod) {
		if (!modActive) return false;
	} else if (p.ctrl) {
		if (!e.ctrlKey || e.metaKey) return false;
	} else if (modActive) {
		return false;
	}
	if (p.alt !== e.altKey) return false;
	if (p.shift !== e.shiftKey) return false;

	if (e.key.toLowerCase() === p.key) return true;
	const fromCode = keyFromCode(e.code);
	return fromCode !== null && fromCode === p.key;
}

const DISPLAY_KEY: Record<string, string> = {
	escape: "Esc",
	enter: "Enter",
	tab: "Tab",
	" ": "Space",
	space: "Space",
	arrowup: "↑",
	arrowdown: "↓",
	arrowleft: "←",
	arrowright: "→",
	backspace: "⌫",
};

function displayKey(key: string): string {
	const mapped = DISPLAY_KEY[key];
	if (mapped) return mapped;
	if (key.length === 1) return key.toUpperCase();
	return key.charAt(0).toUpperCase() + key.slice(1);
}

/** 平台化 kbd 序列："mod+l" → ["⌘","L"]（mac）/ ["Ctrl","L"]（其他） */
export function formatKeys(keys: string): string[] {
	const p = parseKeys(keys);
	if (!p) return [keys];
	const parts: string[] = [];
	if (p.mod) parts.push(isMac ? "⌘" : "Ctrl");
	if (p.ctrl) parts.push("Ctrl");
	if (p.alt) parts.push(isMac ? "⌥" : "Alt");
	if (p.shift) parts.push(isMac ? "⇧" : "Shift");
	parts.push(displayKey(p.key));
	return parts;
}
