// Agent 长期记忆 store —— 浅薄客户端封装
//
// 历史：旧实现是 SQLite 表 + 类别筛选；现在改为 Markdown 文件式
// （SOUL/USER/MEMORY + SDK 自动加载的 CLAUDE.md / AGENTS.md），写入完全
// 由 Agent 调用 memory 工具，不再有自动提取。
//
// 这里只做：
//   1) 转发 IPC 调用
//   2) 监听 agent_memory:file_changed 主动派发刷新
import * as api from "./api";
import type { MemoryFileInfo, MemoryFileToken, MemoryStats } from "./api";
import { listen } from "../tauriEventCompat";

type Listener = () => void;

class MemoryStore {
	private listeners = new Set<Listener>();
	private statsCache: MemoryStats | null = null;
	private watcherStarted = false;

	subscribe(listener: Listener): () => void {
		this.ensureWatcher();
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private ensureWatcher() {
		if (this.watcherStarted) return;
		this.watcherStarted = true;
		void listen<{ path: string; ts: number }>(
			"agent_memory:file_changed",
			() => {
				this.statsCache = null;
				this.notify();
			},
		).catch(() => {
			// 非 desktop 环境无 listen，忽略
		});
	}

	private notify() {
		for (const l of this.listeners) {
			try {
				l();
			} catch (err) {
				console.warn("[memoryStore] listener error", err);
			}
		}
	}

	async getStats(force = false): Promise<MemoryStats> {
		if (this.statsCache && !force) return this.statsCache;
		const stats = await api.getAgentMemoryStats();
		this.statsCache = stats;
		return stats;
	}

	async listContextFiles(
		cwd?: string | null,
	): Promise<Array<MemoryFileInfo & { injectedInActiveSnapshot: boolean }>> {
		return api.listMemoryContextFiles(cwd ?? null);
	}

	async readFile(
		file: MemoryFileToken,
		cwd?: string | null,
	): Promise<MemoryFileInfo> {
		return api.readMemoryFile(file, cwd ?? null);
	}

	async writeFile(
		file: MemoryFileToken,
		content: string,
		opts?: { cwd?: string | null; confirmed?: boolean },
	): Promise<{ ok: boolean; error?: string; path?: string }> {
		const res = await api.writeMemoryFile(file, content, opts);
		this.statsCache = null;
		this.notify();
		return res;
	}

	async clearAll(): Promise<{ deleted: number }> {
		const res = await api.clearAllAgentMemories();
		this.statsCache = null;
		this.notify();
		return res;
	}

	async getMemoryContext(): Promise<{ context: string; memoryCount: number }> {
		const res = await api.getAgentMemoryContext();
		return { context: res.context, memoryCount: res.memory_count };
	}

	async revealInFolder(path: string): Promise<void> {
		await api.revealMemoryFileInFolder(path);
	}

	async setActiveCwd(cwd: string | null): Promise<void> {
		try {
			await (
				await import("../tauriBridge")
			).safeInvoke("agent_memory_set_active_cwd", { cwd });
		} catch {
			// 静默
		}
	}

	invalidate(): void {
		this.statsCache = null;
		this.notify();
	}
}

export const memoryStore = new MemoryStore();

export type { MemoryFileInfo, MemoryFileToken, MemoryStats } from "./api";
