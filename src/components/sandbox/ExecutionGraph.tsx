import "@xyflow/react/dist/style.css";

import {
	Background,
	BackgroundVariant,
	Controls,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
} from "@xyflow/react";
import { Sparkles } from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { buildExecutionGraph } from "./graph/buildExecutionGraph";
import { GraphInspectorPanel } from "./graph/GraphInspectorPanel";
import { nodeTypes } from "./graph/GraphNodes";
import { GraphTopToolbar } from "./graph/GraphTopToolbar";
import {
	type ArtifactClickBehavior,
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

function ExecutionGraphInner({
	source,
	onOpenArtifact,
	filter = "all",
	onFilterChange,
	searchQuery = "",
	onSearchQueryChange,
	pinnedInspector = false,
	onPinnedInspectorChange,
	defaultFollow = true,
	onFollowChange,
	artifactClickBehavior = "select_only",
	density = "comfortable",
}: {
	source: ExecutionGraphSource | null;
	onOpenArtifact: (filePath: string) => void;
	filter?: GraphFilter;
	onFilterChange?: (filter: GraphFilter) => void;
	searchQuery?: string;
	onSearchQueryChange?: (query: string) => void;
	pinnedInspector?: boolean;
	onPinnedInspectorChange?: (value: boolean) => void;
	defaultFollow?: boolean;
	onFollowChange?: (value: boolean) => void;
	artifactClickBehavior?: ArtifactClickBehavior;
	density?: "comfortable" | "compact";
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

	const {
		selectedNodeId,
		setSelectedNodeId,
		onNodeClick,
		onNodeDoubleClick,
		onPaneClick,
	} = useGraphSelection({
		onOpenArtifact,
		isInspectorPinned: pinnedInspector,
		artifactClickBehavior,
	});
	const [follow, setFollow] = useState(defaultFollow);

	const {
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
		follow,
	});
	const searchInputRef = useRef<HTMLInputElement>(null);

	const updateFollow = useCallback(
		(next: boolean | ((value: boolean) => boolean)) => {
			setFollow((prev) => {
				const resolved = typeof next === "function" ? next(prev) : next;
				onFollowChange?.(resolved);
				return resolved;
			});
		},
		[onFollowChange],
	);

	const clearSearch = useCallback(() => {
		onSearchQueryChange?.("");
		searchInputRef.current?.focus();
	}, [onSearchQueryChange]);
	const handleSearchInputKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLInputElement>) => {
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
		},
		[clearSearch, focusNextSearchMatch, searchQuery],
	);

	useEffect(() => {
		setSelectedNodeId(null);
	}, [source?.id, setSelectedNodeId]);

	useEffect(() => {
		setFollow(defaultFollow);
	}, [defaultFollow]);

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
				updateFollow((v) => !v);
			}
		};
		window.addEventListener("keydown", handleShortcuts);
		return () => window.removeEventListener("keydown", handleShortcuts);
	}, [updateFollow]);

	if (!source) {
		return <EmptyGraph />;
	}

	return (
		<div className="flex-1 relative overflow-hidden bg-gradient-to-br from-zinc-50 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(217,108,70,0.11),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(82,94,111,0.08),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(224,123,82,0.16),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(113,125,145,0.12),transparent_55%)]" />
			<GraphTopToolbar
				searchInputRef={searchInputRef}
				searchQuery={searchQuery}
				onSearchQueryChange={(value) => onSearchQueryChange?.(value)}
				onSearchInputKeyDown={handleSearchInputKeyDown}
				onClearSearch={clearSearch}
				searchMatchedNodeCount={searchMatchedNodeIds.length}
				searchIndex={searchIndex}
				onFocusFirstSearchMatch={focusFirstSearchMatch}
				onFocusPreviousSearchMatch={() => focusNextSearchMatch(-1)}
				onFocusNextSearchMatch={() => focusNextSearchMatch(1)}
				filter={filter}
				onFilterChange={(value) => onFilterChange?.(value)}
				follow={follow}
				density={density}
				onToggleFollow={() => updateFollow((v) => !v)}
			/>

			<ReactFlow
				nodes={graph.nodes}
				edges={graph.edges}
				nodeTypes={nodeTypes as any}
				onNodeClick={onNodeClick}
				onNodeDoubleClick={onNodeDoubleClick}
				onPaneClick={onPaneClick}
				onMoveStart={() => updateFollow(false)}
				onlyRenderVisibleElements
				nodesConnectable={false}
				fitView
				fitViewOptions={{ padding: 0.28, minZoom: 0.2, maxZoom: 1.2 }}
				minZoom={0.16}
				maxZoom={1.35}
				className="relative z-10"
				proOptions={{ hideAttribution: true }}
			>
				<Background
					variant={BackgroundVariant.Dots}
					gap={20}
					size={1}
					color="rgba(148,163,184,0.25)"
				/>
				<Controls
					position="bottom-left"
					showInteractive={false}
					className="!bg-white/70 dark:!bg-zinc-950/40 !backdrop-blur-xl !border !border-black/[0.06] dark:!border-white/[0.08] !rounded-2xl !shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]"
				/>
				{selectedNodeId ? null : (
					<MiniMap
						position="bottom-right"
						zoomable
						pannable
						className="!bg-white/70 dark:!bg-zinc-950/40 !backdrop-blur-xl !border !border-black/[0.06] dark:!border-white/[0.08] !rounded-2xl !shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]"
					/>
				)}
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
	defaultFollow,
	onFollowChange,
	artifactClickBehavior,
	density,
}: {
	source: ExecutionGraphSource | null;
	onOpenArtifact: (filePath: string) => void;
	filter?: GraphFilter;
	onFilterChange?: (filter: GraphFilter) => void;
	searchQuery?: string;
	onSearchQueryChange?: (query: string) => void;
	pinnedInspector?: boolean;
	onPinnedInspectorChange?: (value: boolean) => void;
	defaultFollow?: boolean;
	onFollowChange?: (value: boolean) => void;
	artifactClickBehavior?: ArtifactClickBehavior;
	density?: "comfortable" | "compact";
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
				defaultFollow={defaultFollow}
				onFollowChange={onFollowChange}
				artifactClickBehavior={artifactClickBehavior}
				density={density}
			/>
		</ReactFlowProvider>
	);
}

export type { ArtifactClickBehavior, ExecutionGraphSource, GraphFilter };
