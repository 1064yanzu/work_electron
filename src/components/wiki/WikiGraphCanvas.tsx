/**
 * WikiGraphCanvas - 基于 d3-force 的关系图谱渲染核心
 *
 * 纯粹的"图渲染画布"，不含头部 / 侧边工具栏。
 * 既被侧栏的 WikiGraphPanel 紧凑显示（350px）使用，
 * 也被中间栏的 WikiGraphFullscreen 放大视图使用。
 *
 * 支持的增强能力（都是可选项）：
 * - filterTypes: 白名单 page_type，只显示这些类型的节点
 * - searchQuery: 命中 title / aliases 的节点高亮，其余半透明
 * - focusNodeId: 只显示该节点和 1 跳邻居
 * - onHoverChange: 向父组件上报 hover 中节点，用于侧边详情栏联动
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	type Simulation,
	type SimulationNodeDatum,
	type SimulationLinkDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { drag, type D3DragEvent } from "d3-drag";
import { themeManager } from "../../lib/theme";
import type { WikiPageItem } from "./useWiki";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface WikiGraphCanvasProps {
	pages: WikiPageItem[];
	onOpenPage?: (page: WikiPageItem) => void;
	/** 由父容器测量得到的宽度（px） */
	width: number;
	/** 固定高度（px） */
	height: number;
	/** 只显示这些 page_type 的节点；空 / undefined 表示不过滤 */
	filterTypes?: string[];
	/** 命中 title / aliases 的节点高亮，其余半透明 */
	searchQuery?: string;
	/** 聚焦某节点 → 只保留它 + 1 跳邻居 */
	focusNodeId?: string | null;
	/** hover 节点变化时回调（用于外部详情面板联动） */
	onHoverChange?: (page: WikiPageItem | null) => void;
	/** 是否显示节点标签，默认显示 */
	showLabels?: boolean;
	/** 初始缩放（1 = 100%） */
	initialScale?: number;
}

interface GraphNode extends SimulationNodeDatum {
	id: string;
	page: WikiPageItem;
	radius: number;
	isRoot: boolean;
	connectionCount: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
	source: string | GraphNode;
	target: string | GraphNode;
}

interface TooltipInfo {
	x: number;
	y: number;
	title: string;
	summary: string;
	type: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NODE_COLORS: Record<string, string> = {
	entity: "#64748b",
	concept: "#8b5cf6",
	summary: "#0ea5e9",
	workflow: "#f59e0b",
	source: "#22c55e",
	comparison: "#ec4899",
	map: "#d97706",
};
const DEFAULT_COLOR = "#94a3b8";
const ROOT_COLOR: string = NODE_COLORS.map ?? "#d97706";

/**
 * 依赖主题的图元颜色。
 *
 * 节点填充（NODE_COLORS）是中等饱和度色板，亮暗都够看，所以两套共用；
 * 但连线、标签、节点描边原先写死成「黑色半透明 / zinc-600 / 纯白」，在暗色
 * 背景上连线几乎不可见、标签对比度不足、白描边刺眼。这里按 TerminalInstance
 * 的双主题常量 + themeManager 订阅模式拆成两套。
 */
const GRAPH_THEME = {
	light: {
		edge: "rgba(0,0,0,0.14)",
		edgeDim: "rgba(0,0,0,0.05)",
		label: "#52525b",
		nodeStroke: "#ffffff",
		nodeStrokeHover: "#18181b",
	},
	dark: {
		edge: "rgba(255,255,255,0.22)",
		edgeDim: "rgba(255,255,255,0.08)",
		label: "#c4c2bb",
		nodeStroke: "#26251f",
		nodeStrokeHover: "#f5f4ef",
	},
} as const;

type GraphTheme = (typeof GRAPH_THEME)[keyof typeof GRAPH_THEME];

function getGraphTheme(): GraphTheme {
	return themeManager.isDark() ? GRAPH_THEME.dark : GRAPH_THEME.light;
}

const MIN_RADIUS = 7;
const MAX_RADIUS = 18;
const ROOT_RADIUS = 22;

/* ------------------------------------------------------------------ */
/*  Graph data builder                                                 */
/* ------------------------------------------------------------------ */

function matchesSearch(page: WikiPageItem, query: string): boolean {
	if (!query) return true;
	const q = query.trim().toLowerCase();
	if (!q) return true;
	if (page.title.toLowerCase().includes(q)) return true;
	if (page.summary.toLowerCase().includes(q)) return true;
	if (page.tags.some((t) => t.toLowerCase().includes(q))) return true;
	if ((page.aliases ?? []).some((a) => a.toLowerCase().includes(q)))
		return true;
	return false;
}

function buildGraphData(
	pages: WikiPageItem[],
	filterTypes: string[] | undefined,
	focusNodeId: string | null | undefined,
) {
	if (pages.length === 0)
		return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

	// 第一步：按类型过滤
	const typeSet =
		filterTypes && filterTypes.length > 0 ? new Set(filterTypes) : null;
	let working = typeSet
		? pages.filter((p) => typeSet.has(p.page_type ?? "entity"))
		: pages;

	// 第二步：focus 过滤（仅保留焦点 + 1 跳邻居）
	if (focusNodeId) {
		const focusPage = pages.find((p) => p.id === focusNodeId);
		if (focusPage) {
			const neighbors = new Set<string>([focusNodeId]);
			for (const id of focusPage.related_page_ids ?? []) neighbors.add(id);
			// 双向邻居
			for (const p of pages) {
				if ((p.related_page_ids ?? []).includes(focusNodeId))
					neighbors.add(p.id);
			}
			working = working.filter((p) => neighbors.has(p.id));
		}
	}

	const pageMap = new Map(working.map((p) => [p.id, p]));

	// 收集边
	const connectionCounts = new Map<string, number>();
	const linkSet = new Set<string>();
	const links: GraphLink[] = [];

	for (const page of working) {
		const relatedIds = page.related_page_ids ?? [];
		for (const targetId of relatedIds) {
			if (!pageMap.has(targetId)) continue;
			const edgeKey = [page.id, targetId].sort().join("--");
			if (linkSet.has(edgeKey)) continue;
			linkSet.add(edgeKey);
			links.push({ source: page.id, target: targetId });
			connectionCounts.set(page.id, (connectionCounts.get(page.id) ?? 0) + 1);
			connectionCounts.set(targetId, (connectionCounts.get(targetId) ?? 0) + 1);
		}
	}

	// 如果没有显式边，把所有节点挂到根节点（仅适用于初始化场景，不在 focus 模式用）
	const root =
		!focusNodeId &&
		(working.find((p) => p.title === "知识地图" || p.title === "Wiki Index") ??
			[...working].sort((a, b) => a.created_at - b.created_at)[0]);

	if (links.length === 0 && root) {
		for (const page of working) {
			if (page.id === root.id) continue;
			links.push({ source: root.id, target: page.id });
			connectionCounts.set(root.id, (connectionCounts.get(root.id) ?? 0) + 1);
			connectionCounts.set(page.id, (connectionCounts.get(page.id) ?? 0) + 1);
		}
	}

	const maxConn = Math.max(1, ...Array.from(connectionCounts.values()));

	const nodes: GraphNode[] = working.map((page) => {
		const isRoot = root ? page.id === root.id : false;
		const conn = connectionCounts.get(page.id) ?? 0;
		const t = maxConn > 1 ? conn / maxConn : 0;
		const radius = isRoot
			? ROOT_RADIUS
			: MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
		return {
			id: page.id,
			page,
			radius,
			isRoot,
			connectionCount: conn,
		};
	});

	return { nodes, links };
}

function getNodeColor(page: WikiPageItem, isRoot: boolean): string {
	if (isRoot) return ROOT_COLOR;
	const pt = page.page_type ?? "";
	return NODE_COLORS[pt] ?? DEFAULT_COLOR;
}

function truncateLabel(text: string, max = 24): string {
	return text.length > max ? `${text.slice(0, max)}...` : text;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function WikiGraphCanvas({
	pages,
	onOpenPage,
	width,
	height,
	filterTypes,
	searchQuery,
	focusNodeId,
	onHoverChange,
	showLabels = true,
	initialScale = 1,
}: WikiGraphCanvasProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const hostRef = useRef<HTMLDivElement>(null);
	const simulationRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
	const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
	// d3 直接写 SVG 属性，不走 CSS 变量继承，所以主题切换必须触发一次重绘
	const [graphTheme, setGraphTheme] = useState<GraphTheme>(getGraphTheme);

	useEffect(
		() => themeManager.subscribe(() => setGraphTheme(getGraphTheme())),
		[],
	);

	const { nodes, links } = useMemo(
		() => buildGraphData(pages, filterTypes, focusNodeId),
		[pages, filterTypes, focusNodeId],
	);

	const onOpenPageRef = useRef(onOpenPage);
	onOpenPageRef.current = onOpenPage;
	const onHoverChangeRef = useRef(onHoverChange);
	onHoverChangeRef.current = onHoverChange;

	// 构建搜索命中集合（稳定引用）
	const hitSet = useMemo(() => {
		const q = (searchQuery ?? "").trim().toLowerCase();
		if (!q) return null;
		const s = new Set<string>();
		for (const p of pages) {
			if (matchesSearch(p, q)) s.add(p.id);
		}
		return s;
	}, [pages, searchQuery]);

	useEffect(() => {
		const svg = svgRef.current;
		if (!svg || nodes.length === 0) return;

		const svgSel = select(svg);
		svgSel.selectAll("*").remove();

		const simNodes: GraphNode[] = nodes.map((n) => ({ ...n }));
		const simLinks: GraphLink[] = links.map((l) => ({ ...l }));

		const g = svgSel.append("g").attr("class", "graph-content");

		const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<
			SVGSVGElement,
			unknown
		>()
			.scaleExtent([0.1, 5])
			.on("zoom", (event) => {
				g.attr("transform", event.transform.toString());
			});

		svgSel.call(zoomBehavior);
		svgSel.call(
			zoomBehavior.transform,
			zoomIdentity.translate(0, 0).scale(initialScale),
		);

		const linkDistance = Math.max(60, Math.min(130, width / 10));

		const simulation = forceSimulation<GraphNode>(simNodes)
			.force(
				"link",
				forceLink<GraphNode, GraphLink>(simLinks)
					.id((d) => d.id)
					.distance(linkDistance),
			)
			.force("charge", forceManyBody<GraphNode>().strength(-160))
			.force("center", forceCenter(width / 2, height / 2))
			.force(
				"collide",
				forceCollide<GraphNode>().radius((d) => d.radius + 6),
			);

		simulationRef.current = simulation;

		const linkSel = g
			.append("g")
			.attr("class", "links")
			.selectAll("line")
			.data(simLinks)
			.join("line")
			.attr("stroke", (d) => {
				if (!hitSet) return graphTheme.edge;
				const s =
					typeof d.source === "string" ? d.source : (d.source as GraphNode).id;
				const t =
					typeof d.target === "string" ? d.target : (d.target as GraphNode).id;
				const bothHit = hitSet.has(s) && hitSet.has(t);
				return bothHit ? graphTheme.edge : graphTheme.edgeDim;
			})
			.attr("stroke-width", 1);

		const nodeSel = g
			.append("g")
			.attr("class", "nodes")
			.selectAll<SVGGElement, GraphNode>("g")
			.data(simNodes)
			.join("g")
			.attr("cursor", "pointer");

		nodeSel
			.append("circle")
			.attr("r", (d) => d.radius)
			.attr("fill", (d) => getNodeColor(d.page, d.isRoot))
			.attr("stroke", graphTheme.nodeStroke)
			.attr("stroke-width", (d) => (d.isRoot ? 2 : 1.2))
			.attr("opacity", (d) => {
				if (!hitSet) return d.isRoot ? 1 : 0.9;
				return hitSet.has(d.id) ? 1 : 0.25;
			});

		if (showLabels) {
			nodeSel
				.append("text")
				.text((d) => truncateLabel(d.page.title))
				.attr("x", (d) => d.radius + 5)
				.attr("y", 3.5)
				.attr("font-size", 10.5)
				.attr("fill", graphTheme.label)
				.attr("pointer-events", "none")
				.style("user-select", "none")
				.attr("opacity", (d) => {
					if (!hitSet) return 1;
					return hitSet.has(d.id) ? 1 : 0.3;
				});
		}

		const dragBehavior = drag<SVGGElement, GraphNode>()
			.on("start", (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) => {
				if (!event.active) simulation.alphaTarget(0.3).restart();
				const d = event.subject;
				d.fx = d.x;
				d.fy = d.y;
			})
			.on("drag", (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) => {
				const d = event.subject;
				d.fx = event.x;
				d.fy = event.y;
			})
			.on("end", (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) => {
				if (!event.active) simulation.alphaTarget(0);
				const d = event.subject;
				d.fx = null;
				d.fy = null;
			});

		nodeSel.call(dragBehavior);

		nodeSel
			.on("mouseenter", function (event: MouseEvent, d: GraphNode) {
				select(this)
					.select("circle")
					.attr("opacity", 1)
					.attr("stroke", graphTheme.nodeStrokeHover)
					.attr("stroke-width", 2);

				const hostEl = hostRef.current;
				if (!hostEl) return;
				const rect = hostEl.getBoundingClientRect();
				setTooltip({
					x: event.clientX - rect.left,
					y: event.clientY - rect.top,
					title: d.page.title,
					summary: d.page.summary,
					type: d.page.page_type ?? "entity",
				});
				onHoverChangeRef.current?.(d.page);
			})
			.on("mouseleave", function (_event: MouseEvent, d: GraphNode) {
				select(this)
					.select("circle")
					.attr("opacity", () => {
						if (!hitSet) return d.isRoot ? 1 : 0.9;
						return hitSet.has(d.id) ? 1 : 0.25;
					})
					.attr("stroke", graphTheme.nodeStroke)
					.attr("stroke-width", d.isRoot ? 2 : 1.2);
				setTooltip(null);
				onHoverChangeRef.current?.(null);
			})
			.on("click", (_event: MouseEvent, d: GraphNode) => {
				onOpenPageRef.current?.(d.page);
			});

		simulation.on("tick", () => {
			linkSel
				.attr("x1", (d) => (d.source as GraphNode).x ?? 0)
				.attr("y1", (d) => (d.source as GraphNode).y ?? 0)
				.attr("x2", (d) => (d.target as GraphNode).x ?? 0)
				.attr("y2", (d) => (d.target as GraphNode).y ?? 0);

			nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
		});

		return () => {
			simulation.stop();
			simulationRef.current = null;
			svgSel.selectAll("*").remove();
		};
	}, [
		nodes,
		links,
		width,
		height,
		hitSet,
		showLabels,
		initialScale,
		graphTheme,
	]);

	return (
		<div
			ref={hostRef}
			className="relative w-full h-full"
			style={{ minHeight: height }}
		>
			<svg
				ref={svgRef}
				width={width}
				height={height}
				className="rounded-xl bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.96),rgba(248,248,248,0.7))] dark:bg-[radial-gradient(circle_at_center,rgba(24,24,27,0.92),rgba(9,9,11,0.78))]"
				style={{ display: "block" }}
			/>
			{tooltip && (
				<div
					className="pointer-events-none absolute z-50 max-w-[260px] rounded-full bg-cream-900 px-3 py-1.5 text-xs text-cream-50 shadow-bai-pop"
					style={{
						left: tooltip.x,
						top: tooltip.y,
						transform: "translate(-50%, -100%) translateY(-14px)",
					}}
				>
					<div className="flex items-center gap-2 mb-1">
						<span
							className="inline-block w-2 h-2 rounded-full"
							style={{
								background: NODE_COLORS[tooltip.type] ?? DEFAULT_COLOR,
							}}
						/>
						<span className="font-medium leading-snug">{tooltip.title}</span>
					</div>
					{tooltip.summary && (
						<div className="text-text-light leading-relaxed line-clamp-4">
							{tooltip.summary}
						</div>
					)}
					<div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-full">
						<div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-cream-900" />
					</div>
				</div>
			)}
		</div>
	);
}

/** 供侧边栏 / 全屏视图共用的 page_type 色板 */
export const WIKI_NODE_COLORS = NODE_COLORS;
