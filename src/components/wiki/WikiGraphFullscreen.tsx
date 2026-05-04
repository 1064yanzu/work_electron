/**
 * WikiGraphFullscreen - 中间栏全屏知识地图视图
 *
 * 布局（改进版）：
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Toolbar: 返回 · 搜索 · 聚焦 · 刷新                        │
 *   ├───────────┬──────────────────────────────────────────────┤
 *   │ Left panel│       Graph Canvas (全宽)                     │
 *   │ (filters) │  ┌─────────────────────────────────────┐     │
 *   │           │  │ 浮层详情卡（选中节点时从右侧滑入）      │     │
 *   │           │  └─────────────────────────────────────┘     │
 *   └───────────┴──────────────────────────────────────────────┘
 *
 * - 右侧详情不再占固定宽度，改为浮层覆盖在图谱上
 * - hover tooltip 保留（由 WikiGraphCanvas 内部实现）
 * - 左侧筛选面板可折叠
 */
import {
	ArrowLeft,
	BookOpen,
	Crosshair,
	FileText,
	Pencil,
	PanelLeftClose,
	PanelLeftOpen,
	RefreshCw,
	Search,
	Tag,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveThreadScope } from "../../lib/chat/threadScope";
import { workspaceStore } from "../../lib/workspaceStore";
import { useWiki, type WikiPageItem } from "./useWiki";
import { WIKI_NODE_COLORS, WikiGraphCanvas } from "./WikiGraphCanvas";

const PAGE_TYPE_META: Array<{
	type: string;
	label: string;
}> = [
	{ type: "entity", label: "实体" },
	{ type: "concept", label: "概念" },
	{ type: "workflow", label: "流程" },
	{ type: "source", label: "来源摘要" },
	{ type: "comparison", label: "对比分析" },
	{ type: "map", label: "主题导航" },
	{ type: "summary", label: "综合" },
];

export function WikiGraphFullscreen() {
	const { scopePath } = useActiveThreadScope();

	const { pages, loading, refresh, openInEditor } = useWiki(scopePath);

	const canvasHostRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 800, height: 600 });

	useEffect(() => {
		const el = canvasHostRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setSize({
					width: Math.max(400, entry.contentRect.width),
					height: Math.max(400, entry.contentRect.height),
				});
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const [searchQuery, setSearchQuery] = useState("");
	const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
		() => new Set(PAGE_TYPE_META.map((m) => m.type)),
	);
	const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
	const [selectedPage, setSelectedPage] = useState<WikiPageItem | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(true);

	// 当前详情浮层的页面：focus > selected（hover 只走 canvas 内部 tooltip，不弹浮层）
	const activeDetail = useMemo<WikiPageItem | null>(() => {
		if (focusNodeId) {
			const p = pages.find((x) => x.id === focusNodeId);
			if (p) return p;
		}
		return selectedPage;
	}, [focusNodeId, selectedPage, pages]);

	const typeCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const p of pages) {
			const t = p.page_type ?? "entity";
			counts[t] = (counts[t] ?? 0) + 1;
		}
		return counts;
	}, [pages]);

	const toggleType = (type: string) => {
		setEnabledTypes((prev) => {
			const next = new Set(prev);
			if (next.has(type)) next.delete(type);
			else next.add(type);
			return next;
		});
	};

	const handleClose = () => {
		workspaceStore.setMainView("editor");
	};

	const handleNodeClick = (page: WikiPageItem) => {
		if (selectedPage?.id === page.id && focusNodeId === page.id) {
			openInEditor(page.id, page.title);
			return;
		}
		setSelectedPage(page);
		setFocusNodeId(page.id);
	};

	const clearFocus = () => {
		setFocusNodeId(null);
		setSelectedPage(null);
	};

	return (
		<div className="flex flex-col h-full bg-warm-50">
			{/* Toolbar */}
			<div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/70 bg-surface/70/60 backdrop-blur-sm shrink-0">
				<button
					onClick={handleClose}
					className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-text-muted hover:text-text-primary dark:hover:text-zinc-200 hover:bg-warm-200 transition-colors"
					title="返回编辑器"
				>
					<ArrowLeft className="h-3.5 w-3.5" />
					返回
				</button>

				<button
					onClick={() => setSidebarOpen((v) => !v)}
					className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-text-light hover:text-text-secondary dark:hover:text-zinc-200 hover:bg-warm-200 transition-colors"
					title={sidebarOpen ? "收起筛选面板" : "展开筛选面板"}
				>
					{sidebarOpen ? (
						<PanelLeftClose className="h-3.5 w-3.5" />
					) : (
						<PanelLeftOpen className="h-3.5 w-3.5" />
					)}
				</button>

				<div className="flex items-center gap-2">
					<BookOpen className="h-4 w-4 text-primary" />
					<h1 className="text-sm font-semibold text-text-primary">知识地图</h1>
					<span className="text-[11px] text-text-light tabular-nums">
						{pages.length} 页
					</span>
				</div>

				<div className="flex-1 flex justify-center">
					<div className="relative w-full max-w-sm">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-light" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="搜索节点（标题 / 摘要 / 标签 / 别名）..."
							className="w-full pl-8 pr-8 py-1.5 text-sm bg-warm-200/70 border border-transparent rounded-lg focus:outline-none focus:bg-surface dark:focus:bg-dark-surface focus:border-primary/40 focus:ring-2 focus:ring-primary/15 transition-colors"
						/>
						{searchQuery && (
							<button
								onClick={() => setSearchQuery("")}
								className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-light hover:text-text-secondary rounded"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				</div>

				{focusNodeId && (
					<button
						onClick={clearFocus}
						className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-primary bg-primary/8 hover:bg-primary/15 transition-colors"
						title="清除焦点，显示全部节点"
					>
						<Crosshair className="h-3.5 w-3.5" />
						清除焦点
					</button>
				)}

				<button
					onClick={refresh}
					disabled={loading}
					className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-text-muted hover:text-text-primary dark:hover:text-zinc-200 hover:bg-warm-200 disabled:opacity-40 transition-colors"
				>
					<RefreshCw
						className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
					/>
					刷新
				</button>
			</div>

			{/* Body */}
			<div className="flex-1 flex overflow-hidden">
				{/* Left filter panel — collapsible */}
				<aside
					className={`shrink-0 border-r border-border/70 bg-surface/50/30 overflow-y-auto transition-all duration-200 ${
						sidebarOpen ? "w-44" : "w-0 opacity-0 pointer-events-none"
					}`}
				>
					<div className="px-3 py-3 min-w-[176px]">
						<div className="text-[10px] uppercase tracking-[0.18em] text-text-light mb-2">
							节点类型
						</div>
						<div className="space-y-0.5">
							{PAGE_TYPE_META.map((meta) => {
								const count = typeCounts[meta.type] ?? 0;
								const checked = enabledTypes.has(meta.type);
								const color = WIKI_NODE_COLORS[meta.type] ?? "#94a3b8";
								return (
									<label
										key={meta.type}
										className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
											checked ? "bg-warm-200/70/50" : "hover:bg-warm-50/30"
										}`}
									>
										<input
											type="checkbox"
											checked={checked}
											onChange={() => toggleType(meta.type)}
											className="w-3.5 h-3.5 rounded accent-primary"
										/>
										<span
											className="inline-block w-2 h-2 rounded-full shrink-0"
											style={{ background: color }}
										/>
										<span className="flex-1 text-xs text-text-secondary truncate">
											{meta.label}
										</span>
										<span className="text-[10px] tabular-nums text-text-light shrink-0">
											{count}
										</span>
									</label>
								);
							})}
						</div>

						<div className="mt-4 pt-3 border-t border-border/60">
							<div className="text-[10px] uppercase tracking-[0.18em] text-text-light mb-2">
								操作提示
							</div>
							<ul className="space-y-1.5 text-[10px] text-text-muted leading-relaxed">
								<li>· 点击节点 → 聚焦到该节点</li>
								<li>· 聚焦后再次点击 → 打开页面</li>
								<li>· 拖拽节点调整布局</li>
								<li>· 滚轮缩放</li>
							</ul>
						</div>
					</div>
				</aside>

				{/* Graph canvas — takes full remaining width */}
				<div ref={canvasHostRef} className="flex-1 relative overflow-hidden">
					{pages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-text-light">
							<BookOpen className="h-12 w-12 mb-3 opacity-40" />
							<p className="text-sm">暂无页面数据</p>
						</div>
					) : (
						<WikiGraphCanvas
							pages={pages}
							onOpenPage={handleNodeClick}
							width={size.width}
							height={size.height}
							filterTypes={Array.from(enabledTypes)}
							searchQuery={searchQuery}
							focusNodeId={focusNodeId}
							onHoverChange={() => {}}
							initialScale={1.1}
						/>
					)}

					{/* Floating detail card — slides in from right when a node is selected */}
					<WikiNodeDetailOverlay
						page={activeDetail}
						onOpen={(p) => openInEditor(p.id, p.title)}
						onClose={clearFocus}
					/>
				</div>
			</div>
		</div>
	);
}

function WikiNodeDetailOverlay({
	page,
	onOpen,
	onClose,
}: {
	page: WikiPageItem | null;
	onOpen: (p: WikiPageItem) => void;
	onClose: () => void;
}) {
	return (
		<div
			className={`absolute top-3 right-3 bottom-3 w-64 pointer-events-none transition-all duration-200 ${
				page
					? "opacity-100 translate-x-0 pointer-events-auto"
					: "opacity-0 translate-x-4"
			}`}
		>
			{page && (
				<div className="h-full overflow-y-auto rounded-xl border border-border/80 bg-surface/90 backdrop-blur-md shadow-lg shadow-zinc-900/10 dark:shadow-zinc-950/40">
					<WikiNodeDetailContent
						page={page}
						onOpen={onOpen}
						onClose={onClose}
					/>
				</div>
			)}
		</div>
	);
}

function WikiNodeDetailContent({
	page,
	onOpen,
	onClose,
}: {
	page: WikiPageItem;
	onOpen: (p: WikiPageItem) => void;
	onClose: () => void;
}) {
	const color = WIKI_NODE_COLORS[page.page_type ?? ""] ?? "#94a3b8";

	return (
		<div className="px-4 py-4">
			{/* Header row */}
			<div className="flex items-start justify-between gap-2 mb-3">
				<div className="flex items-center gap-1.5 min-w-0">
					<span
						className="inline-block w-2 h-2 rounded-full shrink-0"
						style={{ background: color }}
					/>
					<span className="text-[10px] uppercase tracking-[0.18em] text-text-light truncate">
						{page.page_type ?? "entity"}
					</span>
					{page.status && page.status !== "active" && (
						<span className="text-[10px] uppercase tracking-wider text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded shrink-0">
							{page.status}
						</span>
					)}
				</div>
				<button
					onClick={onClose}
					className="shrink-0 p-1 rounded-md text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 transition-colors"
					title="关闭"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			</div>

			<h2 className="text-sm font-semibold text-text-primary leading-snug mb-2">
				{page.title}
			</h2>

			{page.summary && (
				<p className="text-xs text-text-secondary leading-relaxed mb-3">
					{page.summary}
				</p>
			)}

			{page.aliases && page.aliases.length > 0 && (
				<div className="mb-3">
					<div className="text-[10px] uppercase tracking-[0.18em] text-text-light mb-1">
						别名
					</div>
					<div className="flex flex-wrap gap-1">
						{page.aliases.map((a) => (
							<span
								key={a}
								className="px-1.5 py-0.5 text-[10px] bg-warm-200 text-text-secondary rounded"
							>
								{a}
							</span>
						))}
					</div>
				</div>
			)}

			{page.tags.length > 0 && (
				<div className="mb-3">
					<div className="text-[10px] uppercase tracking-[0.18em] text-text-light mb-1">
						标签
					</div>
					<div className="flex flex-wrap gap-1">
						{page.tags.map((t) => (
							<span
								key={t}
								className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-primary/8 text-primary/80 rounded"
							>
								<Tag className="h-2.5 w-2.5" />
								{t}
							</span>
						))}
					</div>
				</div>
			)}

			{page.sources && page.sources.length > 0 && (
				<div className="mb-3">
					<div className="text-[10px] uppercase tracking-[0.18em] text-text-light mb-1">
						溯源（{page.sources.length}）
					</div>
					<ul className="space-y-0.5">
						{page.sources.slice(0, 6).map((s) => (
							<li
								key={s}
								className="text-[11px] text-text-muted truncate"
								title={s}
							>
								· {s.split(/[/\\]/).pop() ?? s}
							</li>
						))}
						{page.sources.length > 6 && (
							<li className="text-[10px] text-text-light">
								...还有 {page.sources.length - 6} 个来源
							</li>
						)}
					</ul>
				</div>
			)}

			<div className="mt-4 pt-3 border-t border-border/60 space-y-2">
				<button
					onClick={() => onOpen(page)}
					className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/8 hover:bg-primary/15 text-primary text-xs py-2 transition-colors"
				>
					<Pencil className="h-3.5 w-3.5" />
					在编辑器中打开
				</button>
				<div className="flex items-center gap-1.5 text-[10px] text-text-light">
					<FileText className="h-3 w-3 shrink-0" />
					<span className="truncate">{page.slug}</span>
				</div>
			</div>
		</div>
	);
}
