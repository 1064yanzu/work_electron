/**
 * 沙盒代码编辑器状态管理
 * 管理编辑器多标签页、文件内容、保存状态
 */

import { useSyncExternalStore } from "react";
import { safeInvoke } from "./tauriBridge";
import { toast } from "../components/ui/Toast";

// ==================== 类型定义 ====================

export interface EditorTab {
	/** 文件 ID（与 managedModeStore 一致） */
	id: string;
	/** 文件绝对路径 */
	path: string;
	/** 相对沙盒根目录路径 */
	relPath: string;
	/** 文件名 */
	name: string;
	/** 扩展名 */
	extension: string;
	/** 文件内容（懒加载） */
	content?: string;
	/** 是否已修改未保存 */
	dirty: boolean;
	/** 最后活跃时间戳，用于 LRU 回收 */
	lastActiveAt: number;
}

interface SandboxEditorState {
	/** 已打开的标签页列表 */
	openTabs: EditorTab[];
	/** 当前活跃标签页 ID */
	activeTabId: string | null;
}

// ==================== 常量 ====================

const MAX_TABS = 10;

// ==================== Store ====================

class SandboxEditorStore {
	private state: SandboxEditorState = {
		openTabs: [],
		activeTabId: null,
	};

	private listeners = new Set<() => void>();

	getState = (): SandboxEditorState => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit() {
		for (const fn of this.listeners) fn();
	}

	private setState(updater: (state: SandboxEditorState) => SandboxEditorState) {
		const nextState = updater(this.state);
		if (Object.is(nextState, this.state)) {
			return;
		}
		this.state = nextState;
		this.emit();
	}

	// ========== 文件操作 ==========

	/**
	 * 打开文件到编辑器
	 * 如果已打开则激活，否则添加新 tab
	 * 超过 MAX_TABS 时回收最久未活跃的非 dirty tab
	 */
	openFile(
		fileId: string,
		path: string,
		relPath: string,
		name: string,
		extension: string,
		content?: string,
	) {
		const now = Date.now();

		// 已打开则激活
		const existingIndex = this.state.openTabs.findIndex((t) => t.id === fileId);
		if (existingIndex >= 0) {
			this.setState((s) => ({
				...s,
				activeTabId: fileId,
				openTabs: s.openTabs.map((t, i) =>
					i === existingIndex ? { ...t, lastActiveAt: now } : t,
				),
			}));
			return;
		}

		// 超过上限时回收最久未活跃的非 dirty tab
		let tabs = [...this.state.openTabs];
		if (tabs.length >= MAX_TABS) {
			const evictable = tabs
				.filter((t) => !t.dirty)
				.sort((a, b) => a.lastActiveAt - b.lastActiveAt);
			if (evictable.length > 0) {
				tabs = tabs.filter((t) => t.id !== evictable[0].id);
			}
		}

		const newTab: EditorTab = {
			id: fileId,
			path,
			relPath,
			name,
			extension,
			content,
			dirty: false,
			lastActiveAt: now,
		};

		this.setState((s) => ({
			...s,
			openTabs: [...tabs, newTab],
			activeTabId: fileId,
		}));
	}

	/** 关闭标签页 */
	closeTab(tabId: string) {
		this.setState((s) => {
			const remaining = s.openTabs.filter((t) => t.id !== tabId);
			let nextActive = s.activeTabId;

			if (s.activeTabId === tabId) {
				// 关闭当前活跃 tab 时，激活相邻 tab
				const closedIndex = s.openTabs.findIndex((t) => t.id === tabId);
				if (remaining.length > 0) {
					// 优先激活右边，否则左边
					const targetIndex = Math.min(closedIndex, remaining.length - 1);
					nextActive = remaining[targetIndex].id;
				} else {
					nextActive = null;
				}
			}

			return {
				...s,
				openTabs: remaining,
				activeTabId: nextActive,
			};
		});
	}

	/** 关闭除指定 tab 以外的所有 tab */
	closeOtherTabs(keepTabId: string) {
		this.setState((s) => ({
			...s,
			openTabs: s.openTabs.filter((t) => t.id === keepTabId),
			activeTabId: keepTabId,
		}));
	}

	/** 关闭所有标签页 */
	closeAllTabs() {
		this.setState((s) => ({
			...s,
			openTabs: [],
			activeTabId: null,
		}));
	}

	/** 设置活跃标签页 */
	setActiveTab(tabId: string) {
		if (this.state.activeTabId === tabId) return;
		this.setState((s) => ({
			...s,
			activeTabId: tabId,
			openTabs: s.openTabs.map((t) =>
				t.id === tabId ? { ...t, lastActiveAt: Date.now() } : t,
			),
		}));
	}

	// ========== 内容管理 ==========

	/** 更新文件内容（编辑器 onChange 时调用） */
	updateContent(tabId: string, content: string) {
		this.setState((s) => ({
			...s,
			openTabs: s.openTabs.map((t) =>
				t.id === tabId
					? { ...t, content, dirty: true, lastActiveAt: Date.now() }
					: t,
			),
		}));
	}

	/** 标记为未保存 */
	markDirty(tabId: string) {
		this.setState((s) => ({
			...s,
			openTabs: s.openTabs.map((t) =>
				t.id === tabId ? { ...t, dirty: true } : t,
			),
		}));
	}

	/** 标记为已保存 */
	markClean(tabId: string) {
		this.setState((s) => ({
			...s,
			openTabs: s.openTabs.map((t) =>
				t.id === tabId ? { ...t, dirty: false } : t,
			),
		}));
	}

	/** 加载文件内容（懒加载） */
	async loadContent(
		tabId: string,
		filePath: string,
	): Promise<string | undefined> {
		const tab = this.state.openTabs.find((t) => t.id === tabId);
		if (!tab) return undefined;

		// 已有内容直接返回
		if (tab.content !== undefined) return tab.content;

		try {
			const result = await safeInvoke<{
				content: string;
				encoding: string;
			}>("read_file_safe", {
				payload: { path: filePath },
			});

			if (result?.content !== undefined) {
				this.setState((s) => ({
					...s,
					openTabs: s.openTabs.map((t) =>
						t.id === tabId ? { ...t, content: result.content } : t,
					),
				}));
				return result.content;
			}
		} catch (error) {
			console.error("[SandboxEditorStore] 加载文件内容失败:", error);
			toast.error(`加载文件失败：${error instanceof Error ? error.message : "未知错误"}`);
		}

		return undefined;
	}

	/**
	 * 保存文件
	 * 调用 write_file_safe 将内容写回磁盘
	 */
	async saveTab(tabId: string): Promise<boolean> {
		const tab = this.state.openTabs.find((t) => t.id === tabId);
		if (!tab || tab.content === undefined) return false;

		try {
			await safeInvoke<{ success: boolean }>("write_file_safe", {
				payload: {
					path: tab.path,
					content: tab.content,
					encoding: "utf-8",
					create_dirs: true,
				},
			});
			this.markClean(tabId);
			return true;
		} catch (error) {
			console.error("[SandboxEditorStore] 保存文件失败:", error);
			toast.error(`保存文件失败：${error instanceof Error ? error.message : "未知错误"}`);
			return false;
		}
	}

	/** 获取当前活跃标签页 */
	getActiveTab(): EditorTab | null {
		if (!this.state.activeTabId) return null;
		return (
			this.state.openTabs.find((t) => t.id === this.state.activeTabId) || null
		);
	}

	/** 检查是否有未保存的 tab */
	hasDirtyTabs(): boolean {
		return this.state.openTabs.some((t) => t.dirty);
	}

	/** 重置所有状态 */
	reset() {
		this.setState(() => ({
			openTabs: [],
			activeTabId: null,
		}));
	}
}

// ==================== 导出 ====================

export const sandboxEditorStore = new SandboxEditorStore();

/** 选择器 hook */
export function useSandboxEditorStoreSelector<T>(
	selector: (state: SandboxEditorState) => T,
): T {
	return useSyncExternalStore(
		sandboxEditorStore.subscribe,
		() => selector(sandboxEditorStore.getState()),
		() => selector(sandboxEditorStore.getState()),
	);
}
