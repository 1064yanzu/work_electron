/**
 * DesignSystemPicker — 设计系统下拉（带 swatches 预览）
 *
 * 触发器是自定义的 button（不复用 Select，因为需要在选中态左侧显示色块），
 * 弹出层用 Portal 渲染。键盘交互简化版（Escape / 点外部关闭即可）。
 */
import { ChevronDown, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { designListSystems } from "../../../../lib/api/design";
import { cn } from "../../../../lib/utils";

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
	const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
	const triggerRef = useRef<HTMLButtonElement>(null);
	const popRef = useRef<HTMLDivElement>(null);

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

	useLayoutEffect(() => {
		if (!open) return;
		const el = triggerRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		setPos({
			top: r.bottom + window.scrollY + 6,
			left: r.left + window.scrollX,
			width: r.width,
		});
	}, [open]);

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
		document.addEventListener("mousedown", handle);
		document.addEventListener("keydown", onEsc);
		return () => {
			document.removeEventListener("mousedown", handle);
			document.removeEventListener("keydown", onEsc);
		};
	}, [open]);

	return (
		<div className="relative w-full">
			<button
				ref={triggerRef}
				type="button"
				disabled={disabled}
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"w-full flex items-center gap-2 px-3 py-2 text-[13px]",
					"bg-cream-50 dark:bg-cream-900",
					"border border-cream-300 dark:border-cream-500",
					"rounded-xl text-left",
					"hover:bg-cream-100 dark:hover:bg-cream-800 hover:border-cream-400",
					"transition-all duration-150",
					"focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/40",
					"disabled:opacity-50 disabled:cursor-not-allowed",
					open && "ring-2 ring-primary/15 border-primary/40",
				)}
			>
				{selected ? (
					<>
						<Swatches colors={selected.swatches} />
						<span className="flex-1 truncate font-medium text-text-primary">
							{selected.title}
						</span>
						<button
							type="button"
							className="shrink-0 p-0.5 rounded-md text-text-muted hover:text-text-primary hover:bg-cream-200 dark:hover:bg-cream-800/60"
							aria-label="清除已选系统"
							onClick={(e) => {
								e.stopPropagation();
								onChange(null);
							}}
						>
							<X className="w-3 h-3" strokeWidth={2} />
						</button>
					</>
				) : (
					<span className="flex-1 truncate text-text-light">
						不绑定（让 Agent 自由发挥）
					</span>
				)}
				<ChevronDown
					className={cn(
						"w-3.5 h-3.5 text-text-light transition-transform duration-150 shrink-0",
						open && "rotate-180",
					)}
					strokeWidth={2}
				/>
			</button>

			{open &&
				createPortal(
					<div
						ref={popRef}
						style={{
							position: "absolute",
							top: pos.top,
							left: pos.left,
							width: Math.max(pos.width, 260),
							zIndex: 9999,
						}}
						className="bg-cream-50 dark:bg-cream-900 rounded-2xl border border-cream-400 dark:border-cream-500 shadow-bai-pop overflow-hidden flex flex-col"
					>
						<div className="p-1 max-h-72 overflow-y-auto custom-scrollbar">
							<button
								type="button"
								onClick={() => {
									onChange(null);
									setOpen(false);
								}}
								className={cn(
									"w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] text-left",
									"hover:bg-cream-100 dark:hover:bg-cream-800/60",
									!value && "bg-cream-200/70 dark:bg-cream-800 font-medium",
								)}
							>
								<span className="w-3.5 h-3.5 rounded-full border border-cream-400 bg-cream-100" />
								<span className="flex-1 truncate text-text-secondary">
									不绑定
								</span>
							</button>
							{systems.map((s) => (
								<button
									key={s.id}
									type="button"
									onClick={() => {
										onChange(s.id);
										setOpen(false);
									}}
									className={cn(
										"w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] text-left",
										"hover:bg-cream-100 dark:hover:bg-cream-800/60",
										value === s.id &&
											"bg-cream-200/70 dark:bg-cream-800 font-medium",
									)}
								>
									<Swatches colors={s.swatches} />
									<div className="min-w-0 flex-1">
										<div className="truncate text-text-primary">{s.title}</div>
										<div className="truncate text-[11px] text-text-light">
											{s.category}
										</div>
									</div>
								</button>
							))}
							{systems.length === 0 && (
								<div className="px-3 py-6 text-center text-xs text-text-light">
									暂无可用设计系统
								</div>
							)}
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}
