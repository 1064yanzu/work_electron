// Skills 管理视图 - 在左侧边栏中间栏展示

import { useState, useMemo } from "react";
import {
	Search,
	X,
	Zap,
	FolderOpen,
	Package,
	RefreshCw,
	Trash2,
	ChevronDown,
	ChevronUp,
	ToggleLeft,
	ToggleRight,
} from "lucide-react";
import { useSkillsStore } from "../../lib/skillsStore";
import { openDirectory } from "../../lib/dialogCompat";
import { confirmDialog } from "../ui/ConfirmDialog";
import { cn } from "../../lib/utils";
import { Select } from "../ui/Select";

type FilterType = "all" | "system" | "custom" | "enabled";

interface SkillsViewProps {
	onNavigateWorkbench?: () => void;
}

export function SkillsView(_props: SkillsViewProps) {
	const { skills, refresh, importSkill, deleteSkill, setEnabled } =
		useSkillsStore();
	const [searchQuery, setSearchQuery] = useState("");
	const [filter, setFilter] = useState<FilterType>("all");
	const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
			if (filter === "system") return skill.location === "system";
			if (filter === "custom") return skill.location !== "system";
			if (filter === "enabled") return skill.enabled;
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
			const selected = await openDirectory({ title: "选择技能文件夹" });
			if (!selected) return;
			setIsLoading(true);
			setError(null);
			await importSkill(selected as string);
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

	const enabledCount = skills.filter((s) => s.enabled).length;

	return (
		<div className="flex flex-col h-full bg-transparent">
			{/* Header */}
			<div className="px-6 py-5 flex items-center justify-between shrink-0 border-b border-border dark:border-white/[0.05]">
				<div className="flex items-center gap-2">
					<Zap className="w-4 h-4 text-amber-500" />
					<h2 className="font-semibold text-[13px] text-text-muted uppercase tracking-widest">
						Skills
					</h2>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-[11px] text-text-light">
						{enabledCount}/{skills.length} 已启用
					</span>
					<button
						onClick={handleRefresh}
						disabled={isLoading}
						className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-black/5 dark:hover:bg-surface/10 rounded-lg transition-colors disabled:opacity-50"
						title="刷新"
					>
						<RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
					</button>
					<button
						onClick={handleImport}
						disabled={isLoading}
						className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-black/5 dark:hover:bg-surface/10 rounded-lg transition-colors disabled:opacity-50"
						title="导入技能"
					>
						<FolderOpen className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Error */}
			{error && (
				<div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
					<span className="truncate">{error}</span>
					<button
						onClick={() => setError(null)}
						className="ml-2 shrink-0 text-red-400 hover:text-red-600"
					>
						<X className="w-3 h-3" />
					</button>
				</div>
			)}

			{/* Search & Filter */}
			<div className="px-4 py-3 flex gap-2 shrink-0">
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="搜索技能..."
						className="w-full pl-9 pr-8 py-2 text-xs bg-warm-200/80/50 border-none rounded-lg text-text-secondary placeholder:text-text-light focus:outline-none focus:ring-1 focus:ring-primary/30"
					/>
					{searchQuery && (
						<button
							onClick={() => setSearchQuery("")}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-light hover:text-text-secondary"
						>
							<X className="w-3 h-3" />
						</button>
					)}
				</div>
				<Select
					value={filter}
					onChange={(e) => setFilter(e.target.value as FilterType)}
					variant="compact"
					options={[
						{ value: "all", label: "全部" },
						{ value: "system", label: "系统" },
						{ value: "custom", label: "自定义" },
						{ value: "enabled", label: "已启用" },
					]}
					containerClassName="w-28"
				/>
			</div>

			{/* Skills List */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-6">
				<div className="space-y-2">
					{filteredSkills.map((skill) => {
						const isExpanded = expandedSkillId === skill.name;
						const isSystem = skill.location === "system";
						return (
							<div
								key={skill.name}
								className={cn(
									"group rounded-xl border transition-all duration-200",
									"border-border/60 bg-surface/50/30",
									"hover:border-border/60 hover:shadow-sm",
									isExpanded &&
										"border-primary/20 dark:border-primary/20 shadow-sm",
								)}
							>
								{/* Main row */}
								<div
									className="flex items-center gap-3 px-4 py-3 cursor-pointer"
									onClick={() =>
										setExpandedSkillId(isExpanded ? null : skill.name)
									}
								>
									<div
										className={cn(
											"w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
											isSystem
												? "bg-blue-50 dark:bg-blue-500/10 text-blue-500"
												: "bg-amber-50 dark:bg-amber-500/10 text-amber-500",
										)}
									>
										{isSystem ? (
											<Package className="w-4 h-4" />
										) : (
											<Zap className="w-4 h-4" />
										)}
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="text-[13px] font-medium text-text-primary dark:text-zinc-200 truncate">
												{skill.name}
											</span>
											<span
												className={cn(
													"text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
													isSystem
														? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
														: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
												)}
											>
												{isSystem ? "系统" : "自定义"}
											</span>
										</div>
										<p className="text-[11px] text-text-muted truncate mt-0.5">
											{skill.description}
										</p>
									</div>
									<div className="flex items-center gap-1.5 shrink-0">
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleToggleSkill(skill.name, skill.enabled);
											}}
											className={cn(
												"transition-colors",
												skill.enabled ? "text-emerald-500" : "text-text-light",
											)}
											title={skill.enabled ? "点击禁用" : "点击启用"}
										>
											{skill.enabled ? (
												<ToggleRight className="w-6 h-6" />
											) : (
												<ToggleLeft className="w-6 h-6" />
											)}
										</button>
										{isExpanded ? (
											<ChevronUp className="w-3.5 h-3.5 text-text-light" />
										) : (
											<ChevronDown className="w-3.5 h-3.5 text-text-light opacity-0 group-hover:opacity-100 transition-opacity" />
										)}
									</div>
								</div>

								{/* Expanded details */}
								{isExpanded && (
									<div className="px-4 pb-3 pt-0 border-t border-border/60">
										<p className="text-xs text-text-secondary leading-relaxed mt-3 whitespace-pre-wrap">
											{skill.description}
										</p>
										<div className="flex items-center gap-3 mt-3">
											<span className="text-[10px] text-text-light font-mono truncate">
												{skill.location}
											</span>
											{!isSystem && (
												<button
													onClick={() => handleDelete(skill.name)}
													className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-600 transition-colors"
												>
													<Trash2 className="w-3 h-3" />
													删除
												</button>
											)}
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>

				{/* Empty state */}
				{filteredSkills.length === 0 && (
					<div className="text-center py-10 mt-10">
						<Zap className="w-8 h-8 text-text-light mx-auto mb-3" />
						<p className="text-sm text-text-muted font-medium">
							{searchQuery ? "未找到匹配的技能" : "暂无技能"}
						</p>
						{!searchQuery && (
							<p className="text-xs text-text-light mt-1.5">
								点击右上角按钮导入技能文件夹
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
