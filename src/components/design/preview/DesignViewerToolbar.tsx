/**
 * Design 预览界面工具栏(h-11)。
 *
 * 设计文件 tab:仅显示「刷新」按钮(其余控件折叠)
 * 具体文件 tab:刷新 │ 预览/源代码 │ Desktop ▾ │ − 100% + │ Tweaks Comment Inspect 编辑
 */
import {
	ChevronDown,
	Code2,
	Eye,
	MessageSquare,
	Minus,
	Pencil,
	Plus,
	RefreshCw,
	ScanSearch,
	SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	type DesignViewport,
	VIEWPORT_PRESETS,
	ZOOM_MAX,
	ZOOM_MIN,
	ZOOM_STEP,
} from "./constants";

interface DesignViewerToolbarProps {
	showFileControls: boolean; // 当前 tab 是具体文件时为 true
	viewerMode: "preview" | "source";
	viewport: DesignViewport;
	zoom: number;
	overlays: {
		tweaks: boolean;
		comment: boolean;
		inspect: boolean;
		edit: boolean;
	};
	onRefresh: () => void;
	onModeChange: (mode: "preview" | "source") => void;
	onViewportChange: (vp: DesignViewport) => void;
	onZoomChange: (z: number) => void;
	onToggleOverlay: (key: "tweaks" | "comment" | "inspect" | "edit") => void;
}

export function DesignViewerToolbar({
	showFileControls,
	viewerMode,
	viewport,
	zoom,
	overlays,
	onRefresh,
	onModeChange,
	onViewportChange,
	onZoomChange,
	onToggleOverlay,
}: DesignViewerToolbarProps) {
	return (
		<div className="h-11 px-3.5 flex items-center gap-1.5 border-b border-border bg-bg-surface select-none">
			<ToolbarIconButton onClick={onRefresh} title="刷新预览">
				<RefreshCw className="w-3.5 h-3.5" strokeWidth={1.6} />
			</ToolbarIconButton>

			{showFileControls ? (
				<>
					<Divider />
					{/* 预览 / 源代码 toggle */}
					<div className="inline-flex items-center bg-cream-200 rounded-md p-0.5">
						<ToggleButton
							active={viewerMode === "preview"}
							onClick={() => onModeChange("preview")}
							icon={<Eye className="w-3.5 h-3.5" strokeWidth={1.6} />}
							label="预览"
						/>
						<ToggleButton
							active={viewerMode === "source"}
							onClick={() => onModeChange("source")}
							icon={<Code2 className="w-3.5 h-3.5" strokeWidth={1.6} />}
							label="源代码"
						/>
					</div>

					{viewerMode === "preview" ? (
						<>
							<Divider />
							<ViewportSelect value={viewport} onChange={onViewportChange} />

							<Divider />
							<ToolbarIconButton
								onClick={() =>
									onZoomChange(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))
								}
								title="缩小"
								disabled={zoom <= ZOOM_MIN}
							>
								<Minus className="w-3.5 h-3.5" strokeWidth={1.6} />
							</ToolbarIconButton>
							<button
								type="button"
								onClick={() => onZoomChange(100)}
								className="h-7 px-2 rounded-md text-[12px] text-text-muted hover:text-text-primary hover:bg-warm-200/60 transition-colors tabular-nums min-w-[48px]"
								title="点击重置为 100%"
							>
								{zoom}%
							</button>
							<ToolbarIconButton
								onClick={() =>
									onZoomChange(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))
								}
								title="放大"
								disabled={zoom >= ZOOM_MAX}
							>
								<Plus className="w-3.5 h-3.5" strokeWidth={1.6} />
							</ToolbarIconButton>
						</>
					) : null}
				</>
			) : null}

			<div className="flex-1" />

			<OverlayButton
				active={overlays.tweaks}
				onClick={() => onToggleOverlay("tweaks")}
				title="Tweaks"
				icon={<SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.6} />}
				label="Tweaks"
			/>
			<OverlayButton
				active={overlays.comment}
				onClick={() => onToggleOverlay("comment")}
				title="评论"
				icon={<MessageSquare className="w-3.5 h-3.5" strokeWidth={1.6} />}
			/>
			<OverlayButton
				active={overlays.inspect}
				onClick={() => onToggleOverlay("inspect")}
				title="Inspect"
				icon={<ScanSearch className="w-3.5 h-3.5" strokeWidth={1.6} />}
			/>
			<OverlayButton
				active={overlays.edit}
				onClick={() => onToggleOverlay("edit")}
				title="编辑模式 (切到源代码后保存)"
				icon={<Pencil className="w-3.5 h-3.5" strokeWidth={1.6} />}
			/>
		</div>
	);
}

function Divider() {
	return <div className="w-px h-[18px] bg-cream-400 mx-1 shrink-0" />;
}

function ToolbarIconButton({
	onClick,
	title,
	disabled,
	children,
}: {
	onClick: () => void;
	title: string;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-warm-200/60 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted"
			title={title}
		>
			{children}
		</button>
	);
}

function ToggleButton({
	active,
	onClick,
	icon,
	label,
}: {
	active: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`inline-flex items-center gap-1 h-6 px-2 rounded text-[11.5px] font-medium transition-colors ${
				active
					? "bg-background text-text-primary shadow-sm"
					: "text-text-muted hover:text-text-primary"
			}`}
		>
			{icon}
			{label}
		</button>
	);
}

function OverlayButton({
	active,
	onClick,
	title,
	icon,
	label,
}: {
	active: boolean;
	onClick: () => void;
	title: string;
	icon: React.ReactNode;
	label?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`inline-flex items-center gap-1.5 h-7 rounded-md transition-colors ${
				label ? "px-2.5 text-[12px]" : "w-7 justify-center"
			} ${
				active
					? "bg-primary/10 text-primary"
					: "text-text-muted hover:text-text-primary hover:bg-warm-200/60"
			}`}
			title={title}
			aria-pressed={active}
		>
			{icon}
			{label}
		</button>
	);
}

function ViewportSelect({
	value,
	onChange,
}: {
	value: DesignViewport;
	onChange: (v: DesignViewport) => void;
}) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (
				!menuRef.current?.contains(e.target as Node) &&
				!triggerRef.current?.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [open]);

	const current = VIEWPORT_PRESETS[value];

	return (
		<div className="relative">
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-text-muted hover:text-text-primary hover:bg-warm-200/60 transition-colors"
				title="选择视口尺寸"
			>
				{current.label}
				<span className="text-[10.5px] text-text-light tabular-nums">
					{current.width}×{current.height}
				</span>
				<ChevronDown
					className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
					strokeWidth={1.8}
				/>
			</button>
			{open ? (
				<div
					ref={menuRef}
					className="absolute left-0 top-full mt-1 min-w-[180px] rounded-lg bg-background border border-border shadow-bai-pop overflow-hidden z-50"
				>
					{(Object.keys(VIEWPORT_PRESETS) as DesignViewport[]).map((k) => {
						const p = VIEWPORT_PRESETS[k];
						const active = k === value;
						return (
							<button
								key={k}
								type="button"
								onClick={() => {
									onChange(k);
									setOpen(false);
								}}
								className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-[12px] transition-colors ${
									active
										? "bg-primary/10 text-primary"
										: "text-text-primary hover:bg-warm-200/60"
								}`}
							>
								<span>{p.label}</span>
								<span className="text-[10.5px] text-text-muted tabular-nums">
									{p.width}×{p.height}
								</span>
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
