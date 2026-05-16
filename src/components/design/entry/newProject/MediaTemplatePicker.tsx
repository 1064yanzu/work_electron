/**
 * MediaTemplatePicker — 媒体生成的提示词模板挑选器
 *
 * 显示内置（来自 open-design prompt-templates）+ 用户导入/保存 的媒体模板。
 * 选中后回填 prompt + model + aspect + duration 到媒体生成表单。
 */
import { useEffect, useMemo, useState } from "react";
import {
	BookmarkPlus,
	CheckCircle2,
	Download,
	ImageIcon,
	Loader2,
	Search,
	Star,
	Trash2,
	UserCircle2,
	Video,
	X,
} from "lucide-react";
import {
	designDeleteMediaTemplate,
	designGetMediaTemplate,
	designImportMediaTemplate,
	designListMediaTemplates,
	designPickMediaTemplateFile,
	type DesignMediaTemplateSummary,
	type MediaTemplateKind,
	type MediaTemplateSource,
} from "../../../../lib/api/design";
import { cn } from "../../../../lib/utils";
import { toast } from "../../../ui/Toast";

interface MediaTemplatePickerProps {
	kind: MediaTemplateKind;
	value: string | null;
	onApply: (template: {
		id: string;
		prompt: string;
		aspect?: string;
		duration_sec?: number;
		model?: string;
	}) => void;
}

type SourceFilter = "all" | MediaTemplateSource;

const SOURCE_TABS: {
	value: SourceFilter;
	label: string;
	icon: React.ReactNode;
}[] = [
	{ value: "all", label: "全部", icon: <Star className="w-3 h-3" /> },
	{ value: "user", label: "我的", icon: <UserCircle2 className="w-3 h-3" /> },
	{
		value: "builtin",
		label: "内置",
		icon: <BookmarkPlus className="w-3 h-3" />,
	},
];

function fallbackGradient(id: string) {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = id.charCodeAt(i) + ((hash << 5) - hash);
	}
	const h1 = Math.abs(hash) % 360;
	const h2 = (h1 + 40) % 360;
	return `linear-gradient(135deg, hsl(${h1}, 65%, 80%), hsl(${h2}, 70%, 88%))`;
}

export function MediaTemplatePicker({
	kind,
	value,
	onApply,
}: MediaTemplatePickerProps) {
	const [templates, setTemplates] = useState<DesignMediaTemplateSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
	const [applying, setApplying] = useState<string | null>(null);
	const [open, setOpen] = useState(false);

	const refresh = async () => {
		setLoading(true);
		try {
			const list = await designListMediaTemplates({ kind });
			setTemplates(list);
		} catch (err) {
			console.warn("[MediaTemplatePicker] list failed", err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [kind]);

	const filtered = useMemo(() => {
		let list = templates;
		if (sourceFilter !== "all") {
			list = list.filter((t) => t.source === sourceFilter);
		}
		if (query.trim()) {
			const q = query.trim().toLowerCase();
			list = list.filter(
				(t) =>
					t.title.toLowerCase().includes(q) ||
					t.summary.toLowerCase().includes(q) ||
					(t.category && t.category.toLowerCase().includes(q)) ||
					t.tags.some((tag) => tag.toLowerCase().includes(q)),
			);
		}
		return list;
	}, [templates, query, sourceFilter]);

	const handleApply = async (t: DesignMediaTemplateSummary) => {
		setApplying(t.id);
		try {
			const detail = await designGetMediaTemplate(t.id, t.source);
			if (!detail) {
				toast.error("模板加载失败");
				return;
			}
			onApply({
				id: detail.id,
				prompt: detail.prompt,
				aspect: detail.aspect,
				duration_sec: detail.duration_sec,
				model: detail.model,
			});
			toast.success(`已套用模板：${detail.title}`);
		} catch (err) {
			toast.error(
				`套用失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setApplying(null);
		}
	};

	const handleImport = async () => {
		try {
			const filePath = await designPickMediaTemplateFile();
			if (!filePath) return;
			await designImportMediaTemplate(filePath);
			toast.success("已导入模板");
			await refresh();
		} catch (err) {
			toast.error(
				`导入失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const handleDelete = async (t: DesignMediaTemplateSummary) => {
		if (t.source !== "user") return;
		try {
			const r = await designDeleteMediaTemplate(t.id, t.kind);
			if (r.success) {
				toast.success("已删除");
				await refresh();
			} else {
				toast.error("删除失败");
			}
		} catch (err) {
			toast.error(
				`删除失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const total = templates.length;
	const summaryText =
		total === 0
			? "暂无模板"
			: `${total} 个模板 · 内置 ${templates.filter((t) => t.source === "builtin").length} / 我的 ${templates.filter((t) => t.source === "user").length}`;

	return (
		<div className="flex flex-col gap-2">
			{/* 折叠头 */}
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"flex items-center justify-between w-full px-3 py-2 rounded-xl border text-left",
					"bg-white/70 dark:bg-cream-900/40 border-cream-200 dark:border-cream-600/60",
					"hover:border-[#D96C46]/30 hover:bg-white dark:hover:bg-cream-900/60 transition-all duration-150",
				)}
			>
				<div className="flex items-center gap-2 min-w-0">
					<div className="w-6 h-6 rounded-lg bg-[#D96C46]/10 text-[#D96C46] flex items-center justify-center">
						{kind === "image" ? (
							<ImageIcon className="w-3.5 h-3.5" strokeWidth={1.8} />
						) : (
							<Video className="w-3.5 h-3.5" strokeWidth={1.8} />
						)}
					</div>
					<div className="min-w-0">
						<div className="text-[12.5px] font-semibold text-text-primary">
							从模板开始（可选）
						</div>
						<div className="text-[10.5px] text-text-muted truncate">
							{summaryText}
						</div>
					</div>
				</div>
				<div className="text-[11px] text-text-muted shrink-0">
					{open ? "收起" : "展开"}
				</div>
			</button>

			{open && (
				<div className="rounded-xl border border-cream-200 dark:border-cream-600/60 bg-cream-50/60 dark:bg-cream-900/30 p-2.5 flex flex-col gap-2.5">
					{/* 搜索 + source filter + 导入 */}
					<div className="flex items-center gap-1.5">
						<div className="relative flex-1 min-w-0">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/60" />
							<input
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="搜索模板…"
								className={cn(
									"w-full pl-7 pr-7 py-1.5 text-[12px] rounded-lg border",
									"border-cream-200 dark:border-cream-600/60 bg-white/80 dark:bg-cream-900/50",
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
									<X className="w-3 h-3" />
								</button>
							)}
						</div>
						<button
							type="button"
							onClick={() => void handleImport()}
							className={cn(
								"shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11.5px] font-medium",
								"bg-white/80 dark:bg-cream-900/50 border border-cream-200 dark:border-cream-600/60",
								"text-text-secondary hover:text-text-primary hover:border-[#D96C46]/30",
								"transition-colors",
							)}
							title="从本地 JSON 文件导入模板"
						>
							<Download className="w-3 h-3" />
							导入
						</button>
					</div>

					{/* source 切换 */}
					<div className="flex gap-1">
						{SOURCE_TABS.map((s) => {
							const count =
								s.value === "all"
									? templates.length
									: templates.filter((t) => t.source === s.value).length;
							const active = sourceFilter === s.value;
							return (
								<button
									key={s.value}
									type="button"
									onClick={() => setSourceFilter(s.value)}
									className={cn(
										"px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors",
										active
											? "bg-[#D96C46] text-white shadow-sm"
											: "bg-white/60 dark:bg-cream-900/40 text-text-muted hover:bg-cream-200/60 dark:hover:bg-cream-800",
									)}
								>
									{s.icon}
									{s.label}
									<span className="opacity-60">({count})</span>
								</button>
							);
						})}
					</div>

					{/* 列表 */}
					{loading ? (
						<div className="flex items-center justify-center py-6 text-text-muted text-[12px] gap-2">
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
							正在加载…
						</div>
					) : filtered.length === 0 ? (
						<EmptyState
							sourceFilter={sourceFilter}
							onImport={() => void handleImport()}
						/>
					) : (
						<div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto custom-scrollbar pr-1 -mr-1">
							{filtered.map((t) => {
								const active = t.id === value;
								return (
									<div
										key={`${t.source}:${t.id}`}
										className={cn(
											"group relative rounded-lg overflow-hidden border bg-white dark:bg-cream-900 transition-all duration-200 cursor-pointer",
											active
												? "border-[#D96C46] shadow-[0_0_0_1px_#D96C46]"
												: "border-cream-200 dark:border-cream-600/50 hover:border-[#D96C46]/40 hover:-translate-y-0.5 hover:shadow-sm",
										)}
										onClick={() => void handleApply(t)}
									>
										{/* 封面 */}
										<div
											className="aspect-[16/10] w-full overflow-hidden bg-cover bg-center relative"
											style={{
												backgroundImage: t.preview_image_url
													? `url("${t.preview_image_url}")`
													: undefined,
												background: t.preview_image_url
													? undefined
													: fallbackGradient(t.id),
											}}
										>
											{/* source badge */}
											<div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/80 dark:bg-black/60 backdrop-blur-sm text-text-primary">
												{t.source === "user" ? "我的" : "内置"}
											</div>
											{active && (
												<div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#D96C46] text-white flex items-center justify-center">
													<CheckCircle2 className="w-3 h-3" />
												</div>
											)}
											{applying === t.id && (
												<div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-[11px] gap-1">
													<Loader2 className="w-3.5 h-3.5 animate-spin" />
													套用中…
												</div>
											)}
										</div>
										{/* 文本 */}
										<div className="p-2">
											<div className="text-[11.5px] font-semibold text-text-primary line-clamp-1">
												{t.title}
											</div>
											<div className="text-[10px] text-text-muted line-clamp-2 mt-0.5 leading-snug">
												{t.summary || (t.category ?? "")}
											</div>
											<div className="flex items-center gap-1 mt-1.5">
												{t.aspect && (
													<span className="px-1 py-px rounded bg-cream-100 dark:bg-cream-800 text-[9px] text-text-secondary">
														{t.aspect}
													</span>
												)}
												{t.model && (
													<span className="px-1 py-px rounded bg-cream-100 dark:bg-cream-800 text-[9px] text-text-secondary truncate max-w-[80px]">
														{t.model}
													</span>
												)}
												{t.source === "user" && (
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															void handleDelete(t);
														}}
														className="ml-auto text-text-muted/70 hover:text-[#b53333] opacity-0 group-hover:opacity-100 transition-opacity"
														title="删除"
													>
														<Trash2 className="w-3 h-3" />
													</button>
												)}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function EmptyState({
	sourceFilter,
	onImport,
}: {
	sourceFilter: SourceFilter;
	onImport: () => void;
}) {
	if (sourceFilter === "user") {
		return (
			<div className="flex flex-col items-center gap-2 py-6 px-3 text-center">
				<div className="text-[12px] text-text-muted">你还没有保存任何模板</div>
				<div className="text-[10.5px] text-text-light leading-relaxed">
					生成完成后点「保存为模板」，
					<br />
					或从 JSON 文件直接导入。
				</div>
				<button
					type="button"
					onClick={onImport}
					className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[#D96C46] text-white hover:bg-[#c25c39] transition-colors"
				>
					<Download className="w-3 h-3" />从 JSON 导入
				</button>
			</div>
		);
	}
	return (
		<div className="px-3 py-6 text-center text-[11.5px] text-text-muted">
			没有匹配的模板
		</div>
	);
}
