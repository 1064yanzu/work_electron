import { Check, ChevronUp } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	type ThinkingLevel,
	THINKING_LEVEL_LABELS,
} from "../../lib/models/agentModelConfig";
import {
	agentModelSettingsStore,
	useAgentModelSettingsStore,
} from "../../lib/models/agentModelSettingsStore";

const LEVEL_ORDER: ThinkingLevel[] = ["off", "low", "medium", "high", "xhigh"];

const LEVEL_DESCRIPTIONS: Record<ThinkingLevel, string> = {
	off: "不开启思考，最快直答",
	low: "极少思考，快速响应",
	medium: "适度思考，兼顾速度与质量",
	high: "深度推理（SDK 默认）",
	xhigh: "更深层推理，仅 Opus 4.7 完整支持",
};

const LEVEL_VALUE: Record<ThinkingLevel, number> = {
	off: 0,
	low: 1,
	medium: 2,
	high: 3,
	xhigh: 4,
};

const BAR_HEIGHTS = [4, 6, 8, 10] as const;

type BarTone = "active" | "muted" | "subtle";

/**
 * 4 根竖条 —— 信号强度风格的思考深度指示器。
 *
 * 把抽象的"思考程度"翻译成可视化语言：填充的竖条数 = 当前等级。
 * 关闭态全部为空，hover/active 时填充条变彩色（mint，对应工具栏图标点缀色）。
 */
function ThinkingBars({
	level,
	tone,
}: {
	level: ThinkingLevel;
	tone: BarTone;
}) {
	const value = LEVEL_VALUE[level];
	const filledClass =
		tone === "active"
			? "bg-mint-500 dark:bg-mint-300"
			: tone === "muted"
				? "bg-text-secondary/80"
				: "bg-text-muted";
	const emptyClass = "bg-cream-400/60 dark:bg-cream-500/40";
	return (
		<div className="flex items-end gap-[2.5px] h-[11px]">
			{BAR_HEIGHTS.map((h, i) => {
				const filled = i < value;
				return (
					<div
						key={h}
						className={`w-[2.5px] rounded-full transition-colors duration-200 ${filled ? filledClass : emptyClass}`}
						style={{ height: `${h}px` }}
					/>
				);
			})}
		</div>
	);
}

/**
 * 思考程度 pill —— ChatInput 工具栏内紧邻 model pill。
 *
 * 弹出菜单用 Portal 渲染到 body —— ChatInputToolbar 外层有
 * `overflow-hidden + max-h-[60px]` 做折叠动画，菜单若直接放
 * 在 pill 内会被裁掉。Portal + fixed 定位是与 ModelSelector
 * 注释里"放在 overflow-hidden 外"一致的解法。
 */
export function ThinkingLevelPill() {
	const { settings } = useAgentModelSettingsStore();
	const [isOpen, setIsOpen] = useState(false);
	const [hoveredLevel, setHoveredLevel] = useState<ThinkingLevel | null>(null);
	const [menuPosition, setMenuPosition] = useState<{
		left: number;
		bottom: number;
	} | null>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const currentLevel: ThinkingLevel =
		settings.contextRuntime?.thinkingLevel ?? "high";
	const displayLevel = hoveredLevel ?? currentLevel;

	useLayoutEffect(() => {
		if (!isOpen || !buttonRef.current) {
			setMenuPosition(null);
			return;
		}
		const rect = buttonRef.current.getBoundingClientRect();
		setMenuPosition({
			left: rect.left,
			bottom: window.innerHeight - rect.top + 8,
		});
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) {
			setHoveredLevel(null);
			return;
		}
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				buttonRef.current?.contains(target) ||
				menuRef.current?.contains(target)
			) {
				return;
			}
			setIsOpen(false);
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setIsOpen(false);
		};
		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [isOpen]);

	const handleSelect = (next: ThinkingLevel) => {
		void agentModelSettingsStore.updateContextRuntime({ thinkingLevel: next });
		setIsOpen(false);
	};

	return (
		<div className="relative ml-0.5">
			<button
				ref={buttonRef}
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				title={`思考程度：${THINKING_LEVEL_LABELS[currentLevel]}`}
				className={`
					group flex items-center gap-1.5 pl-2 pr-1.5 py-1 text-[11px] rounded-full
					transition-[background-color,color] duration-150 cursor-pointer
					${
						isOpen
							? "bg-warm-200 dark:bg-cream-700 text-text-primary"
							: "text-text-muted hover:text-text-primary hover:bg-warm-200/60 dark:hover:bg-cream-700/40"
					}
				`}
			>
				<ThinkingBars level={currentLevel} tone={isOpen ? "active" : "muted"} />
				<span className="font-medium leading-none">
					{THINKING_LEVEL_LABELS[currentLevel]}
				</span>
				<ChevronUp
					className={`w-2.5 h-2.5 opacity-50 transition-transform duration-200 ${isOpen ? "" : "rotate-180"}`}
					strokeWidth={2}
				/>
			</button>

			{isOpen &&
				menuPosition &&
				createPortal(
					<div
						ref={menuRef}
						className="fixed z-[100] w-[200px] bg-cream-50/95 dark:bg-cream-900/95 backdrop-blur-xl border border-cream-400/70 dark:border-cream-500/60 rounded-2xl shadow-bai-pop overflow-hidden animate-in fade-in slide-in-from-bottom-1 zoom-in-95 duration-150 origin-bottom-left"
						style={{
							left: `${menuPosition.left}px`,
							bottom: `${menuPosition.bottom}px`,
						}}
					>
						{/* Header：标题 + 浮动描述（hover 时切换） */}
						<div className="px-3 pt-2 pb-2 border-b border-cream-300/70 dark:border-cream-500/40">
							<div className="flex items-center justify-between">
								<div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
									思考程度
								</div>
								<div className="text-[9.5px] text-text-muted/60 font-mono">
									effort
								</div>
							</div>
							<div className="text-[10px] text-text-muted/80 mt-1 leading-snug min-h-[14px] transition-opacity duration-150">
								{LEVEL_DESCRIPTIONS[displayLevel]}
							</div>
						</div>

						{/* 选项列表：单行紧凑布局 */}
						<div
							className="p-1 space-y-[1px]"
							onMouseLeave={() => setHoveredLevel(null)}
						>
							{LEVEL_ORDER.map((level) => {
								const isActive = level === currentLevel;
								const isHovered = hoveredLevel === level;
								return (
									<button
										key={level}
										type="button"
										onClick={() => handleSelect(level)}
										onMouseEnter={() => setHoveredLevel(level)}
										className={`
											w-full text-left flex items-center gap-2.5 pl-2 pr-1.5 py-1.5 rounded-lg
											transition-[background-color,color] duration-100
											${
												isActive
													? "bg-cream-200/80 dark:bg-cream-800 text-text-primary"
													: isHovered
														? "bg-cream-100 dark:bg-cream-800/60 text-text-primary"
														: "text-text-secondary"
											}
										`}
									>
										<ThinkingBars
											level={level}
											tone={
												isActive ? "active" : isHovered ? "muted" : "subtle"
											}
										/>
										<span
											className={`flex-1 text-[12px] leading-none ${isActive ? "font-semibold" : "font-medium"}`}
										>
											{THINKING_LEVEL_LABELS[level]}
										</span>
										<Check
											className={`w-3 h-3 shrink-0 transition-opacity duration-150 ${
												isActive
													? "opacity-100 text-mint-600 dark:text-mint-300"
													: "opacity-0"
											}`}
											strokeWidth={2.5}
										/>
									</button>
								);
							})}
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}
