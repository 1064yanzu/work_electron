/**
 * MascotManager — 桌面宠物选择器
 *
 * v3: builtin + 自定义桌宠双层管理
 * - 主进程为权威源（pet-window.json:mascotId + custom-mascots/index.json）
 * - 渲染层托管：内置 3 个 + 主进程拉取的自定义列表，合并对外暴露
 * - 通过 setCustomResolver 把自定义桌宠的资源 URL 解析能力注入 manifest 层
 * - 监听 mascot-id-changed / mascot-list-changed 实现跨窗口同步
 */

import { useSyncExternalStore } from "react";
import {
	type MascotId,
	type MascotSlot,
	type MascotAnimation,
	type MascotMeta,
	type CustomMascotResolver,
	type CustomAtlasInfo,
	getMascotAsset,
	getMascotAnimation,
	BUILTIN_MASCOT_LIST,
	BUILTIN_MASCOT_META,
	MASCOT_IDS,
	MASCOT_META,
	isBuiltinMascotId,
	setCustomResolver,
} from "./mascot/manifest";
import { invoke, isDesktopEnvironment } from "./tauriCompat";
import { listen, type UnlistenFn } from "./tauriEventCompat";

/** 渲染层用：选择项 = 任意 mascot id 或 "off" */
export type MascotSelection = MascotId | "off";

/** 自定义桌宠 meta（与主进程 IPC payload 对齐；isBuiltin 永远 false） */
export interface CustomMascotMeta {
	id: string;
	label: string;
	tagline: string;
	personality: string;
	accentColor: string;
	isBuiltin: false;
	version: number;
	createdAt?: string;
	hasAtlas: boolean;
	hasLoading: boolean;
	hasSpritesheet?: boolean;
	spritesheetExt?: "webp" | "png";
	slots: string[];
	atlas?: CustomAtlasInfo;
}

const STORAGE_KEY = "mascotId";
const DEFAULT_ID: MascotSelection = "efficiency";

export type MascotChangeSource = "main" | "pet" | "system";

class MascotManager {
	private currentId: MascotSelection = DEFAULT_ID;
	private customMascots: CustomMascotMeta[] = [];
	private listeners = new Set<() => void>();
	private version = 0;
	private ipcInitialized = false;
	private ipcUnlisten: UnlistenFn | null = null;
	private listUnlisten: UnlistenFn | null = null;

	constructor() {
		if (typeof window !== "undefined") {
			const saved = window.localStorage.getItem(STORAGE_KEY);
			if (saved) {
				// 启动早期还没拉到自定义列表，先信任本地缓存；后续 init 会覆盖
				this.currentId = saved as MascotSelection;
			}
		}
		// 注入自定义桌宠 resolver（只注入一次，行为引用 this.customMascots 实时变化）
		setCustomResolver(this.buildResolver());
	}

	getId(): MascotSelection {
		return this.currentId;
	}

	getCustomMascots(): CustomMascotMeta[] {
		return this.customMascots;
	}

	getVersion(): number {
		return this.version;
	}

	/** 合并所有可选项（内置 + 自定义）的 id 列表 */
	getAllMascotIds(): MascotId[] {
		return [...BUILTIN_MASCOT_LIST, ...this.customMascots.map((m) => m.id)];
	}

	/** 合并查询某个 id 的 meta（内置或自定义） */
	getMergedMeta(id: MascotId): MascotMeta | null {
		if (isBuiltinMascotId(id)) return BUILTIN_MASCOT_META[id];
		const custom = this.customMascots.find((m) => m.id === id);
		if (!custom) return null;
		return {
			id: custom.id,
			label: custom.label,
			tagline: custom.tagline,
			personality: custom.personality,
			accentColor: custom.accentColor,
			isBuiltin: false,
			version: custom.version,
		};
	}

	/** 判断某 selection 是否为合法选项（"off" / 内置 / 已存在的自定义） */
	private isValidSelection(value: string): value is MascotSelection {
		if (value === "off") return true;
		if (isBuiltinMascotId(value)) return true;
		return this.customMascots.some((m) => m.id === value);
	}

	/**
	 * 设置当前 IP。
	 * - source: 当前窗口角色（"main" | "pet"）；调用方传入，转发给主进程后再广播回来时
	 *   带相同 source 让本窗口跳过回写避免回环
	 */
	setId(id: MascotSelection, source: MascotChangeSource = "system") {
		if (this.currentId === id) return;
		this.applyLocal(id);
		if (isDesktopEnvironment()) {
			void invoke("mascot_set_id", { id, source }).catch(() => {
				// 即使 IPC 失败也保留本地变更；下次启动会从持久化恢复
			});
		}
	}

	/** 内部：仅更新本地状态 + localStorage + 通知订阅者 */
	private applyLocal(id: MascotSelection) {
		this.currentId = id;
		if (typeof window !== "undefined") {
			window.localStorage.setItem(STORAGE_KEY, id);
		}
		this.notify();
	}

	private applyCustomList(list: CustomMascotMeta[]) {
		this.customMascots = list;
		this.notify();
	}

	/**
	 * 在窗口启动时调用一次：
	 * 1. 先拉自定义桌宠列表（让 valid 检查能识别已上传的 id）
	 * 2. 从主进程拉当前权威 IP
	 * 3. 监听 mascot-id-changed / mascot-list-changed 跨窗口同步
	 */
	async initFromIPC(): Promise<void> {
		if (this.ipcInitialized) return;
		this.ipcInitialized = true;
		if (!isDesktopEnvironment()) return;

		// 1. 拉自定义列表（先做，让后续 selection 校验能命中）
		try {
			const result = await invoke<{ mascots: CustomMascotMeta[] }>(
				"mascot_list_custom",
				{},
			);
			if (Array.isArray(result?.mascots)) {
				this.applyCustomList(result.mascots);
			}
		} catch {
			// 主进程暂未就绪 / handler 未注册 → 静默
		}

		// 2. 拉权威 mascot id
		try {
			const result = await invoke<{ id: string }>("mascot_get_id", {});
			if (result?.id && this.isValidSelection(result.id)) {
				if (this.currentId !== result.id) {
					this.applyLocal(result.id as MascotSelection);
				}
			} else if (!this.isValidSelection(this.currentId)) {
				this.applyLocal(DEFAULT_ID);
				void invoke("mascot_set_id", {
					id: DEFAULT_ID,
					source: "system",
				}).catch(() => {});
			}
		} catch {
			// noop
		}

		// 3a. 订阅 mascot-id-changed（跨窗口当前 IP 同步）
		try {
			this.ipcUnlisten = await listen<{
				id: string;
				source: MascotChangeSource;
			}>("mascot-id-changed", (event) => {
				const payload = event.payload;
				if (!payload?.id) return;
				if (!this.isValidSelection(payload.id)) return;
				if (payload.id === this.currentId) return;
				this.applyLocal(payload.id as MascotSelection);
			});
		} catch {
			// noop
		}

		// 3b. 订阅 mascot-list-changed（自定义桌宠列表同步）
		try {
			this.listUnlisten = await listen<{ mascots: CustomMascotMeta[] }>(
				"mascot-list-changed",
				(event) => {
					const list = event.payload?.mascots;
					if (Array.isArray(list)) this.applyCustomList(list);
				},
			);
		} catch {
			// noop
		}
	}

	// ── 自定义桌宠 CRUD（薄封装，渲染层 UI 通过这层调主进程） ──

	async listCustom(): Promise<CustomMascotMeta[]> {
		if (!isDesktopEnvironment()) return this.customMascots;
		try {
			const result = await invoke<{ mascots: CustomMascotMeta[] }>(
				"mascot_list_custom",
				{},
			);
			if (Array.isArray(result?.mascots)) {
				this.applyCustomList(result.mascots);
			}
		} catch {
			// noop
		}
		return this.customMascots;
	}

	/**
	 * 导入自定义桌宠（zip 包）。
	 * - zipPath 为空 → 主进程弹原生文件对话框
	 * - 成功后主进程会广播 mascot-list-changed，订阅器自然刷新
	 */
	async importCustom(zipPath?: string): Promise<{
		success: boolean;
		mascot?: CustomMascotMeta;
		finalId?: string;
		renamed?: boolean;
		error?: string;
	}> {
		if (!isDesktopEnvironment()) {
			return { success: false, error: "仅桌面端可用" };
		}
		try {
			return await invoke("mascot_import_custom", { zipPath });
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	/**
	 * 从目录导入自定义桌宠（兼容 codex hatch-pet runs / ~/.codex/pets）
	 * - dirPath 为空 → 主进程弹原生目录对话框
	 */
	async importCustomDir(dirPath?: string): Promise<{
		success: boolean;
		mascot?: CustomMascotMeta;
		finalId?: string;
		renamed?: boolean;
		error?: string;
	}> {
		if (!isDesktopEnvironment()) {
			return { success: false, error: "仅桌面端可用" };
		}
		try {
			return await invoke("mascot_import_custom_dir", { dirPath });
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	async deleteCustom(
		id: string,
	): Promise<{ success: boolean; error?: string }> {
		if (!isDesktopEnvironment()) {
			return { success: false, error: "仅桌面端可用" };
		}
		try {
			return await invoke("mascot_delete_custom", { id });
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	async updateCustomMeta(input: {
		id: string;
		label?: string;
		tagline?: string;
		personality?: string;
		accentColor?: string;
	}): Promise<{
		success: boolean;
		mascot?: CustomMascotMeta;
		error?: string;
	}> {
		if (!isDesktopEnvironment()) {
			return { success: false, error: "仅桌面端可用" };
		}
		try {
			return await invoke("mascot_update_custom_meta", input);
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	// ── Resolver 注入 ──

	private buildResolver(): CustomMascotResolver {
		const findMeta = (id: string) =>
			this.customMascots.find((m) => m.id === id) ?? null;

		return {
			asset: (id, slot) => {
				const meta = findMeta(id);
				if (!meta) return null;
				// 实际包含的 slot 才发 URL；缺位让上层 fallback
				if (!meta.slots.includes(slot)) return null;
				return `mascot://${id}/${slot}.png`;
			},
			atlas: (id) => {
				const meta = findMeta(id);
				if (!meta?.hasAtlas) return null;
				return `mascot://${id}/atlas.webp`;
			},
			spritesheet: (id) => {
				const meta = findMeta(id);
				if (!meta?.hasSpritesheet) return null;
				const ext = meta.spritesheetExt ?? "webp";
				return `mascot://${id}/spritesheet.${ext}`;
			},
			atlasInfo: (id) => {
				const meta = findMeta(id);
				return meta?.atlas ?? null;
			},
			animation: (id, animation) => {
				const meta = findMeta(id);
				if (!meta) return null;
				if (animation === "loading" && meta.hasLoading) {
					return `mascot://${id}/loading.mp4`;
				}
				return null;
			},
			meta: (id) => {
				const meta = findMeta(id);
				if (!meta) return null;
				return {
					id: meta.id,
					label: meta.label,
					tagline: meta.tagline,
					personality: meta.personality,
					accentColor: meta.accentColor,
					isBuiltin: false,
					version: meta.version,
				};
			},
		};
	}

	// ── 资源访问（兼容旧 API） ──

	getAsset(slot: MascotSlot): string | null {
		if (this.currentId === "off") return null;
		return getMascotAsset(this.currentId, slot) || null;
	}

	getAnimation(animation: MascotAnimation): string | null {
		if (this.currentId === "off") return null;
		return getMascotAnimation(this.currentId, animation);
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	dispose(): void {
		if (this.ipcUnlisten) {
			this.ipcUnlisten();
			this.ipcUnlisten = null;
		}
		if (this.listUnlisten) {
			this.listUnlisten();
			this.listUnlisten = null;
		}
		this.ipcInitialized = false;
	}

	private notify() {
		this.version += 1;
		for (const listener of this.listeners) listener();
	}
}

export const mascotManager = new MascotManager();

// 启动即拉取一次主进程权威值并监听跨窗口广播
if (typeof window !== "undefined") {
	void mascotManager.initFromIPC();
}

export interface UseMascotResult {
	id: MascotSelection;
	customMascots: CustomMascotMeta[];
	setId: (id: MascotSelection, source?: MascotChangeSource) => void;
	getAsset: (slot: MascotSlot) => string | null;
	getAnimation: (animation: MascotAnimation) => string | null;
	getMergedMeta: (id: MascotId) => MascotMeta | null;
	getAllMascotIds: () => MascotId[];
	enabled: boolean;
	importCustom: MascotManager["importCustom"];
	importCustomDir: MascotManager["importCustomDir"];
	deleteCustom: MascotManager["deleteCustom"];
	updateCustomMeta: MascotManager["updateCustomMeta"];
	listCustom: MascotManager["listCustom"];
}

const subscribe = (listener: () => void) => mascotManager.subscribe(listener);
// 用递增版本做快照，让 useSyncExternalStore 能感知 id / 自定义列表 / meta 变化
const getSnapshot = () => {
	return mascotManager.getVersion();
};

export function useMascot(): UseMascotResult {
	useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	return {
		id: mascotManager.getId(),
		customMascots: mascotManager.getCustomMascots(),
		setId: (next, source) => mascotManager.setId(next, source),
		getAsset: (slot) => mascotManager.getAsset(slot),
		getAnimation: (animation) => mascotManager.getAnimation(animation),
		getMergedMeta: (id) => mascotManager.getMergedMeta(id),
		getAllMascotIds: () => mascotManager.getAllMascotIds(),
		enabled: mascotManager.getId() !== "off",
		importCustom: mascotManager.importCustom.bind(mascotManager),
		importCustomDir: mascotManager.importCustomDir.bind(mascotManager),
		deleteCustom: mascotManager.deleteCustom.bind(mascotManager),
		updateCustomMeta: mascotManager.updateCustomMeta.bind(mascotManager),
		listCustom: mascotManager.listCustom.bind(mascotManager),
	};
}

// 兼容旧调用方
export { MASCOT_META, MASCOT_IDS, BUILTIN_MASCOT_LIST, BUILTIN_MASCOT_META };
export type { MascotId, MascotSlot, MascotAnimation, MascotMeta };
