/**
 * Design 模块前端 Store
 *
 * 状态机：
 *   empty → discovery → direction-pick → running → preview
 *
 * 不持久化到 localStorage —— 会话列表由后端 design_list_sessions 直接拉。
 * 当前会话也只在内存里，刷新 / 重启会重新从 design_get_session 加载。
 */

import type {
	DesignDirection,
	DesignSession,
	DiscoveryAnswers,
	DiscoveryFormSchema,
	OutputAsset,
} from "../../../electron/shared/types";
import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";

export type DesignWorkspaceStage =
	| "empty"
	| "discovery"
	| "direction-pick"
	| "running"
	| "preview";

export interface DesignDraftAnswers {
	answers: DiscoveryAnswers;
	direction_id?: string;
	system_id?: string;
	mode?: string;
}

export interface DesignWorkspaceState {
	stage: DesignWorkspaceStage;
	currentSessionId: string | null;
	currentSession:
		| (DesignSession & { output_asset?: OutputAsset; files?: string[] })
		| null;
	directions: DesignDirection[];
	discoveryForm: DiscoveryFormSchema | null;
	draftAnswers: DesignDraftAnswers;
	sessionsList: DesignSession[];
	isStarting: boolean;
	isExporting: boolean;
	lastError: string | null;
}

const INITIAL: DesignWorkspaceState = {
	stage: "empty",
	currentSessionId: null,
	currentSession: null,
	directions: [],
	discoveryForm: null,
	draftAnswers: { answers: {} },
	sessionsList: [],
	isStarting: false,
	isExporting: false,
	lastError: null,
};

const store = createStore<DesignWorkspaceState>(INITIAL);

function setStage(stage: DesignWorkspaceStage) {
	store.setState((s) => ({ ...s, stage }));
}

function setDirections(directions: DesignDirection[]) {
	store.setState((s) => ({ ...s, directions }));
}

function setDiscoveryForm(form: DiscoveryFormSchema | null) {
	store.setState((s) => ({ ...s, discoveryForm: form }));
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

function patchDraftAnswers(patch: Partial<DesignDraftAnswers>) {
	store.setState((s) => ({
		...s,
		draftAnswers: { ...s.draftAnswers, ...patch },
	}));
}

function setAnswerField(field: string, value: string | string[] | undefined) {
	store.setState((s) => ({
		...s,
		draftAnswers: {
			...s.draftAnswers,
			answers: { ...s.draftAnswers.answers, [field]: value },
		},
	}));
}

function resetDraft() {
	store.setState((s) => ({ ...s, draftAnswers: { answers: {} } }));
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

function reset() {
	store.setState(() => ({ ...INITIAL }));
}

export const designStore = {
	...store,
	setStage,
	setDirections,
	setDiscoveryForm,
	setSessionsList,
	setCurrentSessionId,
	setCurrentSession,
	patchDraftAnswers,
	setAnswerField,
	resetDraft,
	setStarting,
	setExporting,
	setError,
	reset,
};

export const useDesignStore = createUseStore(store);
export const useDesignStoreSelector = createUseStoreSelector(store);
