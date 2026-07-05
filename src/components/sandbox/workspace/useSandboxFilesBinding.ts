import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThrottledValue } from "../../../hooks/useThrottledValue";
import type {
	AgentTaskStatus,
	ToolArtifact,
	ToolCall,
} from "../../../lib/agent/types";
import { useChatStoreSelector } from "../../../lib/chat/store";
import type { ChatMessage, ChatState } from "../../../lib/chat/types";
import { invoke } from "../../../lib/tauriCompat";
import { listen } from "../../../lib/tauriEventCompat";
import type { ExecutionGraphSource } from "../graph/types";

/** watcher 启动失败时的退避轮询间隔（替代原 5s 全量重扫） */
const FALLBACK_POLL_INTERVAL_MS = 15000;

/** 流式期间 graphSource 相关重算/下发的节流间隔 */
const GRAPH_SOURCE_THROTTLE_MS = 250;

interface UseSandboxFilesBindingArgs {
	activeSessionId: string | null;
	currentTask: any;
	taskHistory: any[];
	isExecuting: boolean;
	store: any;
}

function selectActiveSession(state: ChatState) {
	if (!state.activeSessionId) return null;
	return state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
}

/** 从消息列表倒序扫出最近一次 agent 任务的 taskId */
function scanSessionTaskId(messages: ChatMessage[]): string | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		const metadata = msg?.metadata as any;
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
}

/** 从消息列表倒序扫出最近的 sandboxDir */
function scanSessionSandboxDir(messages: ChatMessage[]): string | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i] as any;
		if (msg?.metadata?.sandboxDir) return msg.metadata.sandboxDir as string;
	}
	return undefined;
}

interface SessionScanResult {
	key: string;
	taskId: string | null;
	sandboxDir: string | undefined;
}

/**
 * graphSource 的轻量签名：节点 id/status、工具数、最后一个工具的流式进度、产物集合。
 * 签名不变 ⇒ 复用上一次的 graphSource 引用，下游 useMemo / React.memo 全部短路。
 */
function computeGraphSourceSig(source: ExecutionGraphSource | null): string {
	if (!source) return "null";
	const parts: string[] = [
		source.id,
		String(source.status),
		source.title || "",
		String(source.subtitle?.length ?? 0),
		String(source.toolCalls.length),
		String(source.artifacts.length),
	];
	for (const tc of source.toolCalls) {
		parts.push(
			`${tc.id}:${tc.status}:${tc.subagentActivities?.length ?? 0}:${
				tc.output !== undefined ? 1 : 0
			}:${tc.duration ?? ""}`,
		);
	}
	// 运行中的最后一个工具，其 input 还在流式累积（影响节点 inputSummary），用长度参与签名
	const last = source.toolCalls[source.toolCalls.length - 1];
	if (last && (last.status === "running" || last.status === "pending")) {
		try {
			parts.push(String(JSON.stringify(last.input ?? {}).length));
		} catch {
			parts.push("x");
		}
	}
	for (const a of source.artifacts) parts.push(String(a.id));
	return parts.join("|");
}

export function useSandboxFilesBinding({
	activeSessionId,
	currentTask,
	taskHistory,
	isExecuting,
	store,
}: UseSandboxFilesBindingArgs) {
	const [isRefreshing, setIsRefreshing] = useState(false);
	const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// ---- 订阅收窄：细粒度 selector 只取原始值 / 稳定引用 ----------------------
	// 流式期间 chat store 每 ~16ms 换一次 state 引用，但 taskId / sandboxDir 这类
	// 派生值几乎不变。selector 返回原始值时 useSyncExternalStore 用 Object.is 比较，
	// 值不变就不会触发重渲染。扫描结果按「会话 id + 消息数 + 末条消息 id + 末两条
	// blocks 数」做 key 缓存，key 不变直接复用，避免每次 emit 都全量扫描。
	const scanCacheRef = useRef<SessionScanResult | null>(null);
	const getSessionScan = useCallback(
		(state: ChatState): SessionScanResult | null => {
			const session = selectActiveSession(state);
			if (!session) return null;
			const msgs = session.messages;
			const last = msgs[msgs.length - 1];
			const prev = msgs[msgs.length - 2];
			const key = `${session.id}|${msgs.length}|${last?.id ?? ""}|${
				last?.metadata?.blocks?.length ?? 0
			}|${prev?.metadata?.blocks?.length ?? 0}`;
			const cached = scanCacheRef.current;
			if (cached && cached.key === key) return cached;
			const next: SessionScanResult = {
				key,
				taskId: scanSessionTaskId(msgs),
				sandboxDir: scanSessionSandboxDir(msgs),
			};
			scanCacheRef.current = next;
			return next;
		},
		[],
	);

	const sessionTaskId = useChatStoreSelector(
		(state) => getSessionScan(state)?.taskId ?? null,
	);
	const sessionSandboxDir = useChatStoreSelector(
		(state) => getSessionScan(state)?.sandboxDir,
	);
	const sessionAgentSessionId = useChatStoreSelector((state) =>
		String(selectActiveSession(state)?.agentSessionId ?? "").trim(),
	);
	const sessionTitle = useChatStoreSelector(
		(state) => selectActiveSession(state)?.title ?? "",
	);
	const activeMessages = useChatStoreSelector(
		(state) => selectActiveSession(state)?.messages ?? null,
	);

	// 流式期间消息数组每 tick 换引用，兜底路径的全消息扫描按 250ms 节流执行
	const throttledMessages = useThrottledValue(
		activeMessages,
		GRAPH_SOURCE_THROTTLE_MS,
		isExecuting,
	);

	const boundTask = useMemo(() => {
		if (sessionTaskId) {
			if (currentTask?.id === sessionTaskId) return currentTask;
			const matched = taskHistory.find((t) => t.id === sessionTaskId);
			if (matched) return matched;
		}

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
	}, [currentTask, sessionAgentSessionId, sessionTaskId, taskHistory]);

	// 工作目录来自 session.cwd（用户选定的真实目录），已写入 task.metadata.sandboxDir
	// 与每条消息的 metadata.sandboxDir；没有就显示为空，符合"agent 直接在用户目录工作"的语义。
	const sandboxDir = useMemo(() => {
		const fromTask = boundTask?.metadata?.sandboxDir as string | undefined;
		return fromTask || sessionSandboxDir;
	}, [boundTask, sessionSandboxDir]);

	const rawGraphSource = useMemo<ExecutionGraphSource | null>(() => {
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

		if (!throttledMessages) return null;
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

		for (const msg of throttledMessages) {
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
		for (const msg of throttledMessages) {
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
			title: sessionTitle || "托管任务",
			subtitle: throttledMessages
				.slice()
				.reverse()
				.find((m: any) => m.role === "user")?.content,
			status,
			toolCalls,
			artifacts,
		};
	}, [boundTask, sessionTaskId, sessionTitle, throttledMessages]);

	// ---- 签名稳定化：sig 不变 ⇒ 返回旧引用，下游整链短路 ----------------------
	const graphSourceCacheRef = useRef<{
		sig: string;
		source: ExecutionGraphSource | null;
	} | null>(null);
	const stableGraphSource = useMemo(() => {
		const sig = computeGraphSourceSig(rawGraphSource);
		const cached = graphSourceCacheRef.current;
		if (cached && cached.sig === sig) return cached.source;
		graphSourceCacheRef.current = { sig, source: rawGraphSource };
		return rawGraphSource;
	}, [rawGraphSource]);

	// 流式期间再叠一层 250ms 节流；空闲时立即透传
	const graphSource = useThrottledValue(
		stableGraphSource,
		GRAPH_SOURCE_THROTTLE_MS,
		isExecuting,
	);

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
		sessionTitle,
		graphSource,
		isRefreshing,
		refreshFiles,
	};
}
