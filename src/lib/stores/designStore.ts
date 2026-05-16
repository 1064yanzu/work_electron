/**
 * Design 模块前端 Store
 *
 * 状态机：empty → running → preview
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

export type DesignWorkspaceStage = "empty" | "running" | "preview";

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
	setNewProjectSeed,
	clearNewProjectSeed,
	reset,
};

export const useDesignStore = createUseStore(store);
export const useDesignStoreSelector = createUseStoreSelector(store);
