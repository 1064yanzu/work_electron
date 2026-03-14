import {
	ChevronRight,
	Clock,
	Code2,
	Folder,
	FolderOpen,
	LayoutGrid,
	List as ListIcon,
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
import { prefetchProjectData } from "../lib/query";
import type { Project } from "../types";
import { confirmDialog } from "./ui/ConfirmDialog";
import { ContextMenu } from "./ui/ContextMenu";
import { inputDialog } from "./ui/InputDialog";
import { toast } from "./ui/Toast";

interface DashboardProps {
	onOpenSettings: () => void;
	onOpenProject?: (projectId: string) => void;
	onOpenCoding?: (projectPath?: string) => void;
}

export default function Dashboard({
	onOpenSettings,
	onOpenProject,
	onOpenCoding,
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

	// Try to get username from settings or default to a generic title
	const username = "Creator"; // TODO: replace with real profile name when available

	const loadProjects = useCallback(async () => {
		try {
			console.log("[Dashboard] 开始获取项目列表...");
			let recent: Project[] = [];
			let all: Project[] = [];

			try {
				recent = await getRecentProjects(10);
				console.log("[Dashboard] 获取到", recent.length, "个最近项目");
			} catch (e) {
				console.warn("[Dashboard] 获取最近项目失败，可能是表不存在:", e);
			}

			try {
				all = await listProjects();
				console.log("[Dashboard] 获取到", all.length, "个全部项目");
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
	}, [loadProjects]);

	const handleCreateProject = async () => {
		if (!newProjectName.trim()) return;
		try {
			const project = await createProject({ name: newProjectName.trim() });
			setAllProjects((prev) => [project, ...prev]);
			setRecentProjects((prev) => [project, ...prev]);
			setNewProjectName("");
			setShowNewProject(false);
			// 打开新项目
			onOpenProject?.(project.id);
		} catch (e) {
			console.error("创建项目失败:", e);
			toast.error(
				`创建项目失败: ${e instanceof Error ? e.message : String(e)}`,
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
				toast.error(
					`重命名失败: ${error instanceof Error ? error.message : String(error)}`,
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
				toast.error(
					`更新失败: ${error instanceof Error ? error.message : String(error)}`,
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
				toast.error(
					`删除失败: ${error instanceof Error ? error.message : String(error)}`,
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
						toast.error(
							`打开目录失败: ${error instanceof Error ? error.message : String(error)}`,
						);
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
		<div className="min-h-screen w-screen bg-[#FBFBF9] dark:bg-[#0a0a0a] text-zinc-800 dark:text-zinc-200 font-sans selection:bg-primary/20 flex overflow-hidden relative">
			{/* Left Sidebar - More minimal */}
			<aside className="w-20 lg:w-64 shrink-0 flex flex-col py-8 px-4 lg:px-6 border-r border-black/[0.03] dark:border-white/[0.03] z-20 bg-[#FBFBF9] dark:bg-[#0a0a0a]">
				{/* ... sidebar content same as before but cleaner styles ... */}
				<div className="flex items-center gap-3 mb-12 px-2">
					<div className="w-8 h-8 bg-zinc-900 dark:bg-white rounded-lg flex items-center justify-center text-white dark:text-black shadow-sm shrink-0">
						<Sparkles className="w-4 h-4" />
					</div>
					<span className="font-serif font-bold text-xl tracking-tight hidden lg:block text-zinc-900 dark:text-white">
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

					{/* 分隔线 */}
					<div className="!my-3 border-t border-black/[0.04] dark:border-white/[0.04]" />

					<NavItem
						icon={Code2}
						label="AI 编程"
						active={false}
						onClick={() => onOpenCoding?.()}
					/>
				</nav>

				{/* Sidebar Footer */}
				<div className="mt-auto pt-4 border-t border-black/[0.03] dark:border-white/[0.03]">
					<button
						onClick={onOpenSettings}
						aria-label="设置"
						className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all group text-sm cursor-pointer"
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
						className="fixed inset-0 z-50 bg-[#FBFBF9]/80 dark:bg-black/80 backdrop-blur-md flex items-start justify-center pt-[20vh]"
						onClick={() => setShowSearch(false)}
					>
						<div
							className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-black/5 dark:border-white/10 p-0 animate-in fade-in zoom-in-95 duration-200"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-100 dark:border-zinc-800">
								<Search className="w-5 h-5 text-zinc-400" />
								<input
									autoFocus
									type="text"
									className="flex-1 bg-transparent border-none outline-none text-lg placeholder:text-zinc-300 font-serif text-zinc-800 dark:text-zinc-100"
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
									className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 cursor-pointer transition-colors"
								>
									<X className="w-5 h-5" />
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
												className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 group transition-colors cursor-pointer ${
													filteredProjects.indexOf(project) ===
													searchSelectedIndex
														? "bg-primary/10 dark:bg-primary/20"
														: "hover:bg-[#F4F4F2] dark:hover:bg-zinc-800"
												}`}
											>
												<Folder
													className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100"
													style={{ color: project.color }}
												/>
												<div>
													<div className="font-serif font-medium text-sm text-zinc-800 dark:text-zinc-100">
														{project.name}
													</div>
													<div className="text-xs text-zinc-400 line-clamp-1 font-sans">
														{project.description || "暂无描述"}
													</div>
												</div>
											</button>
										))}
									</div>
								) : (
									<div className="px-4 py-12 text-center text-zinc-300 text-sm font-serif">
										输入关键词搜索...
									</div>
								)}
							</div>
						</div>
					</div>
				)}

				<div className="max-w-5xl mx-auto p-12 lg:p-16">
					<>
						{/* Header - Serif & Minimal */}
						<header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
							<div>
								<h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight mb-3 text-zinc-900 dark:text-zinc-50">
									{greeting}, {username}
								</h1>
								<p className="text-zinc-400 font-sans text-sm">
									准备好开始创作了吗？
								</p>
							</div>

							{/* Minimal View Toggles */}
							<div className="flex items-center gap-1 p-1 bg-zinc-100/50 dark:bg-zinc-800/50 rounded-lg">
								<button
									onClick={() => setViewMode("grid")}
									aria-label="网格视图"
									className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md cursor-pointer transition-all duration-150 ${viewMode === "grid" ? "text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-700 shadow-sm" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-700/50"}`}
								>
									<LayoutGrid className="w-4 h-4" />
								</button>
								<button
									onClick={() => setViewMode("list")}
									aria-label="列表视图"
									className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md cursor-pointer transition-all duration-150 ${viewMode === "list" ? "text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-700 shadow-sm" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-700/50"}`}
								>
									<ListIcon className="w-4 h-4" />
								</button>
								<button
									aria-label="搜索项目"
									className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 ml-1 hover:bg-white/50 dark:hover:bg-zinc-700/50 cursor-pointer transition-all duration-150 active:scale-95"
									onClick={() => setShowSearch(true)}
								>
									<Search className="w-4 h-4" />
								</button>
							</div>
						</header>

						{/* New Project Entry - Clean & Minimal */}
						{activeTab === "overview" && (
							<div
								onClick={() => {
									console.log("[Dashboard] 点击新建项目按钮");
									setShowNewProject(true);
								}}
								className="group relative w-full bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 hover:border-primary/30 dark:hover:border-primary/30 transition-all duration-300 cursor-pointer mb-16 overflow-hidden hover:shadow-[0_12px_40px_-12px_rgba(217,108,70,0.15)] active:scale-[0.995]"
							>
								<div className="px-8 py-10 flex items-center justify-between">
									<div>
										<h2 className="text-2xl font-serif text-zinc-900 dark:text-white mb-2 group-hover:translate-x-1 transition-transform duration-300">
											开始新项目
										</h2>
										<p className="text-zinc-400 text-sm font-sans group-hover:text-zinc-500 transition-colors">
											创建空白文档或选择模板
										</p>
									</div>
									<div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-white group-hover:scale-110 transition-transform duration-300">
										<Plus className="w-5 h-5" />
									</div>
								</div>
							</div>
						)}

						{/* Projects Grid - Clean Cards */}
						<div>
							<div className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-100 dark:border-zinc-800/50">
								<h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
									{activeTab === "overview"
										? "最近的项目"
										: activeTab === "recent"
											? "今天"
											: "已归档"}
								</h3>
								<button
									onClick={() => setShowNewProject(true)}
									className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
								>
									<Plus className="w-3 h-3" />
									新建项目
								</button>
							</div>

							{/* 新建项目对话框 */}
							{showNewProject && (
								<div
									className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center"
									onClick={() => setShowNewProject(false)}
								>
									<div
										className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4"
										onClick={(e) => e.stopPropagation()}
									>
										<h3 className="font-serif text-xl mb-4 text-zinc-900 dark:text-white">
											新建项目
										</h3>
										<input
											autoFocus
											type="text"
											placeholder="项目名称"
											value={newProjectName}
											onChange={(e) => setNewProjectName(e.target.value)}
											onKeyDown={(e) =>
												e.key === "Enter" && handleCreateProject()
											}
											className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-zinc-800 dark:text-zinc-100 mb-4 focus:outline-none focus:ring-2 focus:ring-primary/50"
										/>
										<div className="flex justify-end gap-2">
											<button
												onClick={() => setShowNewProject(false)}
												className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700"
											>
												取消
											</button>
											<button
												onClick={handleCreateProject}
												className="px-4 py-2 text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90"
											>
												创建
											</button>
										</div>
									</div>
								</div>
							)}

							{isLoading ? (
								<div
									className={`grid gap-6 ${viewMode === "grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}
								>
									{Array.from({ length: 6 }).map((_, i) => (
										<div
											key={i}
											className="rounded-2xl border border-zinc-100 dark:border-zinc-800 p-6 space-y-4 h-48 animate-in fade-in"
											style={{ animationDelay: `${i * 50}ms` }}
										>
											<div className="flex items-start justify-between">
												<div className="w-10 h-10 rounded-lg skeleton" />
											</div>
											<div className="space-y-2">
												<div className="h-5 w-3/4 skeleton rounded" />
												<div className="h-4 w-full skeleton rounded" />
												<div className="h-4 w-2/3 skeleton rounded" />
											</div>
											<div className="flex items-center justify-between pt-2">
												<div className="h-3 w-20 skeleton rounded" />
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
											onClick={() => {
												console.log(
													"[Dashboard] 点击项目卡片:",
													project.id,
													project.name,
												);
												handleOpenProject(project.id);
											}}
											onMouseEnter={() => prefetchProjectData(project.id)}
											onContextMenu={(e) =>
												handleProjectContextMenu(e, project)
											}
											className={`
                        group bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 
                        hover:border-zinc-300 dark:hover:border-zinc-600
                        rounded-2xl p-6 cursor-pointer 
                        transition-all duration-300 ease-out
                        hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.4)]
                        hover:-translate-y-1
                        active:scale-[0.98] active:shadow-sm
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
														className="relative flex items-center justify-center w-10 h-10 rounded-lg border border-black/5 dark:border-white/10 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-transform group-hover:scale-110 duration-500 ease-out"
														style={{
															backgroundColor: `${project.color}08`, // 极淡的背景色
														}}
													>
														<Folder
															className="w-5 h-5 transition-colors duration-300"
															style={{ color: project.color }}
														/>
													</div>
													<div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-x-1 group-hover:translate-x-0">
														<span className="text-[10px] font-medium text-zinc-400 tracking-wider uppercase">
															OPEN
														</span>
														<ChevronRight className="w-3 h-3 text-zinc-400" />
													</div>
												</div>
												<h4 className="font-serif text-xl font-medium text-zinc-900 dark:text-zinc-50 mb-3 line-clamp-1 group-hover:text-primary transition-colors duration-300">
													{project.name}
												</h4>
												<p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2 font-sans font-normal tracking-wide">
													{project.description || "暂无描述"}
												</p>
											</div>

											<div className="flex items-center justify-between pt-4 mt-2 border-t border-zinc-50 dark:border-white/5">
												<div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 font-sans tracking-wide">
													{new Date(project.updated_at).toLocaleDateString(
														"en-US",
														{
															month: "short",
															day: "numeric",
														},
													)}
												</div>
												<div className="h-1.5 w-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 group-hover:bg-green-500 transition-colors duration-500" />
											</div>
										</div>
									))}

									{filteredProjects.length === 0 && (
										<div className="col-span-full py-20 text-center">
											<p className="font-serif text-zinc-400 text-lg italic">
												暂无项目，点击上方创建新项目
											</p>
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
					? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/5"
					: "text-zinc-500 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100 hover:scale-[1.01] active:scale-[0.99]"
			}
    `}
		>
			{/* 激活指示器 */}
			{active && (
				<div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
			)}
			<Icon
				className={`w-4 h-4 transition-colors ${active ? "text-zinc-900 dark:text-white" : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"}`}
				strokeWidth={2}
			/>
			<span
				className={`font-medium hidden lg:block ${active ? "font-semibold" : ""}`}
			>
				{label}
			</span>
			{badge && (
				<span className="ml-auto bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
					{badge}
				</span>
			)}
		</button>
	);
}
