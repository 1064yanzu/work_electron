/**
 * Skills Marketplace Store
 *
 * 管理：
 *   - 搜索结果（按 query 缓存）
 *   - 安装进度（按 entryId）
 *   - 更新角标计数
 *   - 配置（sources / mirrors / autoCheck）
 *
 * 与 skillsStore 解耦：安装完成后调用 skillsStore.refresh() 让本地列表也更新。
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import {
	marketplaceCheckUpdates,
	marketplaceInstall,
	marketplaceListSources,
	marketplacePreview,
	marketplaceSearch,
	marketplaceSetSources,
	marketplaceTestMirror,
	marketplaceUninstall,
	type MarketplaceEntry,
	type MarketplaceListSourcesResult,
	type MarketplaceMirror,
	type MarketplaceMirrorTestResult,
	type MarketplaceSourceConfig,
	type MarketplaceUpdateItem,
} from "./config";
import { skillsStore } from "./skillsStore";
import { listen } from "./tauriEventCompat";

export interface InstallProgressState {
	entryId: string;
	phase:
		| "queued"
		| "resolving"
		| "downloading"
		| "extracting"
		| "verifying"
		| "writing"
		| "done"
		| "error";
	percent: number;
	message?: string;
	error?: string;
	startedAt: number;
}

interface State {
	loaded: boolean;
	loading: boolean;
	entries: MarketplaceEntry[];
	errors: Array<{ sourceId: string; error: string }>;
	progress: Record<string, InstallProgressState>;
	updates: MarketplaceUpdateItem[];
	config: MarketplaceListSourcesResult | null;
	lastQuery: string;
	lastSourceId?: string;
}

let state: State = {
	loaded: false,
	loading: false,
	entries: [],
	errors: [],
	progress: {},
	updates: [],
	config: null,
	lastQuery: "",
};

const listeners = new Set<() => void>();
function emit() {
	listeners.forEach((l) => l());
}
function setState(patch: Partial<State>) {
	state = { ...state, ...patch };
	emit();
}

let progressUnlisten: (() => void) | null = null;
let updateUnlisten: (() => void) | null = null;

async function ensureEventBindings() {
	if (!progressUnlisten) {
		try {
			progressUnlisten = await listen<{
				entryId: string;
				phase: InstallProgressState["phase"];
				percent: number;
				message?: string;
				error?: string;
			}>("skill-install-progress", (e) => {
				const p = e.payload;
				if (!p?.entryId) return;
				const prev = state.progress[p.entryId];
				const next: InstallProgressState = {
					entryId: p.entryId,
					phase: p.phase,
					percent: typeof p.percent === "number" ? p.percent : 0,
					message: p.message,
					error: p.error,
					startedAt: prev?.startedAt ?? Date.now(),
				};
				setState({ progress: { ...state.progress, [p.entryId]: next } });
			});
		} catch {
			progressUnlisten = null;
		}
	}
	if (!updateUnlisten) {
		try {
			updateUnlisten = await listen<{ updates: MarketplaceUpdateItem[] }>(
				"skill-update-available",
				(e) => {
					setState({ updates: e.payload?.updates ?? [] });
				},
			);
		} catch {
			updateUnlisten = null;
		}
	}
}

export const skillsMarketplaceStore = {
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
	getState: () => state,

	async loadConfig() {
		try {
			const cfg = await marketplaceListSources();
			setState({ config: cfg });
		} catch (err) {
			console.error("[marketplace] loadConfig failed:", err);
		}
	},

	async saveConfig(patch: {
		sources?: MarketplaceSourceConfig[];
		mirrors?: MarketplaceMirror[];
		autoCheck?: boolean;
	}) {
		await marketplaceSetSources(patch);
		await skillsMarketplaceStore.loadConfig();
	},

	async search(query?: string, sourceId?: string) {
		setState({ loading: true });
		try {
			const r = await marketplaceSearch(query, sourceId);
			setState({
				loaded: true,
				loading: false,
				entries: r.entries,
				errors: r.errors,
				lastQuery: query ?? "",
				lastSourceId: sourceId,
			});
		} catch (e) {
			setState({
				loading: false,
				errors: [
					{ sourceId: "*", error: e instanceof Error ? e.message : String(e) },
				],
			});
		}
	},

	async install(entryId: string) {
		await ensureEventBindings();
		setState({
			progress: {
				...state.progress,
				[entryId]: {
					entryId,
					phase: "queued",
					percent: 0,
					startedAt: Date.now(),
				},
			},
		});
		const r = await marketplaceInstall(entryId);
		if (r.success) {
			// 标记 entry installed 状态
			const entries = state.entries.map((e) =>
				e.id === entryId
					? {
							...e,
							installed: true,
							installedVersion: e.version ?? e.installedVersion,
						}
					: e,
			);
			setState({ entries });
			await skillsStore.refresh();
		}
		return r;
	},

	async uninstall(skillName: string) {
		const r = await marketplaceUninstall(skillName);
		if (r.success) {
			const entries = state.entries.map((e) =>
				e.name === skillName
					? { ...e, installed: false, installedVersion: undefined }
					: e,
			);
			setState({
				entries,
				updates: state.updates.filter((u) => u.name !== skillName),
			});
			await skillsStore.refresh();
		}
		return r;
	},

	async checkUpdates() {
		try {
			const r = await marketplaceCheckUpdates();
			setState({ updates: r.updates });
		} catch (e) {
			console.error("[marketplace] checkUpdates failed:", e);
		}
	},

	async testMirrors(): Promise<MarketplaceMirrorTestResult[]> {
		const r = await marketplaceTestMirror();
		return r.results;
	},

	async preview(entryId: string) {
		return marketplacePreview(entryId);
	},

	clearProgress(entryId: string) {
		if (!state.progress[entryId]) return;
		const next = { ...state.progress };
		delete next[entryId];
		setState({ progress: next });
	},
};

export function useMarketplaceStore() {
	const snapshot = useSyncExternalStore(
		skillsMarketplaceStore.subscribe,
		skillsMarketplaceStore.getState,
		skillsMarketplaceStore.getState,
	);

	useEffect(() => {
		ensureEventBindings();
		if (!snapshot.config) {
			skillsMarketplaceStore.loadConfig();
		}
		if (!snapshot.loaded) {
			skillsMarketplaceStore.search();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return snapshot;
}

export function useUpdateBadge() {
	const [count, setCount] = useState(state.updates.length);
	useEffect(() => {
		ensureEventBindings();
		const unsub = skillsMarketplaceStore.subscribe(() => {
			setCount(skillsMarketplaceStore.getState().updates.length);
		});
		return () => {
			unsub();
		};
	}, []);
	return count;
}
