import { getConfig, setConfig } from "./core";

export type TerminalDefaultCwdMode = "thread" | "home";

export interface TerminalPrefs {
	defaultCwdMode: TerminalDefaultCwdMode;
	shellPath: string;
	openOnLaunch: boolean;
	/**
	 * xterm scrollback 缓冲行数。仅影响「新建」的终端实例——已存在的终端
	 * 需要重建 xterm 实例才能应用新的 scrollback（xterm 限制），因此本设置
	 * 在 UI 上标注为「下次新开终端生效」。
	 */
	scrollbackLines: number;
}

export const DEFAULT_TERMINAL_PREFS: TerminalPrefs = {
	defaultCwdMode: "thread",
	shellPath: "",
	openOnLaunch: false,
	scrollbackLines: 5000,
};

/** 终端 scrollback 行数可选档位（用于设置面板下拉选择） */
export const TERMINAL_SCROLLBACK_OPTIONS = [1000, 5000, 10000, 50000] as const;

const TERMINAL_CONFIG_KEYS = {
	defaultCwdMode: "terminal.defaultCwdMode",
	shellPath: "terminal.shellPath",
	openOnLaunch: "terminal.openOnLaunch",
	scrollbackLines: "terminal.scrollback_lines",
} as const;

function normalizeDefaultCwdMode(value: unknown): TerminalDefaultCwdMode {
	return value === "home" ? "home" : DEFAULT_TERMINAL_PREFS.defaultCwdMode;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (typeof value !== "string") return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true" || normalized === "1") return true;
	if (normalized === "false" || normalized === "0") return false;
	return fallback;
}

function normalizeScrollbackLines(value: unknown): number {
	const num = typeof value === "string" ? Number(value) : value;
	if (typeof num !== "number" || !Number.isFinite(num) || num <= 0) {
		return DEFAULT_TERMINAL_PREFS.scrollbackLines;
	}
	// 允许自定义值，但限制在合理区间内，避免误配置导致内存占用过大。
	return Math.max(500, Math.min(200_000, Math.floor(num)));
}

export async function getTerminalPrefs(): Promise<TerminalPrefs> {
	const [defaultCwdMode, shellPath, openOnLaunch, scrollbackLines] =
		await Promise.all([
			getConfig(TERMINAL_CONFIG_KEYS.defaultCwdMode),
			getConfig(TERMINAL_CONFIG_KEYS.shellPath),
			getConfig(TERMINAL_CONFIG_KEYS.openOnLaunch),
			getConfig(TERMINAL_CONFIG_KEYS.scrollbackLines),
		]);

	return {
		defaultCwdMode: normalizeDefaultCwdMode(defaultCwdMode),
		shellPath: typeof shellPath === "string" ? shellPath.trim() : "",
		openOnLaunch: normalizeBoolean(
			openOnLaunch,
			DEFAULT_TERMINAL_PREFS.openOnLaunch,
		),
		scrollbackLines: normalizeScrollbackLines(scrollbackLines),
	};
}

/** 仅读取 scrollback 行数（新建终端实例时使用，避免调用方额外拉取其他无关字段） */
export async function getTerminalScrollbackLines(): Promise<number> {
	const raw = await getConfig(TERMINAL_CONFIG_KEYS.scrollbackLines);
	return normalizeScrollbackLines(raw);
}

export async function setTerminalPrefs(
	updates: Partial<TerminalPrefs>,
): Promise<TerminalPrefs> {
	const writes: Array<Promise<void>> = [];
	if (updates.defaultCwdMode !== undefined) {
		writes.push(
			setConfig(
				TERMINAL_CONFIG_KEYS.defaultCwdMode,
				normalizeDefaultCwdMode(updates.defaultCwdMode),
			),
		);
	}
	if (updates.shellPath !== undefined) {
		writes.push(setConfig(TERMINAL_CONFIG_KEYS.shellPath, updates.shellPath));
	}
	if (updates.openOnLaunch !== undefined) {
		writes.push(
			setConfig(
				TERMINAL_CONFIG_KEYS.openOnLaunch,
				String(Boolean(updates.openOnLaunch)),
			),
		);
	}
	if (updates.scrollbackLines !== undefined) {
		writes.push(
			setConfig(
				TERMINAL_CONFIG_KEYS.scrollbackLines,
				normalizeScrollbackLines(updates.scrollbackLines),
			),
		);
	}
	await Promise.all(writes);
	return getTerminalPrefs();
}
