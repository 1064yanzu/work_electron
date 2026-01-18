import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	createAgentMessage,
	createAgentSession,
	deleteAgentSession,
	invokeLlm,
	invokeLlmStream,
	kbSearchChunks,
	type StreamChunk,
	updateAgentSession,
} from "@/features/workspace/ipc-api";
import {
	useActiveModelQuery,
	useAgentMessagesQuery,
	useAgentSessionsQuery,
} from "@/features/workspace/queries";
import { type DragPayload, useMouseDropZone } from "@/hooks/mouse-drag";
import { useIpc } from "@/hooks/useIpc";
import { cn } from "@/lib/utils";
import { ChatInput } from "./chat-input";
import { ChatMessageView } from "./chat-message";
import type { ChatMessage } from "./types";

export function CopilotSidebar({
	onOpenSettings,
}: {
	onOpenSettings: () => void;
}) {
	const { available } = useIpc();
	const activeModelQuery = useActiveModelQuery(available);

	const queryClient = useQueryClient();
	const sessionsQuery = useAgentSessionsQuery({
		enabled: available,
		status: "active",
		limit: 50,
	});
	const [sessionId, setSessionId] = useState<string | null>(() => {
		return localStorage.getItem("workbench.activeAgentSessionId");
	});
	const messagesQuery = useAgentMessagesQuery({
		enabled: available,
		sessionId,
		limit: 200,
	});

	const [viewMessages, setViewMessages] = useState<ChatMessage[]>([]);
	const [busy, setBusy] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const dropRef = useRef<HTMLDivElement>(null);
	const streamingAssistantIdRef = useRef<string | null>(null);
	const streamingTextRef = useRef<string>("");

	const activeModel = activeModelQuery.data;

	const scrollToBottom = useCallback(() => {
		queueMicrotask(() => {
			const el = scrollRef.current?.querySelector(
				"[data-radix-scroll-area-viewport]",
			);
			if (el) el.scrollTop = el.scrollHeight;
		});
	}, []);

	const activeSession = useMemo(() => {
		return (sessionsQuery.data ?? []).find((s) => s.id === sessionId) ?? null;
	}, [sessionId, sessionsQuery.data]);

	const contexts = useMemo(() => {
		const cfg = (activeSession?.config_json ?? {}) as {
			contexts?: Array<{
				kind?: string;
				id?: string;
				title?: string;
				content: string;
			}>;
		};
		return Array.isArray(cfg.contexts) ? cfg.contexts : [];
	}, [activeSession?.config_json]);

	const canSend = available && !!activeModel && !!sessionId && !busy;

	const header = useMemo(() => {
		if (!available) return "Copilot（仅 Electron 可用）";
		if (activeModelQuery.isLoading) return "Copilot（加载模型…）";
		if (!activeModel) return "Copilot（未设置模型）";
		return `Copilot（${activeModel}）`;
	}, [activeModel, activeModelQuery.isLoading, available]);

	useEffect(() => {
		if (!available) return;
		if (sessionId) return;
		if (sessionsQuery.isLoading) return;
		const first = sessionsQuery.data?.[0];
		if (first) {
			setSessionId(first.id);
			localStorage.setItem("workbench.activeAgentSessionId", first.id);
		}
	}, [available, sessionId, sessionsQuery.data, sessionsQuery.isLoading]);

	useEffect(() => {
		if (!available) return;
		if (!sessionId) return;
		if (messagesQuery.isLoading) return;
		if (!messagesQuery.data) return;

		const mapContent = (content_json: unknown) => {
			if (typeof content_json === "string") return content_json;
			if (content_json && typeof content_json === "object") {
				const candidate = content_json as { text?: unknown };
				if (typeof candidate.text === "string") return candidate.text;
			}
			return JSON.stringify(content_json);
		};

		const mapped: ChatMessage[] = messagesQuery.data.map((m) => ({
			id: m.id,
			role: m.role as ChatMessage["role"],
			content: mapContent(m.content_json),
			createdAt: m.created_at,
		}));

		setViewMessages([
			{
				id: "sys",
				role: "system",
				content:
					"你可以把这里当作工作台的 Copilot。输入 /settings 可打开设置，/new 新建会话。",
				createdAt: Date.now(),
			},
			...mapped,
		]);
		scrollToBottom();
	}, [
		available,
		messagesQuery.data,
		messagesQuery.isLoading,
		sessionId,
		scrollToBottom,
	]);

	useEffect(() => {
		if (!available) return;
		const off = window.electronAPI?.on?.(
			"llm-stream-chunk",
			(payload: unknown) => {
				const chunk = payload as StreamChunk;
				const assistantId = streamingAssistantIdRef.current;
				if (!assistantId) return;

				streamingTextRef.current += chunk.content ?? "";
				setViewMessages((prev) =>
					prev.map((m) =>
						m.id === assistantId
							? { ...m, content: streamingTextRef.current }
							: m,
					),
				);
				scrollToBottom();

				if (chunk.done) {
					const finalText = streamingTextRef.current;
					streamingAssistantIdRef.current = null;
					streamingTextRef.current = "";
					setBusy(false);

					if (!sessionId) return;
					createAgentMessage({
						session_id: sessionId,
						role: "assistant",
						content_json: { type: "text", text: finalText },
					}).finally(() => {
						queryClient.invalidateQueries({
							queryKey: ["agent_messages", sessionId],
						});
					});
				}
			},
		);
		return () => {
			off?.();
		};
	}, [available, queryClient, scrollToBottom, sessionId]);

	const isRecord = useCallback((v: unknown): v is Record<string, unknown> => {
		return !!v && typeof v === "object";
	}, []);

	const addContextFromSource = useCallback(
		async (payload: { id: string; title: string }) => {
			if (!available) return;
			if (!activeSession) return;
			const detail = await window.electronAPI?.invoke?.("get_source_detail", {
				id: payload.id,
			});
			const detailRecord = isRecord(detail) ? detail : null;
			const sourceVal = detailRecord ? detailRecord.source : undefined;
			const noteVal = detailRecord ? detailRecord.note : undefined;
			const sourceTitle =
				isRecord(sourceVal) && typeof sourceVal.title === "string"
					? sourceVal.title
					: undefined;
			const noteContent =
				isRecord(noteVal) && typeof noteVal.content === "string"
					? noteVal.content
					: "";

			const title = sourceTitle ?? payload.title;
			const body = noteContent.trim();
			const content = body ? `标题：${title}\n\n${body}` : `标题：${title}`;

			const next = [
				...contexts.filter(
					(c) => !(c.kind === "source" && c.id === payload.id),
				),
				{ kind: "source", id: payload.id, title, content },
			];

			const baseConfig =
				activeSession.config_json &&
				typeof activeSession.config_json === "object"
					? (activeSession.config_json as Record<string, unknown>)
					: {};

			await updateAgentSession({
				id: activeSession.id,
				config_json: { ...baseConfig, contexts: next },
			});
			await queryClient.invalidateQueries({ queryKey: ["agent_sessions"] });
		},
		[activeSession, available, contexts, isRecord, queryClient],
	);

	const onDrop = useCallback(
		(payload: DragPayload) => {
			if (payload.kind === "source") {
				addContextFromSource({ id: payload.id, title: payload.title });
			}
		},
		[addContextFromSource],
	);

	const { isOver, active: dragActive } = useMouseDropZone({
		ref: dropRef,
		onDrop,
	});

	return (
		<div
			ref={dropRef}
			className={cn(
				"relative flex h-full w-full flex-col",
				dragActive && "ring-1 ring-inset ring-primary/30",
				isOver && "ring-2 ring-inset ring-primary/60",
			)}
		>
			{dragActive && (
				<div
					className={cn(
						"pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-2xl",
						"border border-dashed border-primary/50 bg-primary/5 text-xs text-muted-foreground",
						isOver && "bg-primary/10",
					)}
				>
					松开以加入上下文
				</div>
			)}
			<div className="flex h-12 items-center gap-2 border-b border-border/60 px-4">
				<div className="text-sm font-semibold text-muted-foreground">
					{header}
				</div>
				<div className="ml-auto flex items-center gap-2">
					<Select
						value={sessionId ?? undefined}
						onValueChange={(value) => {
							setBusy(false);
							streamingAssistantIdRef.current = null;
							streamingTextRef.current = "";
							setSessionId(value);
							localStorage.setItem("workbench.activeAgentSessionId", value);
						}}
						disabled={!available}
					>
						<SelectTrigger className="h-8 w-[180px] text-xs">
							<SelectValue
								placeholder={available ? "选择会话" : "仅 Electron 可用"}
							/>
						</SelectTrigger>
						<SelectContent>
							{(sessionsQuery.data ?? []).map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.title?.trim() || s.id.slice(0, 8)}
								</SelectItem>
							))}
							{sessionsQuery.isLoading && (
								<div className="p-2 text-xs text-muted-foreground">加载中…</div>
							)}
						</SelectContent>
					</Select>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						disabled={!available}
						onClick={async () => {
							const s = await createAgentSession({
								title: "新会话",
								config_json: { contexts: [] },
							});
							await queryClient.invalidateQueries({
								queryKey: ["agent_sessions"],
							});
							setSessionId(s.id);
							localStorage.setItem("workbench.activeAgentSessionId", s.id);
						}}
					>
						<Plus className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						disabled={!available || !sessionId}
						onClick={async () => {
							if (!sessionId) return;
							await deleteAgentSession(sessionId);
							await queryClient.invalidateQueries({
								queryKey: ["agent_sessions"],
							});
							setSessionId(null);
							localStorage.removeItem("workbench.activeAgentSessionId");
						}}
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			</div>

			<ScrollArea className="flex-1 p-4" ref={scrollRef}>
				<div className="space-y-3">
					{viewMessages.map((m) => (
						<ChatMessageView key={m.id} message={m} />
					))}
				</div>
			</ScrollArea>

			<div className="border-t border-border/60 p-4">
				{contexts.length > 0 && (
					<div className="mb-3 flex flex-wrap gap-2">
						{contexts.map((c, idx) => (
							<button
								type="button"
								key={`${idx}:${c.title ?? ""}`}
								onClick={async () => {
									if (!activeSession) return;
									const next = contexts.filter((_, i) => i !== idx);
									const baseConfig =
										activeSession.config_json &&
										typeof activeSession.config_json === "object"
											? (activeSession.config_json as Record<string, unknown>)
											: {};
									await updateAgentSession({
										id: activeSession.id,
										config_json: { ...baseConfig, contexts: next },
									});
									await queryClient.invalidateQueries({
										queryKey: ["agent_sessions"],
									});
								}}
								className={cn(
									"rounded-full border border-border/60 bg-secondary/60 px-3 py-1 text-[11px] text-muted-foreground",
									"hover:bg-secondary/90",
								)}
							>
								{c.title?.trim() || "上下文"}
							</button>
						))}
					</div>
				)}
				<ChatInput
					disabled={!canSend}
					onOpenSettings={onOpenSettings}
					onNewSession={async () => {
						const s = await createAgentSession({
							title: "新会话",
							config_json: { contexts: [] },
						});
						await queryClient.invalidateQueries({
							queryKey: ["agent_sessions"],
						});
						setSessionId(s.id);
						localStorage.setItem("workbench.activeAgentSessionId", s.id);
					}}
					onClearContexts={async () => {
						if (!activeSession) return;
						const baseConfig =
							activeSession.config_json &&
							typeof activeSession.config_json === "object"
								? (activeSession.config_json as Record<string, unknown>)
								: {};
						await updateAgentSession({
							id: activeSession.id,
							config_json: { ...baseConfig, contexts: [] },
						});
						await queryClient.invalidateQueries({
							queryKey: ["agent_sessions"],
						});
					}}
					onSend={async (text) => {
						try {
							if (!activeModel || !sessionId) return;

							if (text.startsWith("/kb ")) {
								const q = text.slice(4).trim();
								if (!q) return;
								const userLocalId = crypto.randomUUID();
								setViewMessages((prev) => [
									...prev,
									{
										id: userLocalId,
										role: "user",
										content: text,
										createdAt: Date.now(),
									},
								]);
								scrollToBottom();

								await createAgentMessage({
									session_id: sessionId,
									role: "user",
									content_json: { type: "text", text },
								});

								const hits = await kbSearchChunks({ query: q, limit: 8 });
								const content = hits.length
									? hits
											.map(
												(h, idx) =>
													`${idx + 1}. score=${h.score.toFixed(3)}\n${h.snippet || h.content}`,
											)
											.join("\n\n")
									: "未找到结果。";

								const assistantLocalId = crypto.randomUUID();
								setViewMessages((prev) => [
									...prev,
									{
										id: assistantLocalId,
										role: "assistant",
										content,
										createdAt: Date.now(),
									},
								]);
								scrollToBottom();

								await createAgentMessage({
									session_id: sessionId,
									role: "assistant",
									content_json: {
										type: "kb_search",
										query: q,
										text: content,
										hits,
									},
								});
								queryClient.invalidateQueries({
									queryKey: ["agent_messages", sessionId],
								});
								return;
							}

							const userLocalId = crypto.randomUUID();
							setViewMessages((prev) => [
								...prev,
								{
									id: userLocalId,
									role: "user",
									content: text,
									createdAt: Date.now(),
								},
							]);
							scrollToBottom();

							await createAgentMessage({
								session_id: sessionId,
								role: "user",
								content_json: { type: "text", text },
							});

							const assistantLocalId = crypto.randomUUID();
							streamingAssistantIdRef.current = assistantLocalId;
							streamingTextRef.current = "";
							setViewMessages((prev) => [
								...prev,
								{
									id: assistantLocalId,
									role: "assistant",
									content: "",
									createdAt: Date.now(),
								},
							]);
							scrollToBottom();

							const contextStrings = contexts.map((c) => c.content);

							setBusy(true);
							const started = await invokeLlmStream({
								model: activeModel,
								prompt: text,
								context: contextStrings.length ? contextStrings : undefined,
							});

							if (!started.started) {
								const result = await invokeLlm({
									model: activeModel,
									prompt: text,
									context: contextStrings.length ? contextStrings : undefined,
								});
								streamingAssistantIdRef.current = null;
								streamingTextRef.current = "";
								setViewMessages((prev) =>
									prev.map((m) =>
										m.id === assistantLocalId
											? { ...m, content: result.content }
											: m,
									),
								);
								await createAgentMessage({
									session_id: sessionId,
									role: "assistant",
									content_json: { type: "text", text: result.content },
								});
								setBusy(false);
								queryClient.invalidateQueries({
									queryKey: ["agent_messages", sessionId],
								});
							}
						} catch (e) {
							const message = e instanceof Error ? e.message : String(e);
							const assistantId = streamingAssistantIdRef.current;
							streamingAssistantIdRef.current = null;
							streamingTextRef.current = "";
							setViewMessages((prev) =>
								prev.map((m) =>
									m.id === assistantId
										? { ...m, content: `调用失败：${message}` }
										: m,
								),
							);
							if (sessionId) {
								await createAgentMessage({
									session_id: sessionId,
									role: "assistant",
									content_json: { type: "text", text: `调用失败：${message}` },
								});
								queryClient.invalidateQueries({
									queryKey: ["agent_messages", sessionId],
								});
							}
							setBusy(false);
						} finally {
							if (sessionId)
								queryClient.invalidateQueries({
									queryKey: ["agent_messages", sessionId],
								});
						}
					}}
				/>
				<div className="mt-2 text-center text-[10px] text-muted-foreground">
					AI 可能生成不准确信息，请自行核对。
				</div>
			</div>
		</div>
	);
}
