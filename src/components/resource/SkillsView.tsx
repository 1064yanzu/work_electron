// Skills 管理视图 - 在左侧边栏中间栏展示

import { useMemo, useState } from "react";
import {
	ArrowDownToLine,
	ChevronDown,
	FolderOpen,
	Plus,
	RefreshCw,
	Search,
	Store,
	Trash2,
	X,
} from "lucide-react";
import { useSkillsStore } from "../../lib/skillsStore";
import { useUpdateBadge } from "../../lib/skillsMarketplaceStore";
import { pickSystemDirectory, revealFileSafe } from "../../lib/api/storage";
import { confirmDialog } from "../ui/ConfirmDialog";
import { IllustratedEmptyState } from "../ui/EmptyState";
import { cn } from "../../lib/utils";
import { MarketplaceList } from "../skills/MarketplaceList";
import { InstallProgress } from "../skills/InstallProgress";
import { useWorkspaceStoreSelector } from "../../lib/workspaceStore";
import { useSkillDragImport } from "./hooks/useSkillDragImport";
import { SidebarViewHeader } from "./sidebar/SidebarViewHeader";

type FilterType = "all" | "general" | "enabled";
type TabType = "installed" | "marketplace";

interface SkillsViewProps {
	onNavigateWorkbench?: () => void;
}

const FILTERS: Array<{ value: FilterType; label: string }> = [
	{ value: "all", label: "全部" },
	{ value: "general", label: "通用" },
	{ value: "enabled", label: "已启用" },
];

export function SkillsView(_props: SkillsViewProps) {
	const { skills, refresh, importSkill, deleteSkill, setEnabled } =
		useSkillsStore();
	const updateCount = useUpdateBadge();
	const [tab, setTab] = useState<TabType>("installed");
	const [searchQuery, setSearchQuery] = useState("");
	const [filter, setFilter] = useState<FilterType>("all");
	const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const leftSidebarView = useWorkspaceStoreSelector(
		(state) => state.leftSidebarView,
	);
	const skillDrag = useSkillDragImport({
		enabled: leftSidebarView === "skills",
	});

	const filteredSkills = useMemo(() => {
		return skills.filter((skill) => {
			if (searchQuery) {
				const q = searchQuery.toLowerCase();
				if (
					!skill.name.toLowerCase().includes(q) &&
					!skill.description.toLowerCase().includes(q)
				) {
					return false;
				}
			}
			if (filter === "enabled") return skill.enabled;
			if (filter === "general") return skill.modeClass === "general";
			return true;
		});
	}, [skills, searchQuery, filter]);

	const handleToggleSkill = async (
		skillName: string,
		currentEnabled: boolean,
	) => {
		try {
			await setEnabled(skillName, !currentEnabled);
		} catch (err) {
			setError(`更新失败: ${err}`);
		}
	};

	const handleImport = async () => {
		try {
			const { path } = await pickSystemDirectory("选择技能文件夹");
			if (!path) return;
			setIsLoading(true);
			setError(null);
			await importSkill(path);
		} catch (err) {
			setError(`导入失败: ${err}`);
		} finally {
			setIsLoading(false);
		}
	};

	const handleDelete = async (skillName: string) => {
		const confirmed = await confirmDialog.danger(
			`确定要删除技能 "${skillName}" 吗？`,
			"删除技能",
		);
		if (!confirmed) return;
		try {
			setIsLoading(true);
			setError(null);
			await deleteSkill(skillName);
		} catch (err) {
			setError(`删除失败: ${err}`);
		} finally {
			setIsLoading(false);
		}
	};

	const handleRefresh = async () => {
		setIsLoading(true);
		setError(null);
		try {
			await refresh();
		} catch (err) {
			setError(`刷新失败: ${err}`);
		} finally {
			setIsLoading(false);
		}
	};

	const handleReveal = async (location: string) => {
		try {
			await revealFileSafe(location);
		} catch (err) {
			setError(`打开目录失败: ${err}`);
		}
	};

	const handleOpenSkillsRoot = async () => {
		// 取任一 skill 的 location 父目录；若无 skill 已安装，无操作
		const first = skills[0]?.location;
		if (!first) {
			setError("尚未安装任何技能。安装一个后即可打开技能目录。");
			return;
		}
		// location 形如 /Users/xxx/.claude/skills/<name>，去掉最后一段
		const parent = first.replace(/\/[^/]+\/?$/, "");
		try {
			await revealFileSafe(parent);
		} catch (err) {
			setError(`打开目录失败: ${err}`);
		}
	};

	const enabledCount = skills.filter((s) => s.enabled).length;

	return (
		<div className="flex flex-col h-full bg-transparent relative">
			{/* 拖拽导入 overlay */}
			{skillDrag.isDragging && (
				<div className="absolute inset-0 z-40 pointer-events-none">
					<div className="absolute inset-0 bg-surface/60 dark:bg-black/40 backdrop-blur-md" />
					<div className="absolute inset-0 flex items-center justify-center p-6">
						<div className="w-full max-w-sm rounded-3xl bg-surface/85 shadow-float px-5 py-4">
							<div className="flex items-center gap-4">
								<div className="w-11 h-11 rounded-2xl bg-warm-200 flex items-center justify-center">
									<ArrowDownToLine className="w-5 h-5 text-text-secondary" />
								</div>
								<div className="flex-1">
									<p className="text-sm font-semibold text-text-primary">
										松开以导入技能
									</p>
									<p className="text-xs text-text-muted mt-0.5">
										将技能文件夹拖入即可安装
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
			{/* Header — 统一走 SidebarViewHeader（h-header + border-b + px-3） */}
			<SidebarViewHeader
				title="技能库"
				meta={
					enabledCount > 0
						? `${enabledCount} / ${skills.length} 已启用`
						: `共 ${skills.length} 个技能`
				}
				actions={
					<>
						<IconButton
							onClick={handleRefresh}
							disabled={isLoading}
							title="刷新"
						>
							<RefreshCw
								className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
							/>
						</IconButton>
						{tab === "installed" && (
							<>
								<IconButton
									onClick={handleOpenSkillsRoot}
									disabled={isLoading || skills.length === 0}
									title="打开 ~/.claude/skills/ 目录"
								>
									<FolderOpen className="w-3.5 h-3.5" />
								</IconButton>
								<IconButton
									onClick={handleImport}
									disabled={isLoading}
									title="导入本地技能文件夹"
								>
									<Plus className="w-3.5 h-3.5" />
								</IconButton>
							</>
						)}
					</>
				}
			/>

			{/* Tabs — underline editorial */}
			<div className="px-3 shrink-0 border-b border-border/70">
				<div className="flex items-center gap-5">
					<UnderlineTab
						active={tab === "installed"}
						onClick={() => setTab("installed")}
						label="已安装"
						count={skills.length}
					/>
					<UnderlineTab
						active={tab === "marketplace"}
						onClick={() => setTab("marketplace")}
						icon={<Store className="w-3 h-3" />}
						label="市场"
						badge={updateCount}
					/>
				</div>
			</div>

			{/* Error */}
			{error && (
				<div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-error/8 dark:bg-error/15 border border-error/20 text-xs text-error flex items-center justify-between gap-2 animate-fade-in">
					<span className="truncate">{error}</span>
					<button
						type="button"
						onClick={() => setError(null)}
						className="shrink-0 -mr-1 p-1 rounded hover:bg-error/10"
						title="关闭"
					>
						<X className="w-3 h-3" />
					</button>
				</div>
			)}

			{/* 安装中浮层 */}
			<InstallProgress />

			{tab === "marketplace" ? (
				<MarketplaceList />
			) : (
				<>
					{/* Search & Filter — 搜索框对齐 ThreadsView 规格：透明底，hover/focus 浮现浅底 */}
					<div className="px-3 pt-3 pb-3 shrink-0 space-y-2.5">
						<div className="relative">
							<Search
								className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-light"
								strokeWidth={1.5}
							/>
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="搜索技能…"
								className="h-8 w-full rounded-lg bg-transparent pl-8 pr-7 text-sm text-text-primary transition-colors duration-150 placeholder:text-text-light hover:bg-warm-200/45 focus:bg-warm-200/70 focus:outline-none dark:hover:bg-white/[0.04] dark:focus:bg-white/[0.07]"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-lg text-text-light transition-colors hover:bg-warm-200/70 hover:text-text-secondary"
								>
									<X className="w-3 h-3" strokeWidth={1.5} />
								</button>
							)}
						</div>
						<div className="flex items-center gap-1 -mx-1 px-1 overflow-x-auto scrollbar-hide">
							{FILTERS.map((f) => (
								<button
									key={f.value}
									type="button"
									onClick={() => setFilter(f.value)}
									className={cn(
										"px-2.5 py-1 text-xs rounded-lg transition-colors font-medium shrink-0",
										filter === f.value
											? "bg-primary text-primary-foreground"
											: "text-text-muted hover:text-text-secondary hover:bg-warm-200/70",
									)}
								>
									{f.label}
								</button>
							))}
						</div>
					</div>

					{/* Skills List — editorial directory */}
					<div className="flex-1 overflow-y-auto px-2 pb-6">
						<ul className="space-y-px">
							{filteredSkills.map((skill) => {
								const isExpanded = expandedSkillId === skill.name;
								return (
									<li key={skill.name}>
										<div
											className={cn(
												"group rounded-lg transition-[color,background-color,border-color,opacity,box-shadow,transform]",
												isExpanded
													? "bg-surface ring-1 ring-border/70 shadow-bai-card"
													: "hover:bg-warm-200/60",
											)}
										>
											<div
												role="button"
												tabIndex={0}
												className="w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer"
												onClick={() =>
													setExpandedSkillId(isExpanded ? null : skill.name)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														setExpandedSkillId(isExpanded ? null : skill.name);
													}
												}}
											>
												{/* Status dot — minimal indicator, ≤1px ring instead of side stripe */}
												<span
													className={cn(
														"w-1.5 h-1.5 rounded-full shrink-0 transition-colors",
														skill.enabled ? "bg-primary" : "bg-border",
													)}
												/>
												<div className="flex-1 min-w-0">
													<div className="flex items-baseline gap-1.5 min-w-0">
														<span
															className={cn(
																"text-sm font-medium truncate",
																skill.enabled
																	? "text-text-primary"
																	: "text-text-muted",
															)}
														>
															{skill.name}
														</span>
														{skill.modeClass === "design" && (
															<span
																className="shrink-0 px-1.5 py-px text-2xs uppercase tracking-[0.12em] rounded-lg bg-primary/10 text-primary/80 leading-tight"
																title={
																	skill.modeTag
																		? `od.mode: ${skill.modeTag}`
																		: "按关键字归为设计 / 媒体类"
																}
															>
																{skill.modeTag || "design"}
															</span>
														)}
													</div>
													<p
														className={cn(
															"text-xs truncate mt-0.5 leading-snug",
															skill.enabled
																? "text-text-muted"
																: "text-text-muted/70",
														)}
													>
														{skill.description || "（暂无描述）"}
													</p>
												</div>
												<div className="flex items-center gap-1 shrink-0">
													<ToggleSwitch
														enabled={skill.enabled}
														onClick={(e) => {
															e.stopPropagation();
															handleToggleSkill(skill.name, skill.enabled);
														}}
													/>
													<ChevronDown
														className={cn(
															"w-3 h-3 text-text-light transition-transform",
															isExpanded && "rotate-180",
															!isExpanded && "opacity-0 group-hover:opacity-60",
														)}
													/>
												</div>
											</div>

											{/* Expanded details */}
											{isExpanded && (
												<div className="px-3 pb-3 pt-0 ml-3.5 space-y-2.5 animate-fade-in">
													<p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
														{skill.description || "（暂无描述）"}
													</p>
													<div className="flex items-center justify-between gap-2 pt-1 border-t border-border/70">
														<code
															className="text-2xs text-text-light font-mono truncate pt-2"
															title={skill.location}
														>
															{skill.location}
														</code>
														<div className="flex items-center gap-1 mt-1 shrink-0">
															<button
																type="button"
																onClick={() => handleReveal(skill.location)}
																className="flex items-center gap-1 text-2xs text-text-muted hover:text-text-secondary transition-colors px-2 py-1 rounded-md hover:bg-warm-200/70"
																title="在系统文件管理器中打开"
															>
																<FolderOpen className="w-3 h-3" />
																打开
															</button>
															<button
																type="button"
																onClick={() => handleDelete(skill.name)}
																className="flex items-center gap-1 text-2xs text-text-muted hover:text-error transition-colors px-2 py-1 rounded-md hover:bg-error/8"
															>
																<Trash2 className="w-3 h-3" />
																删除
															</button>
														</div>
													</div>
												</div>
											)}
										</div>
									</li>
								);
							})}
						</ul>

						{/* Empty state */}
						{filteredSkills.length === 0 && (
							<EmptyState
								searchQuery={searchQuery}
								onBrowse={() => setTab("marketplace")}
								onImport={handleImport}
							/>
						)}
					</div>
				</>
			)}
		</div>
	);
}

function IconButton({
	children,
	onClick,
	disabled,
	title,
}: {
	children: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
	title?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			className="p-1.5 rounded-lg text-text-light hover:text-text-secondary hover:bg-warm-200/70 transition disabled:opacity-40 disabled:cursor-not-allowed"
		>
			{children}
		</button>
	);
}

function UnderlineTab({
	active,
	onClick,
	label,
	icon,
	count,
	badge,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	icon?: React.ReactNode;
	count?: number;
	badge?: number;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"relative flex items-center gap-1.5 py-2.5 text-xs font-medium transition-colors -mb-px",
				active
					? "text-text-primary"
					: "text-text-muted hover:text-text-secondary",
			)}
		>
			{icon}
			<span>{label}</span>
			{typeof count === "number" && (
				<span className="text-2xs tabular-nums text-text-light/80">
					{count}
				</span>
			)}
			{badge && badge > 0 ? (
				<span className="ml-0.5 inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-warm-300 text-2xs font-semibold text-text-primary tabular-nums">
					{badge > 99 ? "99+" : badge}
				</span>
			) : null}
			{active && (
				<span className="absolute left-0 right-0 -bottom-px h-0.5 bg-text-primary rounded-full" />
			)}
		</button>
	);
}

function ToggleSwitch({
	enabled,
	onClick,
}: {
	enabled: boolean;
	onClick: (e: React.MouseEvent) => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			role="switch"
			aria-checked={enabled}
			title={
				enabled
					? "已启用：在 UI 显示。注意 SDK 仍会扫描 ~/.claude/skills，要彻底屏蔽请删除"
					: "已禁用：UI 隐藏 + 启动时不同步到 project。要彻底屏蔽请删除"
			}
			className={cn(
				"relative w-7 h-4 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:shadow-[0_0_0_3px_var(--t-primary-muted)]",
				enabled ? "bg-primary" : "bg-warm-300",
			)}
		>
			<span
				className={cn(
					"absolute top-0.5 w-3 h-3 rounded-full bg-primary-foreground shadow-sm transition-transform",
					enabled ? "translate-x-3.5" : "translate-x-0.5",
				)}
			/>
		</button>
	);
}

function EmptyState({
	searchQuery,
	onBrowse,
	onImport,
}: {
	searchQuery: string;
	onBrowse: () => void;
	onImport: () => void;
}) {
	return (
		<IllustratedEmptyState
			illustration={searchQuery ? "search" : "folder"}
			title={searchQuery ? "没有匹配的技能" : "尚未安装任何技能"}
			description={
				searchQuery
					? "试试别的关键词或切换过滤器"
					: "去市场一键安装，或导入本地技能文件夹"
			}
			action={
				!searchQuery ? (
					<div className="flex items-center gap-2 justify-center">
						<button
							type="button"
							onClick={onBrowse}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-hover transition"
						>
							<Store className="w-3 h-3" />
							浏览市场
						</button>
						<button
							type="button"
							onClick={onImport}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warm-200/80 text-text-secondary text-xs font-medium hover:bg-warm-300 transition"
						>
							<FolderOpen className="w-3 h-3" />
							导入本地
						</button>
					</div>
				) : undefined
			}
		/>
	);
}
