import {
	Check,
	ChevronDown,
	ChevronRight,
	Copy,
	Eye,
	Pin,
	PinOff,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ToolArtifact, ToolCall } from "../../../lib/agent/types";
import { EVENTS, events } from "../../../lib/events";
import { cn } from "../../../lib/utils";
import type { ExecutionGraphSource } from "./types";
import { formatDuration, getSubagentType, safeJson } from "./utils";

interface GraphInspectorPanelProps {
	selectedNodeId: string;
	source: ExecutionGraphSource;
	taskNodeId: string;
	toolCallById: Map<string, ToolCall>;
	artifactByNodeId: Map<string, ToolArtifact>;
	onClose: () => void;
	onOpenArtifact: (filePath: string) => void;
	pinned: boolean;
	onTogglePin: () => void;
	onSelectNode?: (nodeId: string) => void;
}

export function GraphInspectorPanel({
	selectedNodeId,
	source,
	taskNodeId,
	toolCallById,
	artifactByNodeId,
	onClose,
	onOpenArtifact,
	pinned,
	onTogglePin,
	onSelectNode,
}: GraphInspectorPanelProps) {
	const [collapsed, setCollapsed] = useState(false);
	const [copiedTag, setCopiedTag] = useState<"" | "input" | "output" | "path">(
		"",
	);
	const selectedToolCall = toolCallById.get(selectedNodeId);
	const selectedArtifact = artifactByNodeId.get(selectedNodeId);
	const isTaskSelected = selectedNodeId === taskNodeId;

	const artifactsForTool = useMemo(() => {
		if (!selectedToolCall) return [];
		return source.artifacts.filter(
			(a) =>
				String(a.metadata?.toolCallId || "").trim() === selectedToolCall.id,
		);
	}, [selectedToolCall, source.artifacts]);

	// 当选中子代理节点时，找出同组的所有子代理（用于 Agent 切换器）
	const siblingSubagents = useMemo(() => {
		if (!selectedToolCall) return [];
		const isSubagent = Boolean(getSubagentType(selectedToolCall));
		if (!isSubagent) return [];

		const allToolCalls = source.toolCalls || [];
		// 按 startedAt 排序
		const sorted = [...allToolCalls].sort((a, b) => {
			const ta =
				typeof a.startedAt === "number" ? a.startedAt : Number.MAX_SAFE_INTEGER;
			const tb =
				typeof b.startedAt === "number" ? b.startedAt : Number.MAX_SAFE_INTEGER;
			return ta - tb;
		});

		// 找到当前选中的子代理在排序列表中的位置
		const currentIdx = sorted.findIndex((tc) => tc.id === selectedToolCall.id);
		if (currentIdx < 0) return [];

		const currentStart =
			typeof selectedToolCall.startedAt === "number"
				? selectedToolCall.startedAt
				: null;
		if (currentStart === null) return [];

		// 收集同组子代理（startedAt 差值 < 2000ms 的连续子代理）
		const group: ToolCall[] = [selectedToolCall];

		// 向前搜索
		for (let i = currentIdx - 1; i >= 0; i--) {
			const tc = sorted[i]!;
			if (!getSubagentType(tc)) break;
			const start = typeof tc.startedAt === "number" ? tc.startedAt : null;
			if (start === null || Math.abs(start - currentStart) >= 2000) break;
			group.unshift(tc);
		}
		// 向后搜索
		for (let i = currentIdx + 1; i < sorted.length; i++) {
			const tc = sorted[i]!;
			if (!getSubagentType(tc)) break;
			const start = typeof tc.startedAt === "number" ? tc.startedAt : null;
			if (start === null || Math.abs(start - currentStart) >= 2000) break;
			group.push(tc);
		}

		// 只有 2+ 个才显示切换器
		return group.length >= 2 ? group : [];
	}, [selectedToolCall, source.toolCalls]);

	const switcherRef = useRef<HTMLDivElement>(null);

	const title = selectedToolCall
		? selectedToolCall.name
		: selectedArtifact
			? selectedArtifact.title
			: isTaskSelected
				? source.title
				: "详情";

	const subtitle = selectedToolCall
		? selectedToolCall.status
		: selectedArtifact
			? selectedArtifact.type
			: source.status;

	const copy = useCallback(
		async (tag: "input" | "output" | "path", text: string) => {
			try {
				await navigator.clipboard.writeText(text);
				setCopiedTag(tag);
			} catch {
				// noop
			}
		},
		[],
	);

	useEffect(() => {
		if (!copiedTag) return;
		const t = setTimeout(() => setCopiedTag(""), 1200);
		return () => clearTimeout(t);
	}, [copiedTag]);

	useEffect(() => {
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			if (pinned) return;
			onClose();
		};
		window.addEventListener("keydown", handleEsc);
		return () => window.removeEventListener("keydown", handleEsc);
	}, [onClose, pinned]);

	return (
		<div
			className={cn(
				"absolute right-3 top-[4.5rem] z-20 pointer-events-auto transition-all duration-200",
				collapsed
					? "w-[min(280px,calc(100%-1.5rem))]"
					: "w-[min(420px,calc(100%-1.5rem))] bottom-3",
			)}
		>
			<div className="h-full rounded-3xl bg-surface/90/70 backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_18px_60px_-35px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.02] dark:ring-white/[0.06] overflow-hidden flex flex-col animate-in slide-in-from-right-3 fade-in duration-200">
				<div className="px-4 py-3 border-b border-border/60 flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="text-sm font-semibold text-text-primary truncate">
							{title}
						</div>
						{subtitle ? (
							<div className="text-[12px] text-text-muted mt-0.5 truncate">
								{subtitle}
							</div>
						) : null}
					</div>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => setCollapsed((v) => !v)}
							className="p-2 rounded-xl text-text-light hover:text-text-secondary dark:hover:text-zinc-200 hover:bg-warm-200/80/50 transition-colors"
							title={collapsed ? "展开" : "收起"}
						>
							{collapsed ? (
								<ChevronDown className="w-4 h-4" />
							) : (
								<ChevronRight className="w-4 h-4" />
							)}
						</button>
						<button
							type="button"
							onClick={onTogglePin}
							className={cn(
								"p-2 rounded-xl transition-colors",
								pinned
									? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/20"
									: "text-text-light hover:text-text-secondary dark:hover:text-zinc-200 hover:bg-warm-200/80/50",
							)}
							title={pinned ? "取消固定" : "固定详情"}
						>
							{pinned ? (
								<PinOff className="w-4 h-4" />
							) : (
								<Pin className="w-4 h-4" />
							)}
						</button>
						<button
							type="button"
							onClick={onClose}
							className="p-2 rounded-xl text-text-light hover:text-text-secondary dark:hover:text-zinc-200 hover:bg-warm-200/80/50 transition-colors"
							title="关闭"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>

				{collapsed ? null : (
					<div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 space-y-4">
						{selectedToolCall ? (
							<>
								<div className="flex items-center gap-2 flex-wrap">
									<button
										type="button"
										onClick={() => {
											events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
												toolCallId: selectedToolCall.id,
												source: "graph",
											});
										}}
										className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-dark-muted text-white text-xs font-medium hover:opacity-90 transition-opacity"
									>
										<ChevronRight className="w-4 h-4" />
										定位右栏
									</button>
									<button
										type="button"
										onClick={() =>
											copy("input", safeJson(selectedToolCall.input))
										}
										className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-warm-200 text-text-secondary dark:text-zinc-200 text-xs font-medium hover:bg-warm-300/70 dark:hover:bg-cream-700/60 transition-colors"
									>
										{copiedTag === "input" ? (
											<Check className="w-4 h-4" />
										) : (
											<Copy className="w-4 h-4" />
										)}
										{copiedTag === "input" ? "已复制" : "复制输入"}
									</button>
									<button
										type="button"
										onClick={() =>
											copy("output", safeJson(selectedToolCall.output))
										}
										className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-warm-200 text-text-secondary dark:text-zinc-200 text-xs font-medium hover:bg-warm-300/70 dark:hover:bg-cream-700/60 transition-colors"
									>
										{copiedTag === "output" ? (
											<Check className="w-4 h-4" />
										) : (
											<Copy className="w-4 h-4" />
										)}
										{copiedTag === "output" ? "已复制" : "复制输出"}
									</button>
								</div>

								{artifactsForTool.length > 0 ? (
									<div className="rounded-2xl bg-warm-50/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
										<div className="px-3 py-2 text-[11px] font-medium text-text-muted border-b border-border/60">
											关联产物
										</div>
										<div className="p-2 space-y-1">
											{artifactsForTool.map((artifact) =>
												artifact.url ? (
													<button
														key={artifact.id}
														type="button"
														onClick={() => onOpenArtifact(artifact.url!)}
														className="w-full text-left inline-flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-surface/70/60 text-xs text-text-secondary dark:text-zinc-200"
													>
														<span className="truncate mr-2">
															{artifact.title}
														</span>
														<Eye className="w-3.5 h-3.5 shrink-0" />
													</button>
												) : null,
											)}
										</div>
									</div>
								) : null}

								<div className="rounded-2xl bg-warm-50/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
									<div className="px-3 py-2 text-[11px] font-medium text-text-muted border-b border-border/60">
										输入
									</div>
									<pre className="px-3 py-2 text-[11px] text-text-secondary dark:text-zinc-200 whitespace-pre-wrap break-words">
										{safeJson(selectedToolCall.input)}
									</pre>
								</div>

								<div className="rounded-2xl bg-warm-50/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
									<div className="px-3 py-2 text-[11px] font-medium text-text-muted border-b border-border/60">
										输出
									</div>
									<pre className="px-3 py-2 text-[11px] text-text-secondary dark:text-zinc-200 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
										{safeJson(selectedToolCall.output)}
									</pre>
								</div>

								<div className="text-[11px] text-text-light">
									{selectedToolCall.duration
										? `耗时 ${formatDuration(selectedToolCall.duration)}`
										: ""}
								</div>
							</>
						) : selectedArtifact ? (
							<>
								<div className="rounded-2xl bg-warm-50/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
									<div className="px-3 py-2 text-[11px] font-medium text-text-muted border-b border-border/60">
										路径
									</div>
									<div className="px-3 py-2 text-[12px] text-text-secondary dark:text-zinc-200 break-words">
										{selectedArtifact.url || "—"}
									</div>
								</div>
								{selectedArtifact.url ? (
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => onOpenArtifact(selectedArtifact.url!)}
											className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-dark-muted text-white text-xs font-medium hover:opacity-90 transition-opacity"
										>
											<Eye className="w-4 h-4" />
											打开预览
										</button>
										<button
											type="button"
											onClick={() => copy("path", selectedArtifact.url!)}
											className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-warm-200 text-text-secondary dark:text-zinc-200 text-xs font-medium hover:bg-warm-300/70 dark:hover:bg-cream-700/60 transition-colors"
										>
											{copiedTag === "path" ? (
												<Check className="w-4 h-4" />
											) : (
												<Copy className="w-4 h-4" />
											)}
											{copiedTag === "path" ? "已复制" : "复制路径"}
										</button>
									</div>
								) : null}
							</>
						) : isTaskSelected ? (
							<div className="rounded-2xl bg-warm-50/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
								<div className="px-3 py-2 text-[11px] font-medium text-text-muted border-b border-border/60">
									任务描述
								</div>
								<div className="px-3 py-2 text-[12px] text-text-secondary dark:text-zinc-200 break-words">
									{source.subtitle || "—"}
								</div>
							</div>
						) : (
							<div className="text-sm text-text-muted">未找到对应数据。</div>
						)}
					</div>
				)}

				{/* 子代理切换器 — 当选中子代理且同组有 2+ 个时显示 */}
				{!collapsed && siblingSubagents.length >= 2 && onSelectNode ? (
					<div className="border-t border-border/60 px-3 py-2.5">
						<div className="text-[11px] font-medium text-text-muted mb-2">
							同组 Agent ({siblingSubagents.length})
						</div>
						<div
							ref={switcherRef}
							className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5"
						>
							{siblingSubagents.map((tc, idx) => {
								const isActive = tc.id === selectedNodeId;
								const statusColor =
									tc.status === "completed"
										? "bg-success"
										: tc.status === "running"
											? "bg-primary animate-pulse"
											: tc.status === "error"
												? "bg-error"
												: "bg-cream-500";
								return (
									<button
										key={tc.id}
										type="button"
										onClick={() => onSelectNode(tc.id)}
										className={cn(
											"shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors",
											isActive
												? "bg-primary/15 text-primary ring-1 ring-primary/25"
												: "bg-warm-200/60 text-text-secondary hover:bg-warm-300/70 dark:hover:bg-cream-700/50",
										)}
									>
										<span
											className={cn(
												"w-1.5 h-1.5 rounded-full shrink-0",
												statusColor,
											)}
										/>
										#{idx + 1}
									</button>
								);
							})}
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
