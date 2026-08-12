import "@xyflow/react/dist/style.css";

import {
	Background,
	BackgroundVariant,
	Controls,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
} from "@xyflow/react";
import { Workflow } from "lucide-react";
import {
	memo,
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
	type ExecutionGraphBuild,
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
		<div className="flex-1 flex flex-col items-center justify-center bg-warm-50">
			<div className="text-center space-y-2 max-w-md">
				<div className="mx-auto w-12 h-12 rounded-2xl bg-surface ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center">
					<Workflow className="w-6 h-6 text-text-light" />
				</div>
				<div className="text-sm font-medium text-text-secondary">
					暂无运行任务
				</div>
				<div className="text-xs text-text-light">
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
	// ---- 布局缓存：拓扑（节点/边 id 序列）不变时不重跑布局，仅原位 patch ----
	// buildExecutionGraph 每次都产出全新的 node/edge 对象；流式期间大多数 tick
	// 只是某个节点 status/摘要变化，拓扑并没有变。这里按「有序 id 序列」做缓存键：
	// 键相同 ⇒ 复用旧节点对象（位置引用稳定、图不跳动，ReactFlow 对未变节点零重渲染），
	// 只有 data 真正变化的节点才换新对象；拓扑变化才整体接受新布局。
	const layoutCacheRef = useRef<{
		topoKey: string;
		build: ExecutionGraphBuild;
	} | null>(null);
	const graphBuild = useMemo(() => {
		const built = buildExecutionGraph(source);
		const topoKey = `${built.nodes.map((n) => n.id).join("\u0001")}#${built.edges
			.map((e) => e.id)
			.join("\u0001")}`;
		const cached = layoutCacheRef.current;
		if (!cached || cached.topoKey !== topoKey) {
			layoutCacheRef.current = { topoKey, build: built };
			return built;
		}

		const prevNodeById = new Map(cached.build.nodes.map((n) => [n.id, n]));
		let nodesChanged = false;
		const nodes = built.nodes.map((node): ExecutionGraphNode => {
			const prev = prevNodeById.get(node.id);
			if (!prev) {
				nodesChanged = true;
				return node;
			}
			if (JSON.stringify(prev.data) === JSON.stringify(node.data)) return prev;
			nodesChanged = true;
			// 拓扑不变 ⇒ 布局坐标不变：沿用旧 position 引用，只更新 data
			return { ...node, position: prev.position } as ExecutionGraphNode;
		});

		const prevEdgeById = new Map(cached.build.edges.map((e) => [e.id, e]));
		let edgesChanged = false;
		const edges = built.edges.map((edge) => {
			const prev = prevEdgeById.get(edge.id);
			if (!prev) {
				edgesChanged = true;
				return edge;
			}
			if (
				prev.animated === edge.animated &&
				JSON.stringify(prev.style) === JSON.stringify(edge.style)
			) {
				return prev;
			}
			edgesChanged = true;
			return edge;
		});

		if (!nodesChanged && !edgesChanged) return cached.build;
		const nextBuild: ExecutionGraphBuild = {
			nodes: nodesChanged ? nodes : cached.build.nodes,
			edges: edgesChanged ? edges : cached.build.edges,
			taskNodeId: built.taskNodeId,
			laneCount: built.laneCount,
		};
		layoutCacheRef.current = { topoKey, build: nextBuild };
		return nextBuild;
	}, [source]);
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
	const followRef = useRef(follow);
	followRef.current = follow;

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
			const resolved =
				typeof next === "function" ? next(followRef.current) : next;
			if (followRef.current === resolved) return;
			followRef.current = resolved;
			setFollow(resolved);
			onFollowChange?.(resolved);
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
		followRef.current = defaultFollow;
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
		<div className="flex-1 relative overflow-hidden bg-gradient-to-br from-cream-50 via-white to-cream-50 dark:from-cream-900 dark:via-cream-900 dark:to-cream-900">
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
					className="!bg-surface/70 dark:!bg-dark-bg/40 !backdrop-blur-md !border !border-black/[0.06] dark:!border-white/[0.08] !rounded-2xl !shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]"
				/>
				{selectedNodeId ? null : (
					<MiniMap
						position="bottom-right"
						zoomable
						pannable
						className="!bg-surface/70 dark:!bg-dark-bg/40 !backdrop-blur-md !border !border-black/[0.06] dark:!border-white/[0.08] !rounded-2xl !shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]"
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
					onSelectNode={setSelectedNodeId}
				/>
			) : null}
		</div>
	);
}

// React.memo：graphSource 经过上游「签名稳定化 + 节流」后引用高度稳定，
// 配合 SandboxWorkspace 侧 useCallback 固定的回调，流式期间可整体短路重渲染。
export const ExecutionGraph = memo(function ExecutionGraph({
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
});

export type { ArtifactClickBehavior, ExecutionGraphSource, GraphFilter };
