/**
 * WikiGraphFullscreen - 中间栏全屏知识地图视图
 *
 * 布局：
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Toolbar: 返回 · 搜索 · 聚焦 · 清除焦点 · 刷新 · 关闭           │
 *   ├────────────┬──────────────────────────────┬─────────────────┤
 *   │ Left panel │       Graph Canvas           │  Detail panel   │
 *   │ (filters)  │       (filled area)          │  (hover / focus)│
 *   └────────────┴──────────────────────────────┴─────────────────┘
 *
 * 功能：
 * - 按 page_type 多选过滤
 * - 搜索 title / summary / aliases / tags，命中节点高亮，其他半透明
 * - 点击节点 → 进入 focus 模式（只显示该节点 + 1 跳邻居）
 * - 右侧详情面板显示 hover / focused 节点的 summary、sources、tags
 * - 点击"打开页面"跳回 Wiki 详情 / 文档编辑器
 */
import {
	ArrowLeft,
	BookOpen,
	Crosshair,
	FileText,
	Pencil,
	RefreshCw,
	Search,
	Tag,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sessionStore } from "../../lib/agent/sessionManager";
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
	const [scopePath] = useState<string | null>(
		() => sessionStore.getCurrentSession()?.cwd ?? null,
	);

	const { pages, loading, refresh, openInEditor } = useWiki(scopePath);

	// 中间栏尺寸测量
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

	// 筛选 / 搜索 / focus 状态
	const [searchQuery, setSearchQuery] = useState("");
	const [enabledTypes, setEnabledTypes] = useState<Set<string>>(() => {
		return new Set(PAGE_TYPE_META.map((m) => m.type));
	});
	const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
	const [hoveredPage, setHoveredPage] = useState<WikiPageItem | null>(null);
	const [selectedPage, setSelectedPage] = useState<WikiPageItem | null>(null);

	// 当前呈现在右侧详情栏的页面：focus > selected > hovered
	const activeDetail = useMemo<WikiPageItem | null>(() => {
		if (focusNodeId) {
			const p = pages.find((x) => x.id === focusNodeId);
			if (p) return p;
		}
		if (hoveredPage) return hoveredPage;
		return selectedPage;
	}, [focusNodeId, hoveredPage, selectedPage, pages]);

	// 类型计数（用于筛选面板显示 "concepts (12)" 这种）
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
		// 第一次点击 = 选中 + 进入 focus；再次点击同一节点 = 打开
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
		<div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
			{/* Toolbar */}
			<div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-200/70 dark:border-zinc-800/70 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-sm">
				<button
					onClick={handleClose}
					className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
					title="返回编辑器"
				>
					<ArrowLeft className="h-3.5 w-3.5" />
					返回
				</button>

				<div className="flex items-center gap-2">
					<BookOpen className="h-4 w-4 text-primary" />
					<h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
						知识地图
					</h1>
					<span className="text-[11px] text-zinc-400 tabular-nums">
						{pages.length} 页
					</span>
				</div>

				<div className="flex-1 flex justify-center">
					<div className="relative w-full max-w-md">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="搜索节点（标题 / 摘要 / 标签 / 别名）..."
							className="w-full pl-8 pr-8 py-1.5 text-sm bg-zinc-100/70 dark:bg-zinc-800/70 border border-transparent rounded-lg focus:outline-none focus:bg-white dark:focus:bg-zinc-800 focus:border-primary/40 focus:ring-2 focus:ring-primary/15 transition-colors"
						/>
						{searchQuery && (
							<button
								onClick={() => setSearchQuery("")}
								className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600 rounded"
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
					className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
				>
					<RefreshCw
						className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
					/>
					刷新
				</button>
			</div>

			{/* Body */}
			<div className="flex-1 flex overflow-hidden">
				{/* Left filter panel */}
				<aside className="w-56 shrink-0 border-r border-zinc-200/70 dark:border-zinc-800/70 bg-white/50 dark:bg-zinc-900/30 overflow-y-auto">
					<div className="px-4 py-3">
						<div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500 mb-2">
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
											checked
												? "bg-zinc-100/70 dark:bg-zinc-800/50"
												: "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
										}`}
									>
										<input
											type="checkbox"
											checked={checked}
											onChange={() => toggleType(meta.type)}
											className="w-3.5 h-3.5 rounded accent-primary"
										/>
										<span
											className="inline-block w-2.5 h-2.5 rounded-full"
											style={{ background: color }}
										/>
										<span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300">
											{meta.label}
										</span>
										<span className="text-[10px] tabular-nums text-zinc-400">
											{count}
										</span>
									</label>
								);
							})}
						</div>

						<div className="mt-5 pt-4 border-t border-zinc-200/60 dark:border-zinc-800/60">
							<div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500 mb-2">
								操作提示
							</div>
							<ul className="space-y-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
								<li>· 点击节点 → 聚焦到该节点</li>
								<li>· 聚焦后再次点击 → 打开页面</li>
								<li>· 拖拽节点调整布局</li>
								<li>· 滚轮缩放</li>
							</ul>
						</div>
					</div>
				</aside>

				{/* Graph canvas */}
				<div ref={canvasHostRef} className="flex-1 relative overflow-hidden">
					{pages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-zinc-400">
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
							onHoverChange={setHoveredPage}
							initialScale={1.1}
						/>
					)}
				</div>

				{/* Right detail panel */}
				<aside className="w-72 shrink-0 border-l border-zinc-200/70 dark:border-zinc-800/70 bg-white/50 dark:bg-zinc-900/30 overflow-y-auto">
					<WikiNodeDetail
						page={activeDetail}
						onOpen={(p) => openInEditor(p.id, p.title)}
					/>
				</aside>
			</div>
		</div>
	);
}

function WikiNodeDetail({
	page,
	onOpen,
}: {
	page: WikiPageItem | null;
	onOpen: (p: WikiPageItem) => void;
}) {
	if (!page) {
		return (
			<div className="px-4 py-5 text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
				悬停节点查看摘要，点击节点聚焦，再次点击打开页面。
			</div>
		);
	}

	const color = WIKI_NODE_COLORS[page.page_type ?? ""] ?? "#94a3b8";

	return (
		<div className="px-4 py-4">
			<div className="flex items-center gap-2 mb-2">
				<span
					className="inline-block w-2.5 h-2.5 rounded-full"
					style={{ background: color }}
				/>
				<span className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
					{page.page_type ?? "entity"}
				</span>
				{page.status && page.status !== "active" && (
					<span className="text-[10px] uppercase tracking-wider text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
						{page.status}
					</span>
				)}
			</div>

			<h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug mb-2">
				{page.title}
			</h2>

			{page.summary && (
				<p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">
					{page.summary}
				</p>
			)}

			{page.aliases && page.aliases.length > 0 && (
				<div className="mb-3">
					<div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1">
						别名
					</div>
					<div className="flex flex-wrap gap-1">
						{page.aliases.map((a) => (
							<span
								key={a}
								className="px-1.5 py-0.5 text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded"
							>
								{a}
							</span>
						))}
					</div>
				</div>
			)}

			{page.tags.length > 0 && (
				<div className="mb-3">
					<div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1">
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
					<div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1">
						溯源（{page.sources.length}）
					</div>
					<ul className="space-y-0.5">
						{page.sources.slice(0, 8).map((s) => (
							<li
								key={s}
								className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate"
								title={s}
							>
								· {s.split(/[/\\]/).pop() ?? s}
							</li>
						))}
						{page.sources.length > 8 && (
							<li className="text-[10px] text-zinc-400">
								...还有 {page.sources.length - 8} 个来源
							</li>
						)}
					</ul>
				</div>
			)}

			<div className="mt-4 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60">
				<button
					onClick={() => onOpen(page)}
					className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/8 hover:bg-primary/15 text-primary text-xs py-2 transition-colors"
				>
					<Pencil className="h-3.5 w-3.5" />
					在编辑器中打开
				</button>
			</div>

			<div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-400">
				<FileText className="h-3 w-3" />
				<span className="truncate">{page.slug}</span>
			</div>
		</div>
	);
}
