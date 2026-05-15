/**
 * TemplatePicker — 从 open-design 导入的模板库中选择模板
 *
 * 数据来源：designListTemplates()（IPC → templateRegistry → vendor/open-design/templates）
 * 展示方式：分组标签 + 搜索框，让用户从 100+ 模板中快速定位
 */
import { useEffect, useMemo, useState } from "react";
import { designListTemplates, type DesignTemplateSummary } from "../../../../lib/api/design";
import { cn } from "../../../../lib/utils";

interface TemplatePickerProps {
	value: string | null;
	onChange: (value: string | null) => void;
}

// 模式标签映射
const MODE_LABEL: Record<string, string> = {
	prototype: "原型",
	deck: "幻灯片",
	template: "模板",
	"design-system": "设计系统",
};

const ALL_MODES = ["prototype", "deck", "template"] as const;

export function TemplatePicker({ value, onChange }: TemplatePickerProps) {
	const [templates, setTemplates] = useState<DesignTemplateSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [modeFilter, setModeFilter] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const list = await designListTemplates();
				if (cancelled) return;
				setTemplates(list);
			} catch (err) {
				console.warn("[TemplatePicker] load failed", err);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const filtered = useMemo(() => {
		let list = templates;
		if (modeFilter) {
			list = list.filter((t) => t.mode === modeFilter);
		}
		if (query.trim()) {
			const q = query.trim().toLowerCase();
			list = list.filter(
				(t) =>
					t.id.toLowerCase().includes(q) ||
					t.name.toLowerCase().includes(q) ||
					t.description.toLowerCase().includes(q) ||
					t.triggers.some((tr) => tr.toLowerCase().includes(q)),
			);
		}
		return list;
	}, [templates, query, modeFilter]);

	if (loading) {
		return (
			<div className="flex flex-col gap-2">
				{[0, 1, 2, 3].map((i) => (
					<div
						key={i}
						className="h-14 rounded-xl bg-cream-100/70 dark:bg-cream-800/40 animate-pulse"
					/>
				))}
			</div>
		);
	}

	if (templates.length === 0) {
		return (
			<div className="px-3 py-6 text-center text-xs text-text-light rounded-xl border border-dashed border-cream-300">
				暂无模板，请先运行 <code className="font-mono">node scripts/import-open-design.mjs</code> 导入
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{/* 搜索框 */}
			<div className="relative">
				<input
					type="text"
					placeholder="搜索模板..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className={cn(
						"w-full px-3 py-2 text-[13px] rounded-lg border",
						"border-cream-300 dark:border-cream-500/60",
						"bg-cream-50 dark:bg-cream-900",
						"text-text-primary placeholder:text-text-muted",
						"focus:outline-none focus:border-[#D96C46]/60 focus:bg-white dark:focus:bg-cream-800",
						"transition-all duration-150",
					)}
				/>
				{query && (
					<button
						type="button"
						onClick={() => setQuery("")}
						className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs"
					>
						✕
					</button>
				)}
			</div>

			{/* 模式筛选标签 */}
			<div className="flex gap-1 flex-wrap">
				<button
					type="button"
					onClick={() => setModeFilter(null)}
					className={cn(
						"px-2 py-0.5 rounded-md text-[11px] transition-all duration-100",
						!modeFilter
							? "bg-[#D96C46]/15 text-[#A8482B] dark:text-[#F2C4A8] font-medium"
							: "bg-cream-100 dark:bg-cream-800 text-text-muted hover:bg-cream-200",
					)}
				>
					全部 ({templates.length})
				</button>
				{ALL_MODES.map((mode) => {
					const count = templates.filter((t) => t.mode === mode).length;
					if (count === 0) return null;
					return (
						<button
							key={mode}
							type="button"
							onClick={() => setModeFilter(modeFilter === mode ? null : mode)}
							className={cn(
								"px-2 py-0.5 rounded-md text-[11px] transition-all duration-100",
								modeFilter === mode
									? "bg-[#D96C46]/15 text-[#A8482B] dark:text-[#F2C4A8] font-medium"
									: "bg-cream-100 dark:bg-cream-800 text-text-muted hover:bg-cream-200",
							)}
						>
							{MODE_LABEL[mode] ?? mode} ({count})
						</button>
					);
				})}
			</div>

			{/* 结果数量 */}
			{(query || modeFilter) && (
				<div className="text-[11px] text-text-muted px-0.5">
					找到 {filtered.length} 个模板
				</div>
			)}

			{/* 模板列表 */}
			<div className="flex flex-col gap-1 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
				{filtered.length === 0 ? (
					<div className="px-3 py-4 text-center text-xs text-text-muted">
						没有匹配的模板
					</div>
				) : (
					filtered.map((t) => {
						const active = t.id === value;
						return (
							<button
								key={t.id}
								type="button"
								onClick={() => onChange(active ? null : t.id)}
								className={cn(
									"w-full text-left px-3 py-2 rounded-xl border transition-all duration-150",
									"focus:outline-none focus-visible:shadow-[0_0_0_3px_var(--t-primary-muted)]",
									active
										? "border-[#D96C46] bg-[#D96C46]/8 dark:bg-[#D96C46]/14"
										: "border-cream-300 dark:border-cream-500/60 bg-cream-50 dark:bg-cream-900 hover:border-cream-400 hover:bg-cream-100/60",
								)}
							>
								<div className="flex items-start gap-2">
									<div className="min-w-0 flex-1">
										<div
											className={cn(
												"text-[13px] font-medium truncate",
												active
													? "text-[#A8482B] dark:text-[#F2C4A8]"
													: "text-text-primary",
											)}
										>
											{t.name || t.id}
										</div>
										{t.description && (
											<div
												className={cn(
													"text-[11.5px] line-clamp-1 mt-0.5",
													active
														? "text-[#A8482B]/80 dark:text-[#F2C4A8]/80"
														: "text-text-muted",
												)}
											>
												{t.description}
											</div>
										)}
									</div>
									<div className="flex flex-col items-end gap-1 shrink-0">
										{t.mode && (
											<span
												className={cn(
													"text-[10px] px-1.5 py-0.5 rounded-md",
													active
														? "bg-[#D96C46]/15 text-[#A8482B] dark:text-[#F2C4A8]"
														: "bg-cream-200/70 dark:bg-cream-700/60 text-text-muted",
												)}
											>
												{MODE_LABEL[t.mode] ?? t.mode}
											</span>
										)}
										{t.platform && (
											<span className="text-[9.5px] text-text-muted">
												{t.platform}
											</span>
										)}
									</div>
								</div>
							</button>
						);
					})
				)}
			</div>
		</div>
	);
}
