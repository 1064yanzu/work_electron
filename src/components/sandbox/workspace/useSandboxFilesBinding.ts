import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAgentSandboxDir } from "../../../lib/api";
import type {
	AgentTaskStatus,
	ToolArtifact,
	ToolCall,
} from "../../../lib/agent/types";
import type { ExecutionGraphSource } from "../graph/types";

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
	const [fallbackSandboxDir, setFallbackSandboxDir] = useState<
		string | undefined
	>(undefined);
	const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const fallbackResolvedKeyRef = useRef<string | null>(null);

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
		const explicitSandboxDir =
			(boundTask?.metadata?.sandboxDir as string | undefined) ||
			sessionSandboxDir;
		if (explicitSandboxDir) {
			setFallbackSandboxDir(undefined);
			fallbackResolvedKeyRef.current = null;
			return;
		}

		const hasAgentSignals = Boolean(
			activeSession?.agentSessionId ||
				activeSession?.sdkSessionId ||
				sessionTaskId ||
				activeSession?.messages?.some((msg: any) => {
					const traceType = msg?.metadata?.trace?.type;
					if (traceType === "agent_task" || traceType === "tool_call") {
						return true;
					}
					const blocks = msg?.metadata?.blocks;
					return (
						Array.isArray(blocks) &&
						blocks.some((b: any) =>
							["agent_task", "tool_call", "image", "task_list"].includes(
								b?.type,
							),
						)
					);
				}),
		);
		if (!hasAgentSignals) {
			setFallbackSandboxDir(undefined);
			fallbackResolvedKeyRef.current = null;
			return;
		}

		const sandboxKey = String(
			activeSession?.agentSessionId || activeSessionId || "",
		).trim();
		if (!sandboxKey) {
			setFallbackSandboxDir(undefined);
			fallbackResolvedKeyRef.current = null;
			return;
		}
		if (fallbackResolvedKeyRef.current === sandboxKey) return;

		let cancelled = false;
		fallbackResolvedKeyRef.current = sandboxKey;
		void (async () => {
			try {
				const res = await getAgentSandboxDir(sandboxKey);
				if (!cancelled) {
					setFallbackSandboxDir(String(res?.path || "").trim() || undefined);
				}
			} catch (error) {
				if (!cancelled) {
					setFallbackSandboxDir(undefined);
					fallbackResolvedKeyRef.current = null;
				}
				console.warn(
					"[useSandboxFilesBinding] 兜底恢复 sandbox 目录失败:",
					error,
				);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [
		activeSession,
		activeSessionId,
		boundTask?.metadata?.sandboxDir,
		sessionSandboxDir,
		sessionTaskId,
	]);

	const sandboxDir = useMemo(() => {
		const fromTask = boundTask?.metadata?.sandboxDir as string | undefined;
		return fromTask || sessionSandboxDir || fallbackSandboxDir;
	}, [boundTask, fallbackSandboxDir, sessionSandboxDir]);

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
		refreshTimerRef.current = setInterval(() => {
			store.scanSandboxDir(sandboxDir);
		}, 5000);

		return () => {
			if (refreshTimerRef.current) {
				clearInterval(refreshTimerRef.current);
				refreshTimerRef.current = null;
			}
		};
	}, [isLiveBoundTask, sandboxDir, store]);

	return {
		sandboxDir,
		graphSource,
		isRefreshing,
		refreshFiles,
	};
}
