import { getConfig, setConfig } from "./core";

export type TerminalDefaultCwdMode = "thread" | "home";

export interface TerminalPrefs {
	defaultCwdMode: TerminalDefaultCwdMode;
	shellPath: string;
	openOnLaunch: boolean;
}

export const DEFAULT_TERMINAL_PREFS: TerminalPrefs = {
	defaultCwdMode: "thread",
	shellPath: "",
	openOnLaunch: false,
};

const TERMINAL_CONFIG_KEYS = {
	defaultCwdMode: "terminal.defaultCwdMode",
	shellPath: "terminal.shellPath",
	openOnLaunch: "terminal.openOnLaunch",
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

export async function getTerminalPrefs(): Promise<TerminalPrefs> {
	const [defaultCwdMode, shellPath, openOnLaunch] = await Promise.all([
		getConfig(TERMINAL_CONFIG_KEYS.defaultCwdMode),
		getConfig(TERMINAL_CONFIG_KEYS.shellPath),
		getConfig(TERMINAL_CONFIG_KEYS.openOnLaunch),
	]);

	return {
		defaultCwdMode: normalizeDefaultCwdMode(defaultCwdMode),
		shellPath: typeof shellPath === "string" ? shellPath.trim() : "",
		openOnLaunch: normalizeBoolean(
			openOnLaunch,
			DEFAULT_TERMINAL_PREFS.openOnLaunch,
		),
	};
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
	await Promise.all(writes);
	return getTerminalPrefs();
}
