import { ChevronDown, X, Check, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { designListSystems } from "../../../../lib/api/design";
import { cn } from "../../../../lib/utils";
import { SystemThumbnail } from "../SystemThumbnail";

interface DesignSystemPickerProps {
	value: string | null;
	onChange: (value: string | null) => void;
	disabled?: boolean;
}

interface SystemItem {
	id: string;
	title: string;
	category: string;
	summary: string;
	swatches: string[];
}

function Swatches({ colors }: { colors: string[] }) {
	const list = colors.slice(0, 4);
	if (list.length === 0) return null;
	return (
		<div className="flex items-center -space-x-1.5 shrink-0">
			{list.map((c, i) => (
				<span
					key={`${c}-${i}`}
					className="w-3.5 h-3.5 rounded-full border border-cream-50 dark:border-cream-900 shadow-sm"
					style={{ backgroundColor: c }}
				/>
			))}
		</div>
	);
}

export function DesignSystemPicker({
	value,
	onChange,
	disabled,
}: DesignSystemPickerProps) {
	const [systems, setSystems] = useState<SystemItem[]>([]);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const triggerRef = useRef<HTMLButtonElement>(null);
	const popRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{
		top?: number;
		bottom?: number;
		left: number;
		width: number;
	}>({
		top: 0,
		left: 0,
		width: 340,
	});

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const list = await designListSystems();
				if (!cancelled) setSystems(list);
			} catch (err) {
				console.warn("[DesignSystemPicker] load failed", err);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const selected = systems.find((s) => s.id === value) ?? null;

	const filteredSystems = useMemo(() => {
		if (!query.trim()) return systems;
		const q = query.toLowerCase();
		return systems.filter(
			(s) =>
				s.title.toLowerCase().includes(q) ||
				s.category.toLowerCase().includes(q) ||
				s.summary.toLowerCase().includes(q),
		);
	}, [systems, query]);

	useLayoutEffect(() => {
		if (!open) return;
		const el = triggerRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();

		const width = 340;
		let left = r.left;
		if (left + width > window.innerWidth - 20) {
			left = window.innerWidth - 20 - width;
		}

		if (r.bottom + 420 > window.innerHeight && r.top > 420) {
			// 如果下方空间不足且上方空间足够，则向上展开
			setPos({
				bottom: window.innerHeight - r.top + 6,
				left: Math.max(10, left),
				width: width,
			});
		} else {
			// 否则向下展开
			setPos({
				top: r.bottom + 6,
				left: Math.max(10, left),
				width: width,
			});
		}
	}, [open, window.innerWidth]);

	useEffect(() => {
		if (!open) return;
		const handle = (e: MouseEvent) => {
			const t = e.target as Node;
			if (triggerRef.current?.contains(t)) return;
			if (popRef.current?.contains(t)) return;
			setOpen(false);
		};
		const onEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		const onScroll = (e: Event) => {
			const t = e.target as Node;
			if (popRef.current?.contains(t)) return;
			setOpen(false);
		};

		document.addEventListener("mousedown", handle);
		document.addEventListener("keydown", onEsc);
		// 监听全局捕获阶段的滚动，任意非弹窗内的滚动都关闭弹窗
		window.addEventListener("scroll", onScroll, true);

		return () => {
			document.removeEventListener("mousedown", handle);
			document.removeEventListener("keydown", onEsc);
			window.removeEventListener("scroll", onScroll, true);
		};
	}, [open]);

	// 当弹窗关闭时，重置搜索条件
	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	return (
		<div className="relative w-full">
			<button
				ref={triggerRef}
				type="button"
				disabled={disabled}
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"w-full flex items-center gap-2 px-3 py-2.5 text-[13px] transition-all duration-200",
					"bg-white/80 dark:bg-cream-900/50 backdrop-blur-sm",
					"border border-cream-200 dark:border-cream-600/60",
					"rounded-xl text-left shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
					"hover:border-cream-300 dark:hover:border-cream-500 hover:bg-white dark:hover:bg-cream-900",
					"focus:outline-none focus:ring-4 focus:ring-[#D96C46]/10 focus:border-[#D96C46]/40 focus:bg-white dark:focus:bg-cream-900",
					"disabled:opacity-50 disabled:cursor-not-allowed",
					open &&
						"ring-4 ring-[#D96C46]/10 border-[#D96C46]/40 bg-white dark:bg-cream-900",
				)}
			>
				{selected ? (
					<>
						<Swatches colors={selected.swatches} />
						<span className="flex-1 truncate font-semibold text-[#D96C46]">
							{selected.title}
						</span>
						<div
							role="button"
							tabIndex={0}
							className="shrink-0 p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-cream-100 dark:hover:bg-cream-700 transition-colors cursor-pointer"
							aria-label="清除已选系统"
							onClick={(e) => {
								e.stopPropagation();
								onChange(null);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									e.stopPropagation();
									onChange(null);
								}
							}}
						>
							<X className="w-3.5 h-3.5" strokeWidth={2.5} />
						</div>
					</>
				) : (
					<span className="flex-1 truncate text-text-muted font-medium">
						不绑定（让 Agent 自由发挥）
					</span>
				)}
				<ChevronDown
					className={cn(
						"w-4 h-4 text-text-muted transition-transform duration-300 shrink-0",
						open && "rotate-180 text-[#D96C46]",
					)}
					strokeWidth={2}
				/>
			</button>

			{open &&
				createPortal(
					<div
						ref={popRef}
						style={{
							position: "fixed",
							top: pos.top,
							bottom: pos.bottom,
							left: pos.left,
							width: pos.width,
							zIndex: 9999,
						}}
						className="bg-cream-50 dark:bg-cream-900 rounded-2xl border border-cream-200 dark:border-cream-700 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
					>
						{/* 搜索头 */}
						<div className="p-2 border-b border-cream-200 dark:border-cream-700/60 bg-white/50 dark:bg-black/20 backdrop-blur-md">
							<div className="relative">
								<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/60" />
								<input
									type="text"
									// eslint-disable-next-line jsx-a11y/no-autofocus
									autoFocus
									placeholder="搜索设计系统..."
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									className="w-full pl-8 pr-3 py-2 text-[12px] bg-white dark:bg-cream-950 border border-cream-300 dark:border-cream-700 rounded-xl focus:outline-none focus:border-[#D96C46]/50 transition-colors placeholder:text-text-muted/60"
								/>
							</div>
						</div>

						{/* 列表 */}
						<div className="p-2.5 max-h-[400px] overflow-y-auto custom-scrollbar flex flex-col gap-2.5">
							{/* 不绑定选项 */}
							{!query && (
								<button
									type="button"
									onClick={() => {
										onChange(null);
										setOpen(false);
									}}
									className={cn(
										"w-full text-left rounded-xl border p-3 transition-all duration-200 group relative overflow-hidden",
										!value
											? "border-[#D96C46] bg-[#D96C46]/5 shadow-[0_0_0_1px_#D96C46]"
											: "border-cream-300 dark:border-cream-700 bg-white dark:bg-cream-800 hover:border-[#D96C46]/40 hover:shadow-sm",
									)}
								>
									<div
										className={cn(
											"font-semibold text-[13px] transition-colors",
											!value
												? "text-[#D96C46]"
												: "text-text-primary group-hover:text-[#D96C46]",
										)}
									>
										不绑定（让 Agent 自由发挥）
									</div>
									<div className="text-[11px] text-text-muted mt-1">
										默认选项，Agent 将根据提示词推断设计风格
									</div>
									{!value && (
										<div className="absolute top-1/2 right-3 -translate-y-1/2 text-[#D96C46]">
											<Check className="w-4 h-4" />
										</div>
									)}
								</button>
							)}

							{/* 系统卡片列表 */}
							<div className="grid grid-cols-2 gap-2.5">
								{filteredSystems.map((s) => {
									const isActive = value === s.id;
									return (
										<button
											key={s.id}
											type="button"
											onClick={() => {
												onChange(s.id);
												setOpen(false);
											}}
											className={cn(
												"group relative flex flex-col text-left rounded-xl border overflow-hidden transition-all duration-300",
												isActive
													? "border-[#D96C46] ring-1 ring-[#D96C46] shadow-sm z-10"
													: "border-cream-200 dark:border-cream-700 bg-white dark:bg-cream-900 hover:border-cream-400 hover:shadow-md hover:-translate-y-0.5",
											)}
										>
											<div className="h-24 w-full relative bg-cream-100 dark:bg-cream-800 overflow-hidden">
												<SystemThumbnail
													systemId={s.id}
													swatches={s.swatches}
													title={s.title}
													className="w-full h-full transform transition-transform duration-500 group-hover:scale-105"
												/>
												{isActive && (
													<div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#D96C46] text-white flex items-center justify-center shadow-md animate-in zoom-in duration-200">
														<Check className="w-3.5 h-3.5" strokeWidth={2.5} />
													</div>
												)}
											</div>
											<div className="p-2.5 bg-white/95 dark:bg-cream-900/95 backdrop-blur-sm border-t border-cream-100 dark:border-cream-800">
												<div
													className={cn(
														"font-bold text-[12px] truncate transition-colors",
														isActive
															? "text-[#D96C46]"
															: "text-text-primary group-hover:text-[#D96C46]",
													)}
												>
													{s.title}
												</div>
												<div className="flex items-center justify-between mt-1">
													<div className="text-[10px] text-text-secondary bg-cream-100 dark:bg-cream-800 px-1.5 py-0.5 rounded font-medium">
														{s.category}
													</div>
												</div>
											</div>
										</button>
									);
								})}
							</div>

							{filteredSystems.length === 0 && (
								<div className="px-3 py-8 text-center flex flex-col items-center justify-center text-text-muted gap-2">
									<Search className="w-6 h-6 text-cream-300 dark:text-cream-700" />
									<span className="text-xs">没有找到匹配的设计系统</span>
								</div>
							)}
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}
