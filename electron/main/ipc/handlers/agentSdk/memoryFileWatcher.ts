/**
 * Agent 记忆文件 watcher
 *
 * 监视三类路径，文件变化时给主窗口广播 `agent_memory:file_changed`：
 *   1. <userData>/agent-memory/*.md         始终 watch
 *   2. ~/.claude/CLAUDE.md                  始终 watch
 *   3. <cwd>/CLAUDE.md, <cwd>/AGENTS.md     跟随前端"当前线程 cwd"动态切换
 *
 * 前端通过 IPC `agent_memory_set_active_cwd` 通知 cwd 变化。
 */
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import chokidar, { type FSWatcher } from "chokidar";
import { getMemoryDir } from "./memoryFileStore";
import { sendToLiveWebContents } from "../../../utils/safeWebContentsSend";

type GetMainWindow = () => BrowserWindow | null | undefined;

const DEBOUNCE_MS = 200;

class MemoryFileWatcher {
	private staticWatcher: FSWatcher | null = null;
	private projectWatcher: FSWatcher | null = null;
	private currentCwd: string | null = null;
	private getMainWindow: GetMainWindow = () => null;
	private debounceTimers = new Map<string, NodeJS.Timeout>();

	start(getMainWindow: GetMainWindow): void {
		this.getMainWindow = getMainWindow;
		if (this.staticWatcher) return;

		const dir = getMemoryDir();
		const globalClaude = path.join(os.homedir(), ".claude", "CLAUDE.md");
		this.staticWatcher = chokidar.watch(
			[path.join(dir, "*.md"), globalClaude],
			{
				ignoreInitial: true,
				// 记忆文件多为人工编辑，写入完成判定不必激进；放宽 poll 间隔与稳定窗口，
				// 降低主进程后台轮询开销（30ms → 250ms / 100ms → 300ms）。
				awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 250 },
				persistent: true,
			},
		);
		this.staticWatcher.on("all", (_event, filePath) => {
			this.notify(filePath);
		});
	}

	setActiveCwd(cwd: string | null): void {
		const normalized = cwd && cwd.trim() ? path.resolve(cwd) : null;
		if (this.currentCwd === normalized) return;
		this.currentCwd = normalized;
		void this.rebuildProjectWatcher();
	}

	private async rebuildProjectWatcher(): Promise<void> {
		if (this.projectWatcher) {
			await this.projectWatcher.close().catch(() => {});
			this.projectWatcher = null;
		}
		if (!this.currentCwd) return;
		this.projectWatcher = chokidar.watch(
			[
				path.join(this.currentCwd, "CLAUDE.md"),
				path.join(this.currentCwd, "AGENTS.md"),
			],
			{
				ignoreInitial: true,
				awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 250 },
				persistent: true,
			},
		);
		this.projectWatcher.on("all", (_event, filePath) => {
			this.notify(filePath);
		});
	}

	private notify(filePath: string): void {
		// 简单 debounce：同一路径 200ms 内只发一次
		const existing = this.debounceTimers.get(filePath);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(() => {
			this.debounceTimers.delete(filePath);
			const win = this.getMainWindow();
			try {
				sendToLiveWebContents(win, "agent_memory:file_changed", {
					path: filePath,
					ts: Date.now(),
				});
			} catch {
				// 静默
			}
		}, DEBOUNCE_MS);
		this.debounceTimers.set(filePath, timer);
	}

	async stop(): Promise<void> {
		if (this.staticWatcher) {
			await this.staticWatcher.close().catch(() => {});
			this.staticWatcher = null;
		}
		if (this.projectWatcher) {
			await this.projectWatcher.close().catch(() => {});
			this.projectWatcher = null;
		}
		for (const t of this.debounceTimers.values()) clearTimeout(t);
		this.debounceTimers.clear();
	}
}

export const memoryFileWatcher = new MemoryFileWatcher();
