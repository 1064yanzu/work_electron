/**
 * WikiGraphPanel - 侧栏紧凑版知识图谱
 *
 * 渲染由 WikiGraphCanvas 负责，这里只做：头部、scope 标题、页面数、
 * 「全屏展开」入口按钮、操作提示。
 */
import { BookOpen, FileText, Maximize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WikiPageItem } from "./useWiki";
import { WikiGraphCanvas } from "./WikiGraphCanvas";
import { workspaceStore } from "../../lib/workspaceStore";

interface WikiGraphPanelProps {
	scopeLabel: string;
	pages: WikiPageItem[];
	onOpenPage: (page: WikiPageItem) => void;
}

const GRAPH_HEIGHT = 350;

export function WikiGraphPanel({
	scopeLabel,
	pages,
	onOpenPage,
}: WikiGraphPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(400);

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

	const openFullscreen = () => {
		workspaceStore.setMainView("wiki-graph");
	};

	return (
		<section className="mx-3 mt-3 rounded-2xl border border-border/80 bg-surface/80 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.25)] overflow-hidden">
			{/* Header */}
			<div className="px-4 py-3 border-b border-border/70">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="text-xs uppercase tracking-[0.18em] text-text-light">
							Wiki Graph
						</div>
						<h3 className="mt-1 text-sm font-semibold text-text-primary">
							{scopeLabel || "当前对话目录"}
						</h3>
					</div>
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							onClick={openFullscreen}
							className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-text-muted hover:text-primary hover:bg-primary/8 transition-colors"
							title="在中间栏全屏展开知识地图"
						>
							<Maximize2 className="h-3.5 w-3.5" />
							全屏
						</button>
						<div className="rounded-xl bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary">
							{pages.length} 页
						</div>
					</div>
				</div>
			</div>

			{/* Graph body */}
			<div ref={containerRef} className="relative px-2 py-2">
				{pages.length === 0 ? (
					<div
						className="flex flex-col items-center justify-center rounded-xl bg-warm-50/60"
						style={{ height: GRAPH_HEIGHT }}
					>
						<BookOpen className="h-8 w-8 text-text-light mb-2" />
						<span className="text-xs text-text-light">暂无页面数据</span>
					</div>
				) : (
					<WikiGraphCanvas
						pages={pages}
						onOpenPage={onOpenPage}
						width={containerWidth}
						height={GRAPH_HEIGHT}
					/>
				)}

				{/* Hint */}
				<div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-xl bg-surface/92 px-2 py-1 text-xs text-text-muted shadow-sm ring-1 ring-black/5 dark:ring-white/10">
					<FileText className="h-3.5 w-3.5" />
					点击节点打开页面 · 拖拽移动 · 滚轮缩放
				</div>
			</div>
		</section>
	);
}
