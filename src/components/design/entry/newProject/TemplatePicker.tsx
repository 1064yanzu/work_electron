/**
 * TemplatePicker — 「从模板」tab 的模板挑选器
 *
 * 数据源：design_list_user_design_templates
 *   仅显示用户沉淀（历史已完成 design_sessions）或导入的模板。
 *   不再混入 open-design 的预置 HTML 骨架（那些被移到媒体 tab 模板预设里）。
 */
import { useEffect, useMemo, useState } from "react";
import {
	BookmarkPlus,
	CheckCircle2,
	Layers,
	LayoutTemplate,
	Presentation,
	Search,
	X,
} from "lucide-react";
import {
	designListUserDesignTemplates,
	type DesignUserTemplateSummary,
} from "../../../../lib/api/design";
import { cn } from "../../../../lib/utils";

interface TemplatePickerProps {
	value: string | null;
	onChange: (value: string | null) => void;
}

const KIND_ICON: Record<string, React.ReactNode> = {
	prototype: <Layers className="w-3 h-3" />,
	deck: <Presentation className="w-3 h-3" />,
	template: <LayoutTemplate className="w-3 h-3" />,
};

const KIND_LABEL: Record<string, string> = {
	prototype: "原型",
	deck: "幻灯片",
	template: "模板",
};

function fallbackGradient(id: string) {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = id.charCodeAt(i) + ((hash << 5) - hash);
	}
	const h1 = Math.abs(hash) % 360;
	const h2 = (h1 + 40) % 360;
	return `linear-gradient(135deg, hsl(${h1}, 65%, 86%), hsl(${h2}, 70%, 92%))`;
}

function formatRelative(ts?: number): string {
	if (!ts) return "";
	const delta = Date.now() - ts;
	if (delta < 60_000) return "刚刚";
	if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
	if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
	if (delta < 30 * 86_400_000) return `${Math.floor(delta / 86_400_000)} 天前`;
	return new Date(ts).toLocaleDateString("zh-CN");
}

export function TemplatePicker({ value, onChange }: TemplatePickerProps) {
	const [templates, setTemplates] = useState<DesignUserTemplateSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");

	const refresh = async () => {
		setLoading(true);
		try {
			const list = await designListUserDesignTemplates();
			setTemplates(list);
		} catch (err) {
			console.warn("[TemplatePicker] load failed", err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void refresh();
	}, []);

	const filtered = useMemo(() => {
		if (!query.trim()) return templates;
		const q = query.trim().toLowerCase();
		return templates.filter((t) => t.title.toLowerCase().includes(q));
	}, [templates, query]);

	if (loading) {
		return (
			<div className="flex flex-col gap-2.5">
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						className="h-24 rounded-2xl bg-cream-100/70 dark:bg-cream-800/40 animate-pulse"
					/>
				))}
			</div>
		);
	}

	if (templates.length === 0) {
		return (
			<div className="flex flex-col items-center gap-3 px-3 py-8 text-center rounded-2xl border border-dashed border-cream-300 dark:border-cream-600/60 bg-cream-50/40 dark:bg-cream-900/30">
				<div className="w-10 h-10 rounded-2xl bg-[#D96C46]/10 text-[#D96C46] flex items-center justify-center">
					<BookmarkPlus className="w-5 h-5" strokeWidth={1.6} />
				</div>
				<div className="text-[12.5px] font-medium text-text-secondary">
					还没有可复用的模板
				</div>
				<div className="text-[11px] text-text-light leading-relaxed max-w-[260px]">
					完成一次设计后，它会自动沉淀到这里；
					<br />
					你也可以把以往作品「另存为模板」复用。
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2.5">
			{/* 搜索框 */}
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/60" />
				<input
					type="text"
					placeholder="搜索我的模板…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className={cn(
						"w-full pl-8 pr-7 py-2 text-[12.5px] rounded-xl border",
						"border-cream-200 dark:border-cream-600/60",
						"bg-white/80 dark:bg-cream-900/50",
						"text-text-primary placeholder:text-text-muted/60",
						"focus:outline-none focus:ring-2 focus:ring-[#D96C46]/20 focus:border-[#D96C46]/40",
					)}
				/>
				{query && (
					<button
						type="button"
						onClick={() => setQuery("")}
						className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				)}
			</div>

			{/* 列表 */}
			<div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto custom-scrollbar -mx-0.5 px-0.5">
				{filtered.length === 0 ? (
					<div className="px-3 py-6 text-center text-[12px] text-text-muted">
						没有匹配的模板
					</div>
				) : (
					filtered.map((t) => {
						const active = t.id === value;
						const kindKey = t.kind ?? "template";
						return (
							<button
								key={t.id}
								type="button"
								onClick={() => onChange(active ? null : t.id)}
								className={cn(
									"group relative w-full text-left flex items-stretch gap-3 rounded-xl border overflow-hidden transition-all duration-200",
									active
										? "border-[#D96C46] shadow-[0_0_0_1px_#D96C46] bg-[#D96C46]/5"
										: "border-cream-200 dark:border-cream-600/50 bg-white/70 dark:bg-cream-900/60 hover:border-[#D96C46]/40 hover:-translate-y-0.5 hover:shadow-sm",
								)}
							>
								<div
									className="w-20 shrink-0 relative bg-cover bg-center"
									style={{
										backgroundImage: t.thumbnail_url
											? `url("${t.thumbnail_url}")`
											: undefined,
										background: t.thumbnail_url
											? undefined
											: fallbackGradient(t.id),
									}}
								/>
								<div className="flex-1 min-w-0 py-2.5 pr-3">
									<div className="flex items-center gap-2">
										<div
											className={cn(
												"text-[13px] font-semibold truncate",
												active ? "text-[#D96C46]" : "text-text-primary",
											)}
										>
											{t.title}
										</div>
										{active && (
											<CheckCircle2 className="w-3.5 h-3.5 text-[#D96C46] shrink-0" />
										)}
									</div>
									<div className="flex items-center gap-1.5 mt-1">
										<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-cream-100 dark:bg-cream-800 text-text-secondary">
											{KIND_ICON[kindKey] ?? KIND_ICON.template}
											{KIND_LABEL[kindKey] ?? "模板"}
										</span>
										{t.updated_at && (
											<span className="text-[10.5px] text-text-muted">
												{formatRelative(t.updated_at)}
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
