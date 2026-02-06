import "@xyflow/react/dist/style.css";

import {
	Background,
	BackgroundVariant,
	Controls,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
} from "@xyflow/react";
import {
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Loader2,
	Search,
	Sparkles,
	X,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { buildExecutionGraph } from "./graph/buildExecutionGraph";
import { GraphInspectorPanel } from "./graph/GraphInspectorPanel";
import { nodeTypes } from "./graph/GraphNodes";
import {
	type ExecutionGraphSource,
	type GraphFilter,
	type ExecutionGraphNode,
} from "./graph/types";
import { useGraphFocus } from "./graph/useGraphFocus";
import { useGraphSelection } from "./graph/useGraphSelection";

function isTypingElement(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName.toLowerCase();
	return (
		tag === "input" ||
		tag === "textarea" ||
		tag === "select" ||
		target.isContentEditable
	);
}

function EmptyGraph() {
	return (
		<div className="flex-1 flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-900">
			<div className="text-center space-y-2 max-w-md">
				<div className="mx-auto w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center">
					<Sparkles className="w-6 h-6 text-zinc-400" />
				</div>
				<div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
					暂无运行任务
				</div>
				<div className="text-xs text-zinc-400 dark:text-zinc-500">
					开始托管任务后，这里会展示运行图。
				</div>
			</div>
		</div>
	);
}

function getDefaultFocusIds(
	nodes: ExecutionGraphNode[],
	taskNodeId: string | null,
	filter: GraphFilter,
): string[] {
	const toolNodes = nodes.filter((n) => n.type === "tool");
	const artifactNodes = nodes.filter((n) => n.type === "artifact");
	if (filter === "running") {
		const ids = toolNodes
			.filter(
				(n) =>
					(n.data as any)?.status === "running" ||
					(n.data as any)?.status === "pending",
			)
			.map((n) => n.id);
		if (ids.length > 0) return ids;
	}
	if (filter === "error") {
		const ids = toolNodes
			.filter((n) => (n.data as any)?.status === "error")
			.map((n) => n.id);
		if (ids.length > 0) return ids;
	}
	if (filter === "artifact") {
		const ids = artifactNodes.map((n) => n.id);
		if (ids.length > 0) return ids;
	}

	const running = toolNodes
		.filter((n) => (n.data as any)?.status === "running")
		.map((n) => n.id);
	if (running.length > 0) return running;
	return taskNodeId ? [taskNodeId] : [];
}

function FilterButton({
	active,
	label,
	onClick,
	icon,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
	icon: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors",
				active
					? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-black/[0.06] dark:border-white/[0.08]"
					: "bg-white/80 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-300 border-black/[0.06] dark:border-white/[0.08] hover:bg-white dark:hover:bg-zinc-900/70",
			)}
		>
			{icon}
			{label}
		</button>
	);
}

function ExecutionGraphInner({
	source,
	onOpenArtifact,
	filter = "all",
	onFilterChange,
	searchQuery = "",
	onSearchQueryChange,
	pinnedInspector = false,
	onPinnedInspectorChange,
}: {
	source: ExecutionGraphSource | null;
	onOpenArtifact: (filePath: string) => void;
	filter?: GraphFilter;
	onFilterChange?: (filter: GraphFilter) => void;
	searchQuery?: string;
	onSearchQueryChange?: (query: string) => void;
	pinnedInspector?: boolean;
	onPinnedInspectorChange?: (value: boolean) => void;
}) {
	const graphBuild = useMemo(() => buildExecutionGraph(source), [source]);
	const graph = useMemo(
		() => ({ nodes: graphBuild.nodes, edges: graphBuild.edges }),
		[graphBuild.edges, graphBuild.nodes],
	);

	const toolCalls = source?.toolCalls || [];
	const artifacts = source?.artifacts || [];

	const toolCallById = useMemo(() => {
		const map = new Map<string, any>();
		for (const tc of toolCalls) map.set(tc.id, tc);
		return map;
	}, [toolCalls]);

	const artifactByNodeId = useMemo(() => {
		const map = new Map<string, any>();
		for (const a of artifacts) map.set(`artifact-${a.id}`, a);
		return map;
	}, [artifacts]);

	const defaultFocusIds = useMemo(
		() => getDefaultFocusIds(graph.nodes, graphBuild.taskNodeId, filter),
		[filter, graph.nodes, graphBuild.taskNodeId],
	);

	const { selectedNodeId, setSelectedNodeId, onNodeClick, onPaneClick } =
		useGraphSelection({
			onOpenArtifact,
			isInspectorPinned: pinnedInspector,
		});

	const {
		follow,
		setFollow,
		searchMatchedNodeIds,
		searchIndex,
		focusFirstSearchMatch,
		focusNextSearchMatch,
	} = useGraphFocus({
		nodes: graph.nodes,
		defaultFocusIds,
		toolCallById,
		onSelectNode: setSelectedNodeId,
		searchQuery,
	});
	const searchInputRef = useRef<HTMLInputElement>(null);

	const clearSearch = useCallback(() => {
		onSearchQueryChange?.("");
		searchInputRef.current?.focus();
	}, [onSearchQueryChange]);

	useEffect(() => {
		setSelectedNodeId(null);
	}, [source?.id, setSelectedNodeId]);

	useEffect(() => {
		const handleShortcuts = (e: KeyboardEvent) => {
			if (isTypingElement(e.target)) return;
			if (e.key === "/") {
				e.preventDefault();
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
				return;
			}
			if (e.altKey && e.key.toLowerCase() === "f") {
				e.preventDefault();
				setFollow((v) => !v);
			}
		};
		window.addEventListener("keydown", handleShortcuts);
		return () => window.removeEventListener("keydown", handleShortcuts);
	}, [setFollow]);

	if (!source) {
		return <EmptyGraph />;
	}

	return (
		<div className="flex-1 relative overflow-hidden bg-gradient-to-br from-zinc-50 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.10),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(16,185,129,0.08),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.14),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(16,185,129,0.10),transparent_55%)]" />

			<div className="absolute left-4 top-4 z-20 flex items-center gap-2 pointer-events-auto">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
					<input
						ref={searchInputRef}
						type="text"
						value={searchQuery}
						onChange={(e) => onSearchQueryChange?.(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								focusNextSearchMatch(e.shiftKey ? -1 : 1);
								return;
							}
							if (e.key === "Escape") {
								e.preventDefault();
								if (searchQuery.trim()) {
									clearSearch();
								} else {
									searchInputRef.current?.blur();
								}
							}
						}}
						placeholder="搜索节点..."
						className="w-56 pl-8 pr-8 py-2 text-xs rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/85 dark:bg-zinc-950/70 backdrop-blur-xl text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400"
					/>
					{searchQuery.trim() ? (
						<button
							type="button"
							onClick={clearSearch}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70 transition-colors"
							title="清空搜索"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					) : null}
				</div>
				{searchQuery.trim() ? (
					<div className="inline-flex items-center gap-1 bg-white/85 dark:bg-zinc-950/70 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl px-1.5 py-1.5 text-xs">
						<button
							type="button"
							onClick={focusFirstSearchMatch}
							disabled={searchMatchedNodeIds.length === 0}
							className="inline-flex items-center gap-1 px-2 py-1 rounded-xl text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
							title="定位第一个匹配项"
						>
							定位
						</button>
						<button
							type="button"
							onClick={() => focusNextSearchMatch(-1)}
							disabled={searchMatchedNodeIds.length === 0}
							className="p-1 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
							title="上一个匹配"
						>
							<ChevronUp className="w-3.5 h-3.5" />
						</button>
						<button
							type="button"
							onClick={() => focusNextSearchMatch(1)}
							disabled={searchMatchedNodeIds.length === 0}
							className="p-1 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
							title="下一个匹配"
						>
							<ChevronRight className="w-3.5 h-3.5" />
						</button>
						<span className="px-1.5 text-zinc-500 dark:text-zinc-400 tabular-nums">
							{searchMatchedNodeIds.length === 0
								? "0/0"
								: `${searchIndex + 1}/${searchMatchedNodeIds.length}`}
						</span>
					</div>
				) : null}
			</div>

			<div className="absolute right-4 top-4 z-20 flex items-center gap-2 pointer-events-auto">
				<FilterButton
					active={filter === "all"}
					label="全部"
					onClick={() => onFilterChange?.("all")}
					icon={<Sparkles className="w-3.5 h-3.5" />}
				/>
				<FilterButton
					active={filter === "running"}
					label="运行中"
					onClick={() => onFilterChange?.("running")}
					icon={<Loader2 className="w-3.5 h-3.5" />}
				/>
				<FilterButton
					active={filter === "error"}
					label="失败"
					onClick={() => onFilterChange?.("error")}
					icon={<XCircle className="w-3.5 h-3.5" />}
				/>
				<FilterButton
					active={filter === "artifact"}
					label="产物"
					onClick={() => onFilterChange?.("artifact")}
					icon={<Sparkles className="w-3.5 h-3.5" />}
				/>
				<button
					type="button"
					onClick={() => setFollow((v) => !v)}
					className={cn(
						"inline-flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-medium border backdrop-blur-xl transition-all",
						"shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
						follow
							? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-black/[0.06] dark:border-white/[0.08]"
							: "bg-white/85 dark:bg-zinc-950/60 text-zinc-700 dark:text-zinc-200 border-black/[0.06] dark:border-white/[0.08] hover:bg-white dark:hover:bg-zinc-900/70",
					)}
					title={follow ? "正在跟随运行节点（Alt+F）" : "暂停自动聚焦（Alt+F）"}
				>
					{follow ? (
						<ChevronRight className="w-4 h-4" />
					) : (
						<ChevronLeft className="w-4 h-4" />
					)}
					{follow ? "跟随中" : "手动浏览"}
				</button>
			</div>

			<ReactFlow
				nodes={graph.nodes}
				edges={graph.edges}
				nodeTypes={nodeTypes as any}
				onNodeClick={onNodeClick}
				onPaneClick={onPaneClick}
				onMoveStart={() => setFollow(false)}
				onlyRenderVisibleElements
				nodesConnectable={false}
				fitView
				fitViewOptions={{ padding: 0.35, minZoom: 0.15, maxZoom: 1.05 }}
				minZoom={0.1}
				maxZoom={1.2}
				className="relative z-10"
				proOptions={{ hideAttribution: true }}
			>
				<Background
					variant={BackgroundVariant.Dots}
					gap={24}
					size={1}
					color="rgba(148,163,184,0.25)"
				/>
				<Controls
					position="bottom-left"
					showInteractive={false}
					className="!bg-white/70 dark:!bg-zinc-950/40 !backdrop-blur-xl !border !border-black/[0.06] dark:!border-white/[0.08] !rounded-2xl !shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]"
				/>
				<MiniMap
					position="bottom-right"
					zoomable
					pannable
					className="!bg-white/70 dark:!bg-zinc-950/40 !backdrop-blur-xl !border !border-black/[0.06] dark:!border-white/[0.08] !rounded-2xl !shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]"
				/>
			</ReactFlow>

			{selectedNodeId ? (
				<GraphInspectorPanel
					selectedNodeId={selectedNodeId}
					source={source}
					taskNodeId={graphBuild.taskNodeId || `task-${source.id}`}
					toolCallById={toolCallById}
					artifactByNodeId={artifactByNodeId}
					onClose={() => setSelectedNodeId(null)}
					onOpenArtifact={onOpenArtifact}
					pinned={pinnedInspector}
					onTogglePin={() => onPinnedInspectorChange?.(!pinnedInspector)}
				/>
			) : null}
		</div>
	);
}

export function ExecutionGraph({
	source,
	onOpenArtifact,
	filter,
	onFilterChange,
	searchQuery,
	onSearchQueryChange,
	pinnedInspector,
	onPinnedInspectorChange,
}: {
	source: ExecutionGraphSource | null;
	onOpenArtifact: (filePath: string) => void;
	filter?: GraphFilter;
	onFilterChange?: (filter: GraphFilter) => void;
	searchQuery?: string;
	onSearchQueryChange?: (query: string) => void;
	pinnedInspector?: boolean;
	onPinnedInspectorChange?: (value: boolean) => void;
}) {
	return (
		<ReactFlowProvider>
			<ExecutionGraphInner
				source={source}
				onOpenArtifact={onOpenArtifact}
				filter={filter}
				onFilterChange={onFilterChange}
				searchQuery={searchQuery}
				onSearchQueryChange={onSearchQueryChange}
				pinnedInspector={pinnedInspector}
				onPinnedInspectorChange={onPinnedInspectorChange}
			/>
		</ReactFlowProvider>
	);
}

export type { ExecutionGraphSource, GraphFilter };
