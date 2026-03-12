import type {
	CodingApprovalMode,
	CodingBackendId,
} from "../../../electron/shared/coding-workspace";
import { getConfig, setConfig } from "../config";

const CONFIG_KEYS = {
	defaultBackend: "aiCoding.defaultBackend",
	workspaceMemoryPolicy: "aiCoding.workspaceMemoryPolicy",
	claudeDefaultModel: "aiCoding.claude.defaultModel",
	claudeDefaultApprovalMode: "aiCoding.claude.defaultApprovalMode",
	codexDefaultModel: "aiCoding.codex.defaultModel",
	codexDefaultApprovalMode: "aiCoding.codex.defaultApprovalMode",
	codexModelCatalog: "aiCoding.codex.modelCatalog",
	// 编辑器/工作区设置
	editorFontSize: "aiCoding.editor.fontSize",
	editorShowMinimap: "aiCoding.editor.showMinimap",
	fileTreeAutoRefreshMs: "aiCoding.fileTree.autoRefreshMs",
	terminalDefaultShell: "aiCoding.terminal.defaultShell",
	// 高亮 / 文件监听 / Diff 策略
	highlightTheme: "aiCoding.editor.highlightTheme",
	fileWatcherEnabled: "aiCoding.fileWatcher.enabled",
	autoAcceptDiffs: "aiCoding.diff.autoAccept",
} as const;

export interface AICodingSettings {
	defaultBackend: CodingBackendId;
	workspaceMemoryPolicy: "manual" | "always";
	claudeDefaultModel: string;
	claudeDefaultApprovalMode: CodingApprovalMode;
	codexDefaultModel: string;
	codexDefaultApprovalMode: CodingApprovalMode;
	codexModelCatalog: string[];
	// 编辑器/工作区设置
	editorFontSize: number;
	editorShowMinimap: boolean;
	fileTreeAutoRefreshMs: number;
	terminalDefaultShell: string;
	// 高亮 / 文件监听 / Diff 策略
	highlightTheme: string;
	fileWatcherEnabled: boolean;
	autoAcceptDiffs: boolean;
}

export const DEFAULT_AI_CODING_SETTINGS: AICodingSettings = {
	defaultBackend: "claude-code",
	workspaceMemoryPolicy: "always",
	claudeDefaultModel: "claude-sonnet-4-6",
	claudeDefaultApprovalMode: "acceptEdits",
	codexDefaultModel: "gpt-5-codex",
	codexDefaultApprovalMode: "on-request",
	codexModelCatalog: ["gpt-5-codex", "gpt-5", "o4-mini"],
	editorFontSize: 13,
	editorShowMinimap: true,
	fileTreeAutoRefreshMs: 500,
	terminalDefaultShell: "",
	highlightTheme: "github-dark",
	fileWatcherEnabled: true,
	autoAcceptDiffs: false,
};

function parseStringArray(value: unknown): string[] | null {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
	}
	if (typeof value === "string" && value.trim()) {
		try {
			const parsed = JSON.parse(value);
			return parseStringArray(parsed);
		} catch {
			return value
				.split(/\r?\n|,/)
				.map((item) => item.trim())
				.filter(Boolean);
		}
	}
	return null;
}

export async function getAICodingSettings(): Promise<AICodingSettings> {
	const [
		defaultBackend,
		workspaceMemoryPolicy,
		claudeDefaultModel,
		claudeDefaultApprovalMode,
		codexDefaultModel,
		codexDefaultApprovalMode,
		codexModelCatalog,
		editorFontSize,
		editorShowMinimap,
		fileTreeAutoRefreshMs,
		terminalDefaultShell,
		highlightTheme,
		fileWatcherEnabled,
		autoAcceptDiffs,
	] = await Promise.all([
		getConfig(CONFIG_KEYS.defaultBackend),
		getConfig(CONFIG_KEYS.workspaceMemoryPolicy),
		getConfig(CONFIG_KEYS.claudeDefaultModel),
		getConfig(CONFIG_KEYS.claudeDefaultApprovalMode),
		getConfig(CONFIG_KEYS.codexDefaultModel),
		getConfig(CONFIG_KEYS.codexDefaultApprovalMode),
		getConfig(CONFIG_KEYS.codexModelCatalog),
		getConfig(CONFIG_KEYS.editorFontSize),
		getConfig(CONFIG_KEYS.editorShowMinimap),
		getConfig(CONFIG_KEYS.fileTreeAutoRefreshMs),
		getConfig(CONFIG_KEYS.terminalDefaultShell),
		getConfig(CONFIG_KEYS.highlightTheme),
		getConfig(CONFIG_KEYS.fileWatcherEnabled),
		getConfig(CONFIG_KEYS.autoAcceptDiffs),
	]);

	return {
		defaultBackend:
			defaultBackend === "codex" || defaultBackend === "claude-code"
				? defaultBackend
				: DEFAULT_AI_CODING_SETTINGS.defaultBackend,
		workspaceMemoryPolicy:
			workspaceMemoryPolicy === "manual" || workspaceMemoryPolicy === "always"
				? workspaceMemoryPolicy
				: DEFAULT_AI_CODING_SETTINGS.workspaceMemoryPolicy,
		claudeDefaultModel:
			typeof claudeDefaultModel === "string" && claudeDefaultModel.trim()
				? claudeDefaultModel.trim()
				: DEFAULT_AI_CODING_SETTINGS.claudeDefaultModel,
		claudeDefaultApprovalMode:
			typeof claudeDefaultApprovalMode === "string" && claudeDefaultApprovalMode.trim()
				? (claudeDefaultApprovalMode as CodingApprovalMode)
				: DEFAULT_AI_CODING_SETTINGS.claudeDefaultApprovalMode,
		codexDefaultModel:
			typeof codexDefaultModel === "string" && codexDefaultModel.trim()
				? codexDefaultModel.trim()
				: DEFAULT_AI_CODING_SETTINGS.codexDefaultModel,
		codexDefaultApprovalMode:
			typeof codexDefaultApprovalMode === "string" && codexDefaultApprovalMode.trim()
				? (codexDefaultApprovalMode as CodingApprovalMode)
				: DEFAULT_AI_CODING_SETTINGS.codexDefaultApprovalMode,
		codexModelCatalog:
			parseStringArray(codexModelCatalog) ?? DEFAULT_AI_CODING_SETTINGS.codexModelCatalog,
		editorFontSize:
			typeof editorFontSize === "number" && editorFontSize >= 8 && editorFontSize <= 32
				? editorFontSize
				: DEFAULT_AI_CODING_SETTINGS.editorFontSize,
		editorShowMinimap:
			typeof editorShowMinimap === "boolean"
				? editorShowMinimap
				: DEFAULT_AI_CODING_SETTINGS.editorShowMinimap,
		fileTreeAutoRefreshMs:
			typeof fileTreeAutoRefreshMs === "number" && fileTreeAutoRefreshMs >= 100 && fileTreeAutoRefreshMs <= 10000
				? fileTreeAutoRefreshMs
				: DEFAULT_AI_CODING_SETTINGS.fileTreeAutoRefreshMs,
		terminalDefaultShell:
			typeof terminalDefaultShell === "string"
				? terminalDefaultShell
				: DEFAULT_AI_CODING_SETTINGS.terminalDefaultShell,
		highlightTheme:
			typeof highlightTheme === "string" && highlightTheme.trim()
				? highlightTheme.trim()
				: DEFAULT_AI_CODING_SETTINGS.highlightTheme,
		fileWatcherEnabled:
			typeof fileWatcherEnabled === "boolean"
				? fileWatcherEnabled
				: DEFAULT_AI_CODING_SETTINGS.fileWatcherEnabled,
		autoAcceptDiffs:
			typeof autoAcceptDiffs === "boolean"
				? autoAcceptDiffs
				: DEFAULT_AI_CODING_SETTINGS.autoAcceptDiffs,
	};
}

export async function setAICodingSettings(
	updates: Partial<AICodingSettings>,
): Promise<void> {
	const tasks: Promise<void>[] = [];
	if (updates.defaultBackend) {
		tasks.push(setConfig(CONFIG_KEYS.defaultBackend, updates.defaultBackend));
	}
	if (updates.workspaceMemoryPolicy) {
		tasks.push(setConfig(CONFIG_KEYS.workspaceMemoryPolicy, updates.workspaceMemoryPolicy));
	}
	if (updates.claudeDefaultModel) {
		tasks.push(setConfig(CONFIG_KEYS.claudeDefaultModel, updates.claudeDefaultModel));
	}
	if (updates.claudeDefaultApprovalMode) {
		tasks.push(setConfig(CONFIG_KEYS.claudeDefaultApprovalMode, updates.claudeDefaultApprovalMode));
	}
	if (updates.codexDefaultModel) {
		tasks.push(setConfig(CONFIG_KEYS.codexDefaultModel, updates.codexDefaultModel));
	}
	if (updates.codexDefaultApprovalMode) {
		tasks.push(setConfig(CONFIG_KEYS.codexDefaultApprovalMode, updates.codexDefaultApprovalMode));
	}
	if (updates.codexModelCatalog) {
		tasks.push(setConfig(CONFIG_KEYS.codexModelCatalog, JSON.stringify(updates.codexModelCatalog)));
	}
	if (updates.editorFontSize != null) {
		tasks.push(setConfig(CONFIG_KEYS.editorFontSize, updates.editorFontSize));
	}
	if (updates.editorShowMinimap != null) {
		tasks.push(setConfig(CONFIG_KEYS.editorShowMinimap, updates.editorShowMinimap));
	}
	if (updates.fileTreeAutoRefreshMs != null) {
		tasks.push(setConfig(CONFIG_KEYS.fileTreeAutoRefreshMs, updates.fileTreeAutoRefreshMs));
	}
	if (updates.terminalDefaultShell != null) {
		tasks.push(setConfig(CONFIG_KEYS.terminalDefaultShell, updates.terminalDefaultShell));
	}
	if (updates.highlightTheme != null) {
		tasks.push(setConfig(CONFIG_KEYS.highlightTheme, updates.highlightTheme));
	}
	if (updates.fileWatcherEnabled != null) {
		tasks.push(setConfig(CONFIG_KEYS.fileWatcherEnabled, updates.fileWatcherEnabled));
	}
	if (updates.autoAcceptDiffs != null) {
		tasks.push(setConfig(CONFIG_KEYS.autoAcceptDiffs, updates.autoAcceptDiffs));
	}
	await Promise.all(tasks);
}
