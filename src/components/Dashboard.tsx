import {
	ChevronRight,
	Clock,
	FileText,
	Folder,
	FolderOpen,
	LayoutGrid,
	List as ListIcon,
	MessageSquare,
	Plus,
	Search,
	Settings,
	Sparkles,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	createProject,
	deleteProject,
	getRecentProjects,
	listProjects,
	revealProjectDirectory,
	updateProject,
} from "../lib/api";
import { buildProjectContextMenu } from "../lib/contextMenu/actions";
import { humanizeError } from "../lib/errors";
import { prefetchProjectData } from "../lib/query";
import { commandPaletteStore } from "../lib/stores/commandPaletteStore";
import { invoke } from "../lib/tauriCompat";
import type { Project } from "../types";
import { Mascot } from "./Mascot/Mascot";
import { Button } from "./ui/Button";
import { confirmDialog } from "./ui/ConfirmDialog";
import { ContextMenu } from "./ui/ContextMenu";
import { inputDialog } from "./ui/InputDialog";
import { toast } from "./ui/Toast";

interface DashboardProps {
	onOpenSettings: () => void;
	onOpenProject?: (projectId: string) => void;
}

export default function Dashboard({
	onOpenSettings,
	onOpenProject,
}: DashboardProps) {
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [activeTab, setActiveTab] = useState("overview");
	const [recentProjects, setRecentProjects] = useState<Project[]>([]);
	const [allProjects, setAllProjects] = useState<Project[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [greeting, setGreeting] = useState("");

	// Interactive States
	const [showSearch, setShowSearch] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchSelectedIndex, setSearchSelectedIndex] = useState(-1);
	const [showNewProject, setShowNewProject] = useState(false);
	const [newProjectName, setNewProjectName] = useState("");
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		project: Project;
	} | null>(null);
	const [username, setUsername] = useState<string>("");

	const loadProjects = useCallback(async () => {
		try {
			let recent: Project[] = [];
			let all: Project[] = [];

			try {
				recent = await getRecentProjects(10);
			} catch (e) {
				console.warn("[Dashboard] 获取最近项目失败，可能是表不存在:", e);
			}

			try {
				all = await listProjects();
			} catch (e) {
				console.warn("[Dashboard] 获取全部项目失败，可能是表不存在:", e);
			}

			setRecentProjects(recent);
			setAllProjects(all);
		} catch (e) {
			console.error("[Dashboard] 获取项目失败:", e);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		const hour = new Date().getHours();
		if (hour < 12) setGreeting("早上好");
		else if (hour < 18) setGreeting("下午好");
		else setGreeting("晚上好");

		void loadProjects();

		// 异步获取真实 OS 用户名 — 拿不到就保持空字符串（仅显示问候语）
		void (async () => {
			try {
				const info = await invoke<{ username: string }>("system_get_user_info");
				if (info?.username) setUsername(info.username);
			} catch {
				// silent — 失败时不渲染逗号 + 名字
			}
		})();
	}, [loadProjects]);

	const handleCreateProject = async () => {
		const trimmed = newProjectName.trim();
		if (!trimmed) return;
		try {
			const project = await createProject({ name: trimmed });
			setAllProjects((prev) => [project, ...prev]);
			setRecentProjects((prev) => [project, ...prev]);
			setNewProjectName("");
			setShowNewProject(false);
			// 打开新项目
			onOpenProject?.(project.id);
		} catch (e) {
			console.error("创建项目失败:", e);
			toast.errorWithRetry(humanizeError(e, "创建项目失败"), () =>
				handleCreateProject(),
			);
		}
	};

	const handleOpenProject = useCallback(
		(projectId: string) => {
			onOpenProject?.(projectId);
		},
		[onOpenProject],
	);

	const handleProjectContextMenu = useCallback(
		(e: React.MouseEvent, project: Project) => {
			e.preventDefault();
			e.stopPropagation();
			setContextMenu({
				x: e.clientX,
				y: e.clientY,
				project,
			});
		},
		[],
	);

	const handleRenameProject = useCallback(
		async (project: Project) => {
			const nextName = await inputDialog.show({
				title: "重命名项目",
				message: "请输入新的项目名称",
				defaultValue: project.name,
				confirmText: "保存",
				cancelText: "取消",
				validate: (value) => {
					const trimmed = value.trim();
					if (!trimmed) return "项目名称不能为空";
					return null;
				},
			});
			if (!nextName?.trim() || nextName.trim() === project.name) return;
			try {
				await updateProject({ id: project.id, name: nextName.trim() });
				await loadProjects();
				toast.success("重命名成功");
			} catch (error) {
				console.error("重命名项目失败:", error);
				toast.errorWithRetry(humanizeError(error, "重命名失败"), () =>
					handleRenameProject(project),
				);
			}
		},
		[loadProjects],
	);

	const handleToggleArchiveProject = useCallback(
		async (project: Project) => {
			try {
				await updateProject({
					id: project.id,
					is_archived: !project.is_archived,
				});
				await loadProjects();
				toast.success(project.is_archived ? "已取消归档" : "已归档");
			} catch (error) {
				console.error("更新项目归档状态失败:", error);
				toast.errorWithRetry(humanizeError(error, "更新失败"), () =>
					handleToggleArchiveProject(project),
				);
			}
		},
		[loadProjects],
	);

	const handleDeleteProject = useCallback(
		async (project: Project) => {
			const confirmed = await confirmDialog.danger(
				`确定要删除项目「${project.name}」吗？此操作不可撤销。`,
				"删除项目",
			);
			if (!confirmed) return;
			try {
				await deleteProject(project.id);
				await loadProjects();
				toast.success("项目已删除");
			} catch (error) {
				console.error("删除项目失败:", error);
				toast.errorWithRetry(humanizeError(error, "删除失败"), () =>
					handleDeleteProject(project),
				);
			}
		},
		[loadProjects],
	);

	const projectContextMenuItems = contextMenu
		? buildProjectContextMenu({
				onOpen: () => handleOpenProject(contextMenu.project.id),
				onRename: () => void handleRenameProject(contextMenu.project),
				onToggleArchive: () =>
					void handleToggleArchiveProject(contextMenu.project),
				onDelete: () => void handleDeleteProject(contextMenu.project),
				onReveal: async () => {
					try {
						const result = await revealProjectDirectory(contextMenu.project.id);
						if (!result.success) {
							toast.error(result.error || "打开目录失败");
						} else {
							toast.success("已在文件管理器中打开项目目录");
						}
					} catch (error) {
						toast.error(humanizeError(error, "打开目录失败"));
					}
				},
				isArchived: contextMenu.project.is_archived,
			})
		: [];

	// overview（工作台）显示所有项目，recent（最近访问）显示有访问记录的项目
	const displayProjects =
		activeTab === "overview"
			? allProjects.filter((p) => !p.is_archived) // 工作台显示所有未归档项目
			: activeTab === "recent"
				? recentProjects // 最近访问显示有访问记录的项目
				: allProjects.filter((p) => p.is_archived); // 归档页显示已归档项目

	const filteredProjects = displayProjects.filter(
		(p) =>
			p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			p.description?.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	return (
		<div
			className="min-h-screen w-screen text-text-primary font-sans selection:bg-primary/20 flex overflow-hidden relative transition-colors duration-300"
			style={{ backgroundColor: "var(--t-bg)" }}
		>
			{/* Left Sidebar - More minimal */}
			<aside className="w-20 lg:w-60 shrink-0 flex flex-col py-8 px-3 lg:px-5 border-r border-border z-20 bg-surface">
				<div className="flex items-center gap-2.5 mb-10 px-2">
					<div className="w-7 h-7 rounded-full bai-avatar-glow shrink-0" />
					<span className="font-semibold text-[1.05rem] tracking-[-0.01em] hidden lg:block text-text-primary">
						Workbench
					</span>
				</div>

				<nav className="space-y-1 flex-1">
					<NavItem
						icon={LayoutGrid}
						label="工作台"
						active={activeTab === "overview"}
						onClick={() => setActiveTab("overview")}
					/>
					<NavItem
						icon={Clock}
						label="最近访问"
						active={activeTab === "recent"}
						onClick={() => setActiveTab("recent")}
					/>
					<NavItem
						icon={FolderOpen}
						label="归档文件"
						active={activeTab === "archived"}
						onClick={() => setActiveTab("archived")}
					/>
				</nav>

				{/* Sidebar Footer */}
				<div className="mt-auto pt-4 border-t border-border">
					<button
						onClick={onOpenSettings}
						aria-label="设置"
						className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-text-muted hover:bg-warm-200 hover:text-text-primary transition-all group text-sm cursor-pointer"
					>
						<Settings className="w-4 h-4" />
						<span className="font-medium hidden lg:block">设置</span>
					</button>
				</div>
			</aside>

			{/* Main Content - Claude Style */}
			<main className="flex-1 h-screen overflow-y-auto scrollbar-hide relative">
				{/* ... Search Modal (Keep functionality, refine style) ... */}
				{showSearch && (
					<div
						className="fixed inset-0 z-50 backdrop-blur-md flex items-start justify-center pt-[20vh]"
						style={{
							backgroundColor:
								"color-mix(in srgb, var(--t-bg) 85%, transparent)",
						}}
						onClick={() => setShowSearch(false)}
					>
						<div
							className="w-full max-w-2xl bg-surface rounded-2xl shadow-bai-pop border border-border p-0 animate-in fade-in zoom-in-95 duration-200"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="flex items-center gap-3 px-4 py-4 border-b border-border">
								<Search className="w-5 h-5 text-text-light" strokeWidth={1.5} />
								<input
									autoFocus
									type="text"
									className="flex-1 bg-transparent border-none outline-none text-base placeholder:text-text-light text-text-primary"
									placeholder="搜索文档..."
									value={searchQuery}
									onChange={(e) => {
										setSearchQuery(e.target.value);
										setSearchSelectedIndex(-1);
									}}
									onKeyDown={(e) => {
										if (e.key === "ArrowDown") {
											e.preventDefault();
											setSearchSelectedIndex((prev) =>
												Math.min(prev + 1, filteredProjects.length - 1),
											);
										} else if (e.key === "ArrowUp") {
											e.preventDefault();
											setSearchSelectedIndex((prev) => Math.max(prev - 1, -1));
										} else if (e.key === "Enter" && searchSelectedIndex >= 0) {
											e.preventDefault();
											const selected = filteredProjects[searchSelectedIndex];
											if (selected) {
												onOpenProject?.(selected.id);
												setShowSearch(false);
											}
										} else if (e.key === "Escape") {
											setShowSearch(false);
										}
									}}
								/>
								<button
									onClick={() => setShowSearch(false)}
									aria-label="关闭搜索"
									className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center hover:bg-warm-200 rounded-full text-text-light cursor-pointer transition-colors"
								>
									<X className="w-4 h-4" strokeWidth={1.5} />
								</button>
							</div>
							<div className="p-2 max-h-[400px] overflow-y-auto">
								{searchQuery ? (
									<div className="space-y-1">
										{filteredProjects.map((project) => (
											<button
												key={project.id}
												onClick={() => {
													onOpenProject?.(project.id);
													setShowSearch(false);
												}}
												onMouseEnter={() => prefetchProjectData(project.id)}
												className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 group transition-colors cursor-pointer ${
													filteredProjects.indexOf(project) ===
													searchSelectedIndex
														? "bg-warm-200"
														: "hover:bg-warm-200/70"
												}`}
											>
												<Folder
													className="w-4 h-4 text-text-light group-hover:text-text-primary"
													strokeWidth={1.5}
													style={{ color: project.color }}
												/>
												<div>
													<div className="font-medium text-sm text-text-primary">
														{project.name}
													</div>
													<div className="text-xs text-text-light line-clamp-1">
														{project.description || "暂无描述"}
													</div>
												</div>
											</button>
										))}
									</div>
								) : (
									<div className="px-4 py-12 text-center text-text-light text-sm">
										输入关键词搜索...
									</div>
								)}
							</div>
						</div>
					</div>
				)}

				<div className="max-w-4xl mx-auto p-10 lg:p-14">
					<>
						{/* Header — B.AI Inter，克制现代 */}
						<header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
							<div className="flex items-end gap-5">
								<Mascot
									slot="state-greet"
									size="lg"
									float
									wrapperClassName="hidden md:inline-flex shrink-0 -mb-1"
								/>
								<div>
									<h1 className="text-[2rem] md:text-[2.25rem] font-semibold leading-[1.18] tracking-[-0.02em] mb-2 text-text-primary">
										{username ? `${greeting}, ${username}` : greeting}
									</h1>
									<p className="text-text-secondary text-[13.5px] leading-relaxed">
										准备好开始创作了吗？
									</p>
								</div>
							</div>

							{/* 视图切换 — 胶囊化分段控件 */}
							<div className="flex items-center gap-0.5 p-1 bg-warm-200 rounded-full">
								<button
									onClick={() => setViewMode("grid")}
									aria-label="网格视图"
									className={`px-2.5 h-8 min-w-[36px] flex items-center justify-center rounded-full cursor-pointer transition-all duration-150 ${viewMode === "grid" ? "text-text-primary bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-text-muted hover:text-text-primary"}`}
								>
									<LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.5} />
								</button>
								<button
									onClick={() => setViewMode("list")}
									aria-label="列表视图"
									className={`px-2.5 h-8 min-w-[36px] flex items-center justify-center rounded-full cursor-pointer transition-all duration-150 ${viewMode === "list" ? "text-text-primary bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-text-muted hover:text-text-primary"}`}
								>
									<ListIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
								</button>
								<div className="w-px h-4 bg-warm-300 mx-0.5" />
								<button
									aria-label="搜索项目"
									className="px-2.5 h-8 min-w-[36px] flex items-center justify-center rounded-full text-text-muted hover:text-text-primary cursor-pointer transition-all duration-150 active:scale-95"
									onClick={() => setShowSearch(true)}
								>
									<Search className="w-3.5 h-3.5" strokeWidth={1.5} />
								</button>
								<button
									aria-label="打开命令面板（⌘K）"
									title="命令面板（⌘K）"
									className="ml-1 px-2.5 h-8 flex items-center gap-1.5 rounded-full text-text-muted hover:text-text-primary cursor-pointer transition-all duration-150 active:scale-95"
									onClick={() => commandPaletteStore.open()}
								>
									<kbd className="text-[10px] font-medium px-1.5 py-0.5 bg-warm-300 rounded">
										⌘K
									</kbd>
								</button>
							</div>
						</header>

						{/* New Project Entry — B.AI 卡片，点击 inline 展开输入区，避免 Modal */}
						{activeTab === "overview" && (
							<div
								className={`group relative w-full bg-surface rounded-2xl border ${showNewProject ? "border-warm-400" : "border-border"} mb-14 overflow-hidden transition-all duration-200 shadow-[0_1px_2px_0_rgb(26_26_25/0.04)] hover:shadow-[0_4px_12px_0_rgb(26_26_25/0.06)]`}
							>
								{!showNewProject ? (
									<button
										type="button"
										onClick={() => setShowNewProject(true)}
										className="w-full text-left cursor-pointer active:scale-[0.995] transition-transform duration-150"
									>
										<div className="px-8 py-9 flex items-center justify-between">
											<div>
												<h2 className="text-[1.25rem] font-semibold leading-[1.25] tracking-[-0.015em] text-text-primary mb-1.5 group-hover:translate-x-0.5 transition-transform duration-200">
													开始新项目
												</h2>
												<p className="text-text-secondary text-[13px] leading-relaxed">
													创建空白文档或选择模板
												</p>
											</div>
											<div className="w-10 h-10 rounded-full bg-cream-900 dark:bg-cream-100 flex items-center justify-center text-cream-100 dark:text-cream-900 group-hover:scale-105 transition-all duration-200">
												<Plus className="w-4 h-4" strokeWidth={1.5} />
											</div>
										</div>
									</button>
								) : (
									<div className="px-8 py-7 animate-in fade-in slide-in-from-top-1 duration-200">
										<h2 className="text-[1.05rem] font-semibold leading-[1.25] tracking-[-0.012em] text-text-primary mb-3">
											新建项目
										</h2>
										<input
											// biome-ignore lint/a11y/noAutofocus: 用户主动展开输入区,自动聚焦符合预期
											autoFocus
											type="text"
											placeholder="项目名称"
											value={newProjectName}
											onChange={(e) => setNewProjectName(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") handleCreateProject();
												if (e.key === "Escape") {
													setShowNewProject(false);
													setNewProjectName("");
												}
											}}
											className="w-full px-4 py-3 rounded-full border border-border bg-surface text-text-primary mb-4 focus:outline-none focus:border-warm-500 focus:shadow-[0_0_0_3px_var(--t-primary-muted)]"
										/>
										<div className="flex justify-end gap-2">
											<Button
												variant="secondary"
												onClick={() => {
													setShowNewProject(false);
													setNewProjectName("");
												}}
											>
												取消
											</Button>
											<Button
												variant="primary"
												onClick={handleCreateProject}
												disabled={!newProjectName.trim()}
											>
												创建
											</Button>
										</div>
									</div>
								)}
							</div>
						)}

						{/* Projects Grid - Clean Cards */}
						<div>
							<div className="flex items-center justify-between mb-6 pb-3.5 border-b border-border">
								<h3 className="text-[10.5px] font-semibold text-text-muted uppercase tracking-[0.16em]">
									{activeTab === "overview"
										? "最近的项目"
										: activeTab === "recent"
											? "今天"
											: "已归档"}
								</h3>
								<button
									onClick={() => setShowNewProject(true)}
									className="text-[11px] font-medium text-text-secondary hover:text-text-primary flex items-center gap-1 transition-colors"
								>
									<Plus className="w-3 h-3" strokeWidth={1.5} />
									新建项目
								</button>
							</div>

							{isLoading ? (
								<div
									className={`grid gap-6 ${viewMode === "grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}
								>
									{Array.from({ length: 6 }).map((_, i) => (
										<div
											key={i}
											className="rounded-2xl border border-border p-6 space-y-4 h-48 animate-in fade-in"
											style={{ animationDelay: `${i * 50}ms` }}
										>
											<div className="flex items-start justify-between">
												<div className="w-10 h-10 rounded-full skeleton" />
											</div>
											<div className="space-y-2">
												<div className="h-5 w-3/4 skeleton rounded-full" />
												<div className="h-4 w-full skeleton rounded-full" />
												<div className="h-4 w-2/3 skeleton rounded-full" />
											</div>
											<div className="flex items-center justify-between pt-2">
												<div className="h-3 w-20 skeleton rounded-full" />
												<div className="h-1.5 w-1.5 rounded-full skeleton" />
											</div>
										</div>
									))}
								</div>
							) : (
								<div
									className={`grid gap-6 ${viewMode === "grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}
								>
									{filteredProjects.map((project, idx) => (
										<div
											key={project.id}
											onClick={() => handleOpenProject(project.id)}
											onMouseEnter={() => prefetchProjectData(project.id)}
											onContextMenu={(e) =>
												handleProjectContextMenu(e, project)
											}
											className={`
                        group bg-surface border border-border
                        rounded-2xl p-6 cursor-pointer
                        transition-all duration-200 ease-out
                        shadow-[0_1px_2px_0_rgb(26_26_25/0.04)]
                        hover:border-warm-400
                        hover:shadow-[0_4px_12px_0_rgb(26_26_25/0.06)]
                        hover:-translate-y-[1px]
                        active:scale-[0.99] active:translate-y-0
                        animate-in fade-in slide-in-from-bottom-4
                        flex flex-col h-48 justify-between
                      `}
											style={{
												animationDelay: `${50 + idx * 30}ms`,
												animationFillMode: "forwards",
											}}
										>
											<div>
												<div className="flex items-start justify-between mb-6">
													<div
														className="relative flex items-center justify-center w-10 h-10 rounded-xl border border-border transition-transform group-hover:scale-105 duration-300 ease-out"
														style={{
															backgroundColor: `${project.color}10`,
														}}
													>
														<Folder
															className="w-5 h-5 transition-colors duration-300"
															strokeWidth={1.5}
															style={{ color: project.color }}
														/>
													</div>
													<div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-x-1 group-hover:translate-x-0">
														<span className="text-[10px] font-medium text-text-muted tracking-wider uppercase">
															OPEN
														</span>
														<ChevronRight
															className="w-3 h-3 text-text-muted"
															strokeWidth={1.5}
														/>
													</div>
												</div>
												<h4 className="text-[1rem] font-semibold leading-[1.3] tracking-[-0.01em] text-text-primary mb-2 line-clamp-1 transition-colors duration-200">
													{project.name}
												</h4>
												<p className="text-[12.5px] text-text-secondary leading-[1.55] line-clamp-2">
													{project.description || "暂无描述"}
												</p>
											</div>

											<div className="flex items-center justify-between pt-3.5 mt-2 border-t border-border">
												<div className="text-[11px] font-medium text-text-muted tabular">
													{new Date(project.updated_at).toLocaleDateString(
														"zh-CN",
														{
															month: "short",
															day: "numeric",
														},
													)}
												</div>
												<div className="h-1.5 w-1.5 rounded-full bg-warm-400 group-hover:bg-text-secondary transition-colors duration-300" />
											</div>
										</div>
									))}

									{filteredProjects.length === 0 && (
										<div className="col-span-full py-12">
											{searchQuery ? (
												<div className="text-center">
													<p className="text-text-muted text-sm font-medium">
														没有找到匹配「{searchQuery}」的项目
													</p>
													<button
														type="button"
														onClick={() => setSearchQuery("")}
														className="mt-3 text-xs text-text-secondary hover:text-text-primary underline-offset-4 hover:underline transition-colors"
													>
														清空搜索
													</button>
												</div>
											) : activeTab === "archived" ? (
												<div className="text-center">
													<p className="text-text-muted text-sm font-medium">
														暂无归档项目
													</p>
												</div>
											) : (
												<EmptyOnboarding
													onCreateProject={() => setShowNewProject(true)}
												/>
											)}
										</div>
									)}
								</div>
							)}
						</div>
					</>
				</div>
			</main>
			{contextMenu && projectContextMenuItems.length > 0 ? (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={projectContextMenuItems}
					onClose={() => setContextMenu(null)}
				/>
			) : null}
		</div>
	);
}

function NavItem({
	icon: Icon,
	label,
	active,
	badge,
	onClick,
}: {
	icon: React.ElementType;
	label: string;
	active?: boolean;
	badge?: string;
	onClick?: () => void;
}) {
	return (
		<button
			onClick={onClick}
			aria-label={label}
			className={`
      w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative text-sm cursor-pointer
      ${
				active
					? "bg-warm-200 text-text-primary"
					: "text-text-secondary hover:bg-warm-200 hover:text-text-primary active:scale-[0.99]"
			}
    `}
		>
			<Icon
				className={`w-4 h-4 transition-colors ${active ? "text-text-primary" : "text-text-muted group-hover:text-text-primary"}`}
				strokeWidth={1.5}
			/>
			<span
				className={`font-medium hidden lg:block ${active ? "font-semibold" : ""}`}
			>
				{label}
			</span>
			{badge && (
				<span className="ml-auto bg-warm-300 text-text-secondary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
					{badge}
				</span>
			)}
		</button>
	);
}

/**
 * 首屏空状态 — Jordan persona 30 秒"第一个 wow 时刻"
 * 三个引导卡片：创建项目 / 上传资料 / 与 AI 对话
 * 不强引导，只是展示"产品能为你做什么"，CTA 文案克制
 */
function EmptyOnboarding({
	onCreateProject,
}: {
	onCreateProject: () => void;
}) {
	const items = [
		{
			icon: Folder,
			title: "创建项目",
			desc: "把研究、写作、对话集中起来管理",
			cta: "立即创建",
			onClick: onCreateProject,
			accent: "text-text-primary",
		},
		{
			icon: FileText,
			title: "导入资料",
			desc: "PDF / Word / Markdown，AI 自动整理",
			desc2: "进入项目后从「资料」标签上传",
			accent: "text-text-secondary",
		},
		{
			icon: MessageSquare,
			title: "与 AI 对话",
			desc: "直接提问，引用你的资料库",
			desc2: "进入项目后从「对话」标签开始",
			accent: "text-text-secondary",
		},
	] as const;

	return (
		<div className="flex flex-col items-center gap-8 py-8">
			<div className="flex items-center gap-2 text-text-secondary">
				<Sparkles className="w-4 h-4" strokeWidth={1.5} />
				<p className="text-sm font-medium">从这里开始</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
				{items.map((item) => {
					const Icon = item.icon;
					const interactive = "onClick" in item && item.onClick;
					return (
						<button
							key={item.title}
							type="button"
							onClick={interactive ? item.onClick : undefined}
							disabled={!interactive}
							className={`
								group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 text-left
								transition-all duration-200 ease-out
								${
									interactive
										? "cursor-pointer hover:border-warm-400 hover:-translate-y-[1px] hover:shadow-[0_4px_12px_0_rgb(26_26_25/0.06)] active:scale-[0.99]"
										: "cursor-default opacity-90"
								}
							`}
						>
							<div className="w-9 h-9 rounded-xl bg-warm-200 flex items-center justify-center text-text-secondary group-hover:bg-warm-300 transition-colors">
								<Icon className="w-4 h-4" strokeWidth={1.5} />
							</div>
							<div className="space-y-1">
								<h4 className={`text-sm font-semibold ${item.accent}`}>
									{item.title}
								</h4>
								<p className="text-xs text-text-muted leading-relaxed">
									{item.desc}
								</p>
								{"desc2" in item && item.desc2 && (
									<p className="text-[11px] text-text-light leading-relaxed pt-0.5">
										{item.desc2}
									</p>
								)}
							</div>
							{interactive && "cta" in item && item.cta && (
								<div className="flex items-center gap-1 text-xs font-medium text-text-primary mt-1">
									{item.cta}
									<ChevronRight
										className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
										strokeWidth={1.5}
									/>
								</div>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}