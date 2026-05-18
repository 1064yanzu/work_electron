/**
 * Design 模块前端 Store
 *
 * 状态机：empty → draft → running → preview
 *
 * - draft：表单已提交、launch payload 备好，但还没启动 SDK；
 *   用户需要在右侧 Copilot 草稿里确认/编辑简介并按发送 / 中栏「开始生成」
 *   才会真正把 draftLaunch 转成 pendingLaunch 启动 Agent。
 *
 * 不持久化到 localStorage —— 会话列表由后端 design_list_sessions 直接拉。
 * 当前会话也只在内存里，刷新 / 重启会重新从 design_get_session 加载。
 */

import type {
	DesignDirection,
	DesignLaunchPayload,
	DesignProjectKind,
	DesignSession,
	OutputAsset,
} from "../../../electron/shared/types";
import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";

export type DesignWorkspaceStage = "empty" | "draft" | "running" | "preview";

/**
 * 二级入口（SystemsLibrary / BuiltinSkills / BrandExtract）点了卡片后，
 * 不直接 startSession，而是把"预填给 NewProjectPanel 用"的信号塞进这里；
 * NewProjectPanel 启动时一次性消费并清掉。
 *
 * 当 `sessionId` 不为空时表示该 session 已经被二级入口提前创建（典型场景：
 * BrandExtractTab 抓 brand-spec 必须先有工作目录），NewProjectPanel 提交时
 * 应当**接管**它而不是再 startSession。
 */
export interface DesignNewProjectSeed {
	kind?: DesignProjectKind;
	systemId?: string;
	mode?: string;
	sessionId?: string;
	workDir?: string;
	titleHint?: string;
}

export interface DesignWorkspaceState {
	stage: DesignWorkspaceStage;
	currentSessionId: string | null;
	currentSession:
		| (DesignSession & { output_asset?: OutputAsset; files?: string[] })
		| null;
	directions: DesignDirection[];
	sessionsList: DesignSession[];
	isStarting: boolean;
	isExporting: boolean;
	lastError: string | null;
	/** 表单已 submitDiscovery 但等待用户在 Copilot 里确认发送 / 或中栏「开始生成」 */
	draftLaunch: {
		sessionId: string;
		payload: DesignLaunchPayload;
		/** 用户在 NewProjectPanel 初始填写的简介（注入 Copilot 草稿用） */
		initialPrompt: string;
	} | null;
	/** 提交后等待 DesignWorkspace 消费并启动 SDK 的 payload。 */
	pendingLaunch: { sessionId: string; payload: DesignLaunchPayload } | null;
	/** 二级入口预填 NewProjectPanel 的种子。NewProjectPanel 消费后会清掉。 */
	newProjectSeed: DesignNewProjectSeed | null;
}

const INITIAL: DesignWorkspaceState = {
	stage: "empty",
	currentSessionId: null,
	currentSession: null,
	directions: [],
	sessionsList: [],
	isStarting: false,
	isExporting: false,
	lastError: null,
	draftLaunch: null,
	pendingLaunch: null,
	newProjectSeed: null,
};

const store = createStore<DesignWorkspaceState>(INITIAL);

function setStage(stage: DesignWorkspaceStage) {
	store.setState((s) => ({ ...s, stage }));
}

function setDirections(directions: DesignDirection[]) {
	store.setState((s) => ({ ...s, directions }));
}

function setSessionsList(sessions: DesignSession[]) {
	store.setState((s) => ({ ...s, sessionsList: sessions }));
}

function setCurrentSessionId(id: string | null) {
	store.setState((s) => ({ ...s, currentSessionId: id }));
}

function setCurrentSession(
	session:
		| (DesignSession & { output_asset?: OutputAsset; files?: string[] })
		| null,
) {
	store.setState((s) => ({
		...s,
		currentSession: session,
		currentSessionId: session?.id ?? s.currentSessionId,
	}));
}

function setStarting(v: boolean) {
	store.setState((s) => ({ ...s, isStarting: v }));
}

function setExporting(v: boolean) {
	store.setState((s) => ({ ...s, isExporting: v }));
}

function setError(msg: string | null) {
	store.setState((s) => ({ ...s, lastError: msg }));
}

function setPendingLaunch(
	payload: { sessionId: string; payload: DesignLaunchPayload } | null,
) {
	store.setState((s) => ({ ...s, pendingLaunch: payload }));
}

function clearPendingLaunch() {
	store.setState((s) => ({ ...s, pendingLaunch: null }));
}

function setDraftLaunch(
	draft: {
		sessionId: string;
		payload: DesignLaunchPayload;
		initialPrompt: string;
	} | null,
) {
	store.setState((s) => ({ ...s, draftLaunch: draft }));
}

function clearDraftLaunch() {
	store.setState((s) => ({ ...s, draftLaunch: null }));
}

/**
 * 把 draftLaunch 转成 pendingLaunch，可选地用 finalPrompt 覆盖原 prompt。
 * 用于：
 *   - Copilot 发送拦截：用 user 输入覆盖 prompt
 *   - 中栏「立即开始」按钮：直接用 initialPrompt
 * 调用后 stage 不在这里切，由调用方负责。
 */
function consumeDraftLaunch(finalPrompt?: string): {
	sessionId: string;
	payload: DesignLaunchPayload;
} | null {
	const draft = store.getState().draftLaunch;
	if (!draft) return null;
	const trimmed = (finalPrompt ?? "").trim();
	const payload: DesignLaunchPayload = trimmed
		? { ...draft.payload, prompt: trimmed }
		: draft.payload;
	store.setState((s) => ({
		...s,
		draftLaunch: null,
		pendingLaunch: { sessionId: draft.sessionId, payload },
	}));
	return { sessionId: draft.sessionId, payload };
}

function setNewProjectSeed(seed: DesignNewProjectSeed | null) {
	store.setState((s) => ({ ...s, newProjectSeed: seed }));
}

function clearNewProjectSeed() {
	store.setState((s) => ({ ...s, newProjectSeed: null }));
}

function reset() {
	store.setState(() => ({ ...INITIAL }));
}

export const designStore = {
	...store,
	setStage,
	setDirections,
	setSessionsList,
	setCurrentSessionId,
	setCurrentSession,
	setStarting,
	setExporting,
	setError,
	setPendingLaunch,
	clearPendingLaunch,
	setDraftLaunch,
	clearDraftLaunch,
	consumeDraftLaunch,
	setNewProjectSeed,
	clearNewProjectSeed,
	reset,
};

export const useDesignStore = createUseStore(store);
export const useDesignStoreSelector = createUseStoreSelector(store);
