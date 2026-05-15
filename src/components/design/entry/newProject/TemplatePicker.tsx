import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { designListTemplates, designGetTemplateDetail, type DesignTemplateSummary } from "../../../../lib/api/design";
import { cn } from "../../../../lib/utils";
import { Layers, Presentation, LayoutTemplate, Eye, CheckCircle2, Loader2, X, Search } from "lucide-react";

interface TemplatePickerProps {
	value: string | null;
	onChange: (value: string | null) => void;
}

const MODE_ICONS: Record<string, React.ReactNode> = {
	prototype: <Layers className="w-3 h-3" />,
	deck: <Presentation className="w-3 h-3" />,
	template: <LayoutTemplate className="w-3 h-3" />,
	"design-system": <LayoutTemplate className="w-3 h-3" />,
};

const MODE_LABEL: Record<string, string> = {
	prototype: "原型",
	deck: "幻灯片",
	template: "模板",
	"design-system": "设计系统",
};

const ALL_MODES = ["prototype", "deck", "template"] as const;

function getGradient(id: string) {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = id.charCodeAt(i) + ((hash << 5) - hash);
	}
	const h1 = Math.abs(hash) % 360;
	const h2 = (h1 + 40) % 360;
	return `linear-gradient(135deg, hsl(${h1}, 70%, 85%), hsl(${h2}, 70%, 90%))`;
}

function PreviewModal({ templateId, onClose }: { templateId: string; onClose: () => void }) {
	const [html, setHtml] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const detail = await designGetTemplateDetail(templateId);
				if (!cancelled) {
					setHtml(detail?.example_html || null);
				}
			} catch (err) {
				console.error(err);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => { cancelled = true; };
	}, [templateId]);

	return createPortal(
		<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-8" onClick={onClose}>
			<div 
				className="relative w-full max-w-5xl h-full max-h-[85vh] bg-white dark:bg-cream-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-cream-200 dark:border-cream-700"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-cream-700 bg-cream-50/50 dark:bg-cream-900/50">
					<div className="text-sm font-medium text-text-primary flex items-center gap-2">
						<Eye className="w-4 h-4 text-text-muted" />
						模板预览
					</div>
					<button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:bg-cream-200 dark:hover:bg-cream-800 transition-colors">
						<X className="w-4 h-4" />
					</button>
				</div>
				<div className="flex-1 relative bg-cream-100 dark:bg-black/20">
					{loading ? (
						<div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted gap-3">
							<Loader2 className="w-6 h-6 animate-spin" />
							<span className="text-sm">加载预览中...</span>
						</div>
					) : html ? (
						<iframe 
							srcDoc={html} 
							className="w-full h-full border-none bg-white"
							sandbox="allow-scripts allow-same-origin"
							title="Template Preview"
						/>
					) : (
						<div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
							暂无预览内容
						</div>
					)}
				</div>
			</div>
		</div>,
		document.body
	);
}

export function TemplatePicker({ value, onChange }: TemplatePickerProps) {
	const [templates, setTemplates] = useState<DesignTemplateSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [modeFilter, setModeFilter] = useState<string | null>(null);
	const [previewId, setPreviewId] = useState<string | null>(null);

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
			<div className="flex flex-col gap-3">
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						className="h-32 rounded-2xl bg-cream-100/70 dark:bg-cream-800/40 animate-pulse"
					/>
				))}
			</div>
		);
	}

	if (templates.length === 0) {
		return (
			<div className="px-3 py-8 text-center text-[12.5px] text-text-light rounded-2xl border border-dashed border-cream-300">
				暂无模板，请先运行 <code className="font-mono bg-cream-100 dark:bg-cream-800 px-1 py-0.5 rounded">node scripts/import-open-design.mjs</code> 导入
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{/* 搜索框 */}
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/60" />
				<input
					type="text"
					placeholder="搜索精美模板..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className={cn(
						"w-full pl-9 pr-8 py-2.5 text-[13px] rounded-xl border",
						"border-cream-300 dark:border-cream-500/60",
						"bg-white/60 dark:bg-cream-900/60 backdrop-blur-sm",
						"text-text-primary placeholder:text-text-muted/70",
						"focus:outline-none focus:border-[#D96C46]/60 focus:bg-white dark:focus:bg-cream-800",
						"shadow-sm transition-all duration-200",
					)}
				/>
				{query && (
					<button
						type="button"
						onClick={() => setQuery("")}
						className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary bg-cream-100 dark:bg-cream-800 rounded-full p-0.5 transition-colors"
					>
						<X className="w-3 h-3" />
					</button>
				)}
			</div>

			{/* 模式筛选标签 */}
			<div className="flex gap-1.5 flex-wrap px-0.5">
				<button
					type="button"
					onClick={() => setModeFilter(null)}
					className={cn(
						"px-2.5 py-1 rounded-lg text-[11px] transition-all duration-200 font-medium",
						!modeFilter
							? "bg-[#D96C46] text-white shadow-sm"
							: "bg-cream-200/60 dark:bg-cream-800 text-text-muted hover:bg-cream-300 dark:hover:bg-cream-700",
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
								"px-2.5 py-1 rounded-lg text-[11px] transition-all duration-200 font-medium flex items-center gap-1.5",
								modeFilter === mode
									? "bg-[#D96C46] text-white shadow-sm"
									: "bg-cream-200/60 dark:bg-cream-800 text-text-muted hover:bg-cream-300 dark:hover:bg-cream-700",
							)}
						>
							{MODE_ICONS[mode]}
							{MODE_LABEL[mode] ?? mode} ({count})
						</button>
					);
				})}
			</div>

			{/* 结果数量 */}
			{(query || modeFilter) && (
				<div className="text-[11px] font-medium text-text-muted px-1 mt-1">
					找到 {filtered.length} 个模板
				</div>
			)}

			{/* 模板卡片列表 */}
			<div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto px-1 pb-2 custom-scrollbar -mx-1">
				{filtered.length === 0 ? (
					<div className="px-3 py-8 text-center text-[12.5px] text-text-muted">
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
									"group relative w-full text-left rounded-2xl border overflow-hidden transition-all duration-300",
									"focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D96C46]/50",
									active
										? "border-[#D96C46] shadow-[0_0_0_1px_#D96C46] bg-[#D96C46]/5 dark:bg-[#D96C46]/10"
										: "border-cream-300 dark:border-cream-600/50 bg-white/60 dark:bg-cream-900/60 hover:border-[#D96C46]/40 hover:shadow-md hover:-translate-y-0.5",
								)}
							>
								{/* Top Image / Gradient Area */}
								<div 
									className="h-[84px] w-full relative overflow-hidden flex items-center justify-center border-b border-cream-200 dark:border-cream-700/50 transition-transform duration-500 group-hover:scale-[1.02]"
									style={{ background: getGradient(t.id) }}
								>
									{/* Badge for Mode */}
									{t.mode && (
										<div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-white/70 dark:bg-black/50 backdrop-blur-md text-[10px] font-medium text-text-primary flex items-center gap-1.5 shadow-sm">
											{MODE_ICONS[t.mode]}
											{MODE_LABEL[t.mode] ?? t.mode}
										</div>
									)}

									{/* Preview Button (shows on hover if has_example) */}
									{t.has_example && (
										<div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 dark:group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
											<button 
												type="button"
												onClick={(e) => { 
													e.stopPropagation(); 
													setPreviewId(t.id); 
												}}
												className="px-3.5 py-1.5 rounded-full bg-white/95 dark:bg-cream-800/95 text-text-primary text-[11.5px] font-medium shadow-lg flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-transform"
											>
												<Eye className="w-3.5 h-3.5" />
												实时预览
											</button>
										</div>
									)}

									{/* Active Checkmark */}
									{active && (
										<div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#D96C46] text-white flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
											<CheckCircle2 className="w-3.5 h-3.5" />
										</div>
									)}
								</div>

								{/* Content Area */}
								<div className="p-3.5">
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0 flex-1">
											<div className={cn(
												"text-[13.5px] font-bold truncate transition-colors",
												active ? "text-[#D96C46]" : "text-text-primary group-hover:text-[#D96C46]"
											)}>
												{t.name || t.id}
											</div>
											<div className="text-[11.5px] text-text-muted mt-1.5 line-clamp-2 leading-relaxed">
												{t.description || "暂无描述"}
											</div>
										</div>
									</div>

									{/* Tags / Metadata */}
									{(t.platform || t.category) && (
										<div className="mt-3 flex flex-wrap gap-1.5">
											{t.platform && (
												<span className="px-2 py-0.5 rounded bg-cream-200/50 dark:bg-cream-800/50 text-[10px] text-text-secondary font-medium">
													{t.platform}
												</span>
											)}
											{t.category && (
												<span className="px-2 py-0.5 rounded bg-cream-200/50 dark:bg-cream-800/50 text-[10px] text-text-secondary font-medium">
													{t.category}
												</span>
											)}
										</div>
									)}
								</div>
							</button>
						);
					})
				)}
			</div>

			{/* Preview Modal */}
			{previewId && <PreviewModal templateId={previewId} onClose={() => setPreviewId(null)} />}
		</div>
	);
}
