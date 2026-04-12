import { BookOpen, FileText } from "lucide-react";
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
import type { WikiPageItem } from "./useWiki";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WikiGraphPanelProps {
	scopeLabel: string;
	pages: WikiPageItem[];
	onOpenPage: (page: WikiPageItem) => void;
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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NODE_COLORS: Record<string, string> = {
	entity: "#555",
	concept: "#888",
	summary: "#333",
	workflow: "#aaa",
};
const DEFAULT_COLOR = "#666";
const ROOT_COLOR = "#333";
const EDGE_COLOR = "rgba(0,0,0,0.12)";
const LABEL_COLOR = "#999";
const MIN_RADIUS = 6;
const MAX_RADIUS = 16;
const ROOT_RADIUS = 20;
const GRAPH_HEIGHT = 350;

/* ------------------------------------------------------------------ */
/*  Graph data builder                                                 */
/* ------------------------------------------------------------------ */

function buildGraphData(pages: WikiPageItem[]) {
	if (pages.length === 0) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

	const pageMap = new Map(pages.map((p) => [p.id, p]));

	// Collect all edges first to count connections per node
	const connectionCounts = new Map<string, number>();
	const linkSet = new Set<string>();
	const links: GraphLink[] = [];

	for (const page of pages) {
		const relatedIds = page.related_page_ids ?? [];
		for (const targetId of relatedIds) {
			if (!pageMap.has(targetId)) continue;
			// Deduplicate bidirectional edges
			const edgeKey = [page.id, targetId].sort().join("--");
			if (linkSet.has(edgeKey)) continue;
			linkSet.add(edgeKey);
			links.push({ source: page.id, target: targetId });
			connectionCounts.set(page.id, (connectionCounts.get(page.id) ?? 0) + 1);
			connectionCounts.set(targetId, (connectionCounts.get(targetId) ?? 0) + 1);
		}
	}

	// If there are no explicit edges, connect everything to root
	const root = pages.find((p) => p.title === "\u77e5\u8bc6\u5730\u56fe") ??
		[...pages].sort((a, b) => a.created_at - b.created_at)[0];

	if (links.length === 0 && root) {
		for (const page of pages) {
			if (page.id === root.id) continue;
			links.push({ source: root.id, target: page.id });
			connectionCounts.set(root.id, (connectionCounts.get(root.id) ?? 0) + 1);
			connectionCounts.set(page.id, (connectionCounts.get(page.id) ?? 0) + 1);
		}
	}

	// Determine max connections for normalization
	const maxConn = Math.max(1, ...Array.from(connectionCounts.values()));

	const nodes: GraphNode[] = pages.map((page) => {
		const isRoot = root ? page.id === root.id : false;
		const conn = connectionCounts.get(page.id) ?? 0;
		// Scale radius: more connections = bigger
		const t = maxConn > 1 ? conn / maxConn : 0;
		const radius = isRoot ? ROOT_RADIUS : MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);

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

function truncateLabel(text: string, max = 20): string {
	return text.length > max ? `${text.slice(0, max)}...` : text;
}

/* ------------------------------------------------------------------ */
/*  Tooltip component                                                  */
/* ------------------------------------------------------------------ */

interface TooltipInfo {
	x: number;
	y: number;
	title: string;
	summary: string;
}

function GraphTooltip({ info }: { info: TooltipInfo | null }) {
	if (!info) return null;
	return (
		<div
			className="pointer-events-none absolute z-50 max-w-[220px] rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg"
			style={{
				left: info.x,
				top: info.y,
				transform: "translate(-50%, -100%) translateY(-12px)",
			}}
		>
			<div className="font-medium mb-0.5 leading-snug">{info.title}</div>
			{info.summary && (
				<div className="text-zinc-400 leading-relaxed line-clamp-3">
					{info.summary}
				</div>
			)}
			<div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-full">
				<div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-zinc-900" />
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function WikiGraphPanel({ scopeLabel, pages, onOpenPage }: WikiGraphPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const simulationRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
	const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
	const [containerWidth, setContainerWidth] = useState(400);

	// Build graph data from pages
	const { nodes, links } = useMemo(() => buildGraphData(pages), [pages]);

	// Stable callback for opening a page
	const onOpenPageRef = useRef(onOpenPage);
	onOpenPageRef.current = onOpenPage;

	// Observe container width for responsiveness
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setContainerWidth(entry.contentRect.width);
			}
		});
		observer.observe(el);
		setContainerWidth(el.clientWidth);
		return () => observer.disconnect();
	}, []);

	// D3 force simulation + rendering
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg || nodes.length === 0) return;

		const width = containerWidth;
		const height = GRAPH_HEIGHT;

		// Clean previous content
		const svgSel = select(svg);
		svgSel.selectAll("*").remove();

		// Clone nodes/links so D3 can mutate them
		const simNodes: GraphNode[] = nodes.map((n) => ({ ...n }));
		const simLinks: GraphLink[] = links.map((l) => ({ ...l }));
		// --- Container group for zoom/pan ---
		const g = svgSel
			.append("g")
			.attr("class", "graph-content");

		// --- Zoom behavior ---
		const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.3, 3])
			.on("zoom", (event) => {
				g.attr("transform", event.transform.toString());
			});

		svgSel.call(zoomBehavior);
		// Start slightly zoomed out for better overview
		svgSel.call(zoomBehavior.transform, zoomIdentity.translate(0, 0).scale(1));

		// --- Force simulation ---
		const simulation = forceSimulation<GraphNode>(simNodes)
			.force(
				"link",
				forceLink<GraphNode, GraphLink>(simLinks)
					.id((d) => d.id)
					.distance(80),
			)
			.force("charge", forceManyBody<GraphNode>().strength(-120))
			.force("center", forceCenter(width / 2, height / 2))
			.force(
				"collide",
				forceCollide<GraphNode>().radius((d) => d.radius + 4),
			);

		simulationRef.current = simulation;

		// --- Draw edges ---
		const linkSel = g
			.append("g")
			.attr("class", "links")
			.selectAll("line")
			.data(simLinks)
			.join("line")
			.attr("stroke", EDGE_COLOR)
			.attr("stroke-width", 1);

		// --- Draw node groups ---
		const nodeSel = g
			.append("g")
			.attr("class", "nodes")
			.selectAll<SVGGElement, GraphNode>("g")
			.data(simNodes)
			.join("g")
			.attr("cursor", "pointer");

		// Circles
		nodeSel
			.append("circle")
			.attr("r", (d) => d.radius)
			.attr("fill", (d) => getNodeColor(d.page, d.isRoot))
			.attr("stroke", "white")
			.attr("stroke-width", (d) => (d.isRoot ? 2 : 1))
			.attr("opacity", (d) => (d.isRoot ? 1 : 0.85));

		// Labels
		nodeSel
			.append("text")
			.text((d) => truncateLabel(d.page.title))
			.attr("x", (d) => d.radius + 5)
			.attr("y", 3.5)
			.attr("font-size", 10)
			.attr("fill", LABEL_COLOR)
			.attr("pointer-events", "none")
			.style("user-select", "none");

		// --- Drag behavior ---
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

		// --- Interactions: hover + click ---
		nodeSel
			.on("mouseenter", function (event: MouseEvent, d: GraphNode) {
				// Highlight node on hover
				select(this).select("circle").attr("opacity", 1).attr("stroke", "#333").attr("stroke-width", 2);

				// Calculate tooltip position relative to the container
				const containerEl = containerRef.current;
				if (!containerEl) return;
				const containerRect = containerEl.getBoundingClientRect();
				setTooltip({
					x: event.clientX - containerRect.left,
					y: event.clientY - containerRect.top,
					title: d.page.title,
					summary: d.page.summary,
				});
			})
			.on("mouseleave", function (_event: MouseEvent, d: GraphNode) {
				select(this)
					.select("circle")
					.attr("opacity", d.isRoot ? 1 : 0.85)
					.attr("stroke", "white")
					.attr("stroke-width", d.isRoot ? 2 : 1);
				setTooltip(null);
			})
			.on("click", (_event: MouseEvent, d: GraphNode) => {
				onOpenPageRef.current(d.page);
			});

		// --- Tick handler ---
		simulation.on("tick", () => {
			linkSel
				.attr("x1", (d) => (d.source as GraphNode).x ?? 0)
				.attr("y1", (d) => (d.source as GraphNode).y ?? 0)
				.attr("x2", (d) => (d.target as GraphNode).x ?? 0)
				.attr("y2", (d) => (d.target as GraphNode).y ?? 0);

			nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
		});

		// Cleanup
		return () => {
			simulation.stop();
			simulationRef.current = null;
			svgSel.selectAll("*").remove();
		};
	}, [nodes, links, containerWidth]);

	return (
		<section className="mx-3 mt-3 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/40 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.25)] overflow-hidden">
			{/* Header */}
			<div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/70">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
							Wiki Graph
						</div>
						<h3 className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
							{scopeLabel || "\u5f53\u524d\u7ebf\u7a0b\u76ee\u5f55"}
						</h3>
					</div>
					<div className="rounded-xl bg-primary/8 px-2.5 py-1 text-[11px] font-medium text-primary">
						{pages.length} \u9875
					</div>
				</div>
			</div>

			{/* Graph body */}
			<div ref={containerRef} className="relative px-2 py-2">
				{nodes.length === 0 ? (
					<div
						className="flex flex-col items-center justify-center rounded-xl bg-zinc-50/60 dark:bg-zinc-800/30"
						style={{ height: GRAPH_HEIGHT }}
					>
						<BookOpen className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mb-2" />
						<span className="text-xs text-zinc-400 dark:text-zinc-500">
							{"\u6682\u65e0\u9875\u9762\u6570\u636e"}
						</span>
					</div>
				) : (
					<svg
						ref={svgRef}
						width={containerWidth}
						height={GRAPH_HEIGHT}
						className="rounded-xl bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.95),rgba(248,248,248,0.7))] dark:bg-[radial-gradient(circle_at_center,rgba(24,24,27,0.9),rgba(9,9,11,0.75))]"
						style={{ display: "block" }}
					/>
				)}

				{/* Tooltip overlay */}
				<GraphTooltip info={tooltip} />

				{/* Root node shortcut */}
				{nodes.find((n) => n.isRoot) && (
					<button
						type="button"
						onClick={() => {
							const root = nodes.find((n) => n.isRoot);
							if (root) onOpenPage(root.page);
						}}
						className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-xl bg-white/92 dark:bg-zinc-900/88 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 shadow-sm ring-1 ring-black/5 dark:ring-white/10 hover:bg-white dark:hover:bg-zinc-800 transition-colors"
					>
						<BookOpen className="h-3.5 w-3.5 text-primary" />
						{nodes.find((n) => n.isRoot)?.page.title}
					</button>
				)}

				{/* Hint */}
				<div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-xl bg-white/92 dark:bg-zinc-900/88 px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
					<FileText className="h-3.5 w-3.5" />
					{"\u70b9\u51fb\u8282\u70b9\u6253\u5f00\u9875\u9762 \u00b7 \u62d6\u62fd\u79fb\u52a8 \u00b7 \u6eda\u8f6e\u7f29\u653e"}
				</div>
			</div>
		</section>
	);
}
