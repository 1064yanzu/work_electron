// 资料卡片组件 — 资料库左侧栏使用
// 设计原则：克制、无装饰、信息驱动
// - 不用彩色 pill 徽章（信息靠字号 / 字重 / 位置表达）
// - 不用渐变 / ring / shadow（hairline 边框 + hover 背景反馈）
// - favicon 用真实站点图标（DuckDuckGo），失败回退到线条图标
// - 元数据合并成一行小字：domain · date · scope · origin

import { Trash2 } from "lucide-react";
import { memo, useState } from "react";
import { type Source, SourceOrigin, type SourceType } from "../../../types";
import { getSourceTypeConfig } from "../../../lib/sourceTypeConfig";

interface SourceCardProps {
	source: Source;
	viewMode: "grid" | "list";
	selectionMode: boolean;
	isSelected: boolean;
	isDraggingThis: boolean;

	onClick: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
	onToggleSelect: () => void;
	onDelete: () => void;
	onDragStart: (e: React.DragEvent) => void;
	onDragEnd: (e: React.DragEvent) => void;
	onMouseDown: (e: React.MouseEvent) => void;
}

// ============================================
// 工具函数
// ============================================

function formatCardDate(iso: string): string {
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return "";
		const now = new Date();
		const sameYear = d.getFullYear() === now.getFullYear();
		if (sameYear) {
			return `${d.getMonth() + 1}月${d.getDate()}日`;
		}
		return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
	} catch {
		return "";
	}
}

function extractHost(url?: string): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		return u.hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

// 把 host 简化成站名：news.ycombinator.com → ycombinator
// 当前未使用，保留供后续 list 模式紧凑视图扩展
// function shortenHost(host: string): string {
// 	const parts = host.split(".");
// 	if (parts.length >= 2) {
// 		return parts[parts.length - 2];
// 	}
// 	return host;
// }

// ============================================
// Favicon — 真实站点图标，失败回退到线条图标
// ============================================

function Favicon({
	url,
	kind,
	className = "w-[14px] h-[14px]",
}: {
	url?: string;
	kind: SourceType;
	className?: string;
}) {
	const [loaded, setLoaded] = useState(false);
	const [errored, setErrored] = useState(false);
	const host = extractHost(url);
	const config = getSourceTypeConfig(kind);
	const Icon = config.icon;

	const showFallback = !host || errored || !loaded;

	return (
		<span
			className={`relative shrink-0 inline-flex items-center justify-center ${className}`}
		>
			{showFallback ? (
				<Icon className={`${className} text-text-light dark:text-zinc-500`} />
			) : null}
			{host && !errored ? (
				<img
					src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
					alt=""
					loading="lazy"
					draggable={false}
					onLoad={() => setLoaded(true)}
					onError={() => setErrored(true)}
					className={`${className} rounded-[3px] select-none absolute inset-0 transition-opacity duration-150 ${
						loaded ? "opacity-100" : "opacity-0"
					}`}
				/>
			) : null}
		</span>
	);
}

// ============================================
// 元数据行 — 一行扁平文字，用 · 分隔
// ============================================

function MetaLine({
	source,
	withFavicon,
}: {
	source: Source;
	withFavicon?: boolean;
}) {
	const host = extractHost(source.url);
	const dateLabel = formatCardDate(source.created_at);
	const isProject = source.scope === "project";
	const isClip = source.source_type === SourceOrigin.BrowserClip;
	const isSearch = source.source_type === SourceOrigin.WebSearch;

	const tokens: { key: string; node: React.ReactNode }[] = [];

	if (host) {
		tokens.push({
			key: "host",
			node: <span className="truncate">{host}</span>,
		});
	} else if (!withFavicon) {
		tokens.push({
			key: "kind",
			node: (
				<span className="truncate">
					{getSourceTypeConfig(source.kind).label}
				</span>
			),
		});
	}

	if (dateLabel) {
		tokens.push({
			key: "date",
			node: <span className="tabular-nums shrink-0">{dateLabel}</span>,
		});
	}

	if (isProject) {
		tokens.push({
			key: "scope",
			node: (
				<span className="shrink-0 text-amber-700/80 dark:text-amber-400/70">
					项目
				</span>
			),
		});
	}

	if (isClip) {
		tokens.push({
			key: "clip",
			node: (
				<span className="shrink-0 text-success/75 dark:text-success/70">
					剪存
				</span>
			),
		});
	} else if (isSearch) {
		tokens.push({
			key: "search",
			node: (
				<span className="shrink-0 text-sky-700/75 dark:text-sky-400/70">
					搜索
				</span>
			),
		});
	}

	const userTags = (source.tags || []).slice(0, 1);
	if (userTags.length > 0) {
		tokens.push({
			key: `tag-${userTags[0]}`,
			node: (
				<span className="shrink-0 text-text-light/90 dark:text-zinc-500/90 truncate">
					#{userTags[0]}
				</span>
			),
		});
	}

	return (
		<div className="flex items-center gap-1.5 text-[11px] leading-[1.3] text-text-light dark:text-zinc-500 min-w-0">
			{withFavicon ? (
				<Favicon
					url={source.url}
					kind={source.kind}
					className="w-[13px] h-[13px]"
				/>
			) : null}
			{tokens.map((token, i) => (
				<span
					key={token.key}
					className="inline-flex items-center gap-1.5 min-w-0"
				>
					{i > 0 ? (
						<span
							aria-hidden
							className="text-text-light/40 dark:text-zinc-700 select-none"
						>
							·
						</span>
					) : null}
					{token.node}
				</span>
			))}
		</div>
	);
}

// ============================================
// 主组件
// ============================================

function SourceCardImpl({
	source,
	viewMode,
	selectionMode,
	isSelected,
	isDraggingThis,
	onClick,
	onContextMenu,
	onToggleSelect,
	onDelete,
	onDragStart,
	onDragEnd,
	onMouseDown,
}: SourceCardProps) {
	if (viewMode === "grid") {
		return (
			<div
				draggable={!selectionMode}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onMouseDown={onMouseDown}
				onClick={selectionMode ? onToggleSelect : onClick}
				onContextMenu={onContextMenu}
				className={[
					"group relative cursor-pointer",
					"rounded-lg px-3 py-2.5 flex flex-col gap-2 min-h-[96px]",
					"border transition-colors duration-100 ease-out",
					selectionMode
						? isSelected
							? "border-primary/50 bg-primary/[0.04] dark:bg-primary/[0.08]"
							: "border-border/40 border-dashed"
						: "border-transparent hover:border-border/50 dark:hover:border-cream-500 hover:bg-warm-50/60 dark:hover:bg-cream-900/40",
					isDraggingThis ? "opacity-40" : "",
				].join(" ")}
			>
				{/* 选中态：左侧色条 */}
				{selectionMode && isSelected ? (
					<span
						aria-hidden
						className="absolute left-0 top-3 bottom-3 w-[2px] bg-primary rounded-r"
					/>
				) : null}

				{/* 标题 */}
				<h3 className="text-[13.5px] font-medium text-text-primary dark:text-zinc-100 line-clamp-3 leading-[1.5] tracking-[-0.005em]">
					{source.title}
				</h3>

				{/* 底部元数据 */}
				<div className="mt-auto">
					<MetaLine source={source} withFavicon />
				</div>

				{/* hover 时的删除按钮（不带背景，更克制） */}
				{!selectionMode ? (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md text-text-light/70 hover:text-error hover:bg-[rgba(181,51,51,0.08)]/60 dark:hover:bg-red-900/20 transition-all duration-100"
						aria-label="删除"
					>
						<Trash2 className="w-3 h-3" />
					</button>
				) : null}
			</div>
		);
	}

	// ============================================
	// 列表模式
	// ============================================
	return (
		<div
			draggable={!selectionMode}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onMouseDown={onMouseDown}
			onClick={selectionMode ? onToggleSelect : onClick}
			onContextMenu={onContextMenu}
			className={[
				"group relative cursor-pointer rounded-md px-2 py-1.5",
				"flex items-start gap-2.5",
				"transition-colors duration-100 ease-out",
				selectionMode
					? isSelected
						? "bg-primary/[0.04] dark:bg-primary/[0.08]"
						: ""
					: "hover:bg-warm-50/60 dark:hover:bg-cream-900/40",
				isDraggingThis ? "opacity-40" : "",
			].join(" ")}
		>
			{/* 选中态左侧色条 */}
			{selectionMode && isSelected ? (
				<span
					aria-hidden
					className="absolute left-0 top-2 bottom-2 w-[2px] bg-primary rounded-r"
				/>
			) : null}

			<Favicon
				url={source.url}
				kind={source.kind}
				className="w-4 h-4 mt-[2px]"
			/>

			<div className="flex-1 min-w-0">
				<h3 className="text-[13px] font-medium text-text-primary dark:text-zinc-100 truncate leading-[1.45]">
					{source.title}
				</h3>
				<div className="mt-0.5">
					<MetaLine source={source} />
				</div>
			</div>

			{!selectionMode ? (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
					className="self-center opacity-0 group-hover:opacity-100 p-1 rounded text-text-light/70 hover:text-error hover:bg-[rgba(181,51,51,0.08)]/60 dark:hover:bg-red-900/20 transition-all duration-100 shrink-0"
					aria-label="删除"
				>
					<Trash2 className="w-3 h-3" />
				</button>
			) : null}
		</div>
	);
}

export const SourceCard = memo(SourceCardImpl);
