import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	AgentTaskStatus,
	ToolArtifact,
	ToolCall,
} from "../../../lib/agent/types";
import { invoke } from "../../../lib/tauriCompat";
import { listen } from "../../../lib/tauriEventCompat";
import type { ExecutionGraphSource } from "../graph/types";

/** watcher 启动失败时的退避轮询间隔（替代原 5s 全量重扫） */
const FALLBACK_POLL_INTERVAL_MS = 15000;

interface UseSandboxFilesBindingArgs {
	activeSessionId: string | null;
	activeSession: any;
	currentTask: any;
	taskHistory: any[];
	isExecuting: boolean;
	store: any;
}

export function useSandboxFilesBinding({
	activeSessionId,
	activeSession,
	currentTask,
	taskHistory,
	isExecuting,
	store,
}: UseSandboxFilesBindingArgs) {
	const [isRefreshing, setIsRefreshing] = useState(false);
	const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const sessionTaskId = useMemo(() => {
		if (!activeSession) return null;

		for (let i = activeSession.messages.length - 1; i >= 0; i--) {
			const msg = activeSession.messages[i];
			const metadata = msg.metadata;
			if (typeof metadata?.taskId === "string" && metadata.taskId)
				return metadata.taskId;
			const trace = metadata?.trace;
			if (trace?.type === "agent_task") return trace.taskId;
			if (trace?.type === "tool_call") return trace.taskId;
			if (Array.isArray(metadata?.blocks)) {
				for (let j = metadata.blocks.length - 1; j >= 0; j--) {
					const b = metadata.blocks[j] as any;
					if (b?.type === "agent_task" || b?.type === "task_list")
						return b.taskId;
					if (b?.type === "tool_call") return b.taskId;
				}
			}
		}

		return null;
	}, [activeSession]);

	const sessionSandboxDir = useMemo(() => {
		if (!activeSession) return undefined;
		for (let i = activeSession.messages.length - 1; i >= 0; i--) {
			const msg = activeSession.messages[i];
			if (msg.metadata?.sandboxDir) return msg.metadata.sandboxDir as string;
		}
		return undefined;
	}, [activeSession]);

	const boundTask = useMemo(() => {
		if (sessionTaskId) {
			if (currentTask?.id === sessionTaskId) return currentTask;
			const matched = taskHistory.find((t) => t.id === sessionTaskId);
			if (matched) return matched;
		}

		const sessionAgentSessionId = String(
			activeSession?.agentSessionId || "",
		).trim();
		if (!sessionAgentSessionId) return null;

		const currentTaskSessionId = String(
			(currentTask?.metadata as any)?.sessionId || "",
		).trim();
		if (
			currentTaskSessionId &&
			currentTaskSessionId === sessionAgentSessionId
		) {
			return currentTask;
		}

		return (
			taskHistory.find((t) => {
				const taskSessionId = String(
					(t?.metadata as any)?.sessionId || "",
				).trim();
				return taskSessionId === sessionAgentSessionId;
			}) || null
		);
	}, [activeSession, currentTask, sessionTaskId, taskHistory]);

	useEffect(() => {
		// 工作目录现在来自 caller 传入的 session.cwd（即用户选定的真实目录），
		// 已写入 task.metadata.sandboxDir 与每条消息的 metadata.sandboxDir。
		// 不再需要为没有显式 sandboxDir 的 session 兜底创建隔离目录——
		// 没有就显示为空，符合"agent 直接在用户目录工作"的语义。
	}, [activeSession]);

	const sandboxDir = useMemo(() => {
		const fromTask = boundTask?.metadata?.sandboxDir as string | undefined;
		return fromTask || sessionSandboxDir;
	}, [boundTask, sessionSandboxDir]);

	const graphSource = useMemo<ExecutionGraphSource | null>(() => {
		if (boundTask) {
			return {
				id: boundTask.id,
				title: boundTask.title || "托管任务",
				subtitle: boundTask.query,
				status: boundTask.status,
				toolCalls: boundTask.toolCalls || [],
				artifacts: boundTask.artifacts || [],
			};
		}

		if (!activeSession) return null;
		if (!sessionTaskId) return null;

		const normalizeToolCallStatus = (v: unknown): ToolCall["status"] => {
			switch (v) {
				case "pending":
				case "running":
				case "completed":
				case "error":
				case "cancelled":
					return v;
				default:
					return "completed";
			}
		};

		const order: string[] = [];
		const seen = new Set<string>();
		type ToolCallBlockLike = {
			toolCallId?: string;
			toolType?: string;
			name?: string;
			status?: unknown;
			input?: unknown;
			output?: unknown;
			error?: unknown;
		};
		const toolCallById = new Map<string, ToolCallBlockLike>();

		for (const msg of activeSession.messages) {
			const blocks = msg.metadata?.blocks;
			if (!Array.isArray(blocks)) continue;
			for (const b of blocks as any[]) {
				if (b?.type !== "tool_call") continue;
				if (b.taskId !== sessionTaskId) continue;
				const id = String(b.toolCallId || "").trim();
				if (!id) continue;
				if (!seen.has(id)) {
					seen.add(id);
					order.push(id);
				}
				const prev = toolCallById.get(id) || {};
				toolCallById.set(id, { ...prev, ...b } as ToolCallBlockLike);
			}
		}

		const toolCalls: ToolCall[] = order.map((id) => {
			const b = toolCallById.get(id) || {};
			const inputRaw = (b as any).input;
			const input =
				inputRaw && typeof inputRaw === "object"
					? (inputRaw as Record<string, any>)
					: ({} as Record<string, any>);
			return {
				id,
				type: "custom",
				name: String((b as any).name || (b as any).toolType || "Tool"),
				input,
				output: (b as any).output,
				error:
					typeof (b as any).error === "string" ? (b as any).error : undefined,
				status: normalizeToolCallStatus((b as any).status),
				metadata: { toolType: (b as any).toolType },
			};
		});

		const hasRunning = toolCalls.some(
			(t) => t.status === "running" || t.status === "pending",
		);
		const artifacts: ToolArtifact[] = [];
		const seenArtifacts = new Set<string>();
		for (const msg of activeSession.messages) {
			const blocks = msg.metadata?.blocks;
			if (!Array.isArray(blocks)) continue;
			for (const block of blocks as any[]) {
				if (block?.type !== "image") continue;
				const path = String(block?.path || "").trim();
				if (!path || seenArtifacts.has(path)) continue;
				seenArtifacts.add(path);
				artifacts.push({
					id: `artifact-msg-${path}`,
					type: "image",
					title: String(block?.title || "图片"),
					url: path,
				});
			}
		}
		const hasError = toolCalls.some((t) => t.status === "error");
		const allCompleted =
			toolCalls.length > 0 && toolCalls.every((t) => t.status === "completed");
		const status: AgentTaskStatus = hasRunning
			? "executing"
			: hasError
				? "error"
				: allCompleted
					? "completed"
					: "waiting";

		return {
			id: sessionTaskId,
			title: activeSession.title || "托管任务",
			subtitle: activeSession.messages
				.slice()
				.reverse()
				.find((m: any) => m.role === "user")?.content,
			status,
			toolCalls,
			artifacts,
		};
	}, [activeSession, boundTask, sessionTaskId]);

	const refreshFiles = useCallback(async () => {
		if (!sandboxDir) return;
		setIsRefreshing(true);
		try {
			await store.scanSandboxDir(sandboxDir);
		} finally {
			setIsRefreshing(false);
		}
	}, [sandboxDir, store]);

	const isLiveBoundTask = Boolean(
		isExecuting && boundTask && currentTask && boundTask.id === currentTask.id,
	);

	useEffect(() => {
		if (refreshTimerRef.current) {
			clearInterval(refreshTimerRef.current);
			refreshTimerRef.current = null;
		}
		store.selectFile(null);
		store.clearFiles();
		store.setSearchQuery("");
		store.setGraphSearch("");
		store.setGraphFilter("all");
		store.setPinnedInspector(false);
	}, [activeSessionId, store]);

	useEffect(() => {
		if (refreshTimerRef.current) {
			clearInterval(refreshTimerRef.current);
			refreshTimerRef.current = null;
		}

		if (!sandboxDir) {
			store.clearFiles();
			return;
		}

		store.scanSandboxDir(sandboxDir);

		if (!isLiveBoundTask) return;

		// 事件驱动刷新：主进程 chokidar watcher 推送 coding-file-changed，
		// 收到后只在标签可见时重扫；watcher 启动失败时退避到 15s 轮询兜底。
		let disposed = false;
		let unlistenFileChanged: (() => void) | undefined;
		let watcherActive = false;

		const rescanIfVisible = () => {
			if (document.visibilityState !== "visible") return;
			store.scanSandboxDir(sandboxDir);
		};

		void (async () => {
			try {
				const result = await invoke<{ success: boolean; error?: string }>(
					"file_watch_start",
					{ path: sandboxDir },
				);
				if (disposed) {
					if (result.success)
						void invoke("file_watch_stop", { path: sandboxDir });
					return;
				}
				if (result.success) {
					watcherActive = true;
					unlistenFileChanged = await listen<{
						projectPath: string;
						changes: Array<{ type: string; path: string; name: string }>;
					}>("coding-file-changed", (evt) => {
						if (evt.payload?.projectPath !== sandboxDir) return;
						rescanIfVisible();
					});
					if (disposed) {
						unlistenFileChanged?.();
						unlistenFileChanged = undefined;
					}
					return;
				}
			} catch {
				// IPC 不可用（如桥接未就绪），走轮询兜底
			}
			if (disposed) return;
			refreshTimerRef.current = setInterval(
				rescanIfVisible,
				FALLBACK_POLL_INTERVAL_MS,
			);
		})();

		// 标签从隐藏恢复可见时立刻补扫一次（隐藏期间事件被跳过）
		const onVisibility = () => {
			if (document.visibilityState === "visible")
				store.scanSandboxDir(sandboxDir);
		};
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			disposed = true;
			if (refreshTimerRef.current) {
				clearInterval(refreshTimerRef.current);
				refreshTimerRef.current = null;
			}
			unlistenFileChanged?.();
			if (watcherActive) {
				void invoke("file_watch_stop", { path: sandboxDir }).catch(() => {});
			}
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [isLiveBoundTask, sandboxDir, store]);

	return {
		sandboxDir,
		graphSource,
		isRefreshing,
		refreshFiles,
	};
}
