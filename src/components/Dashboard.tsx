import { Brain, Clock, FolderOpen, LayoutGrid, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createProject, getRecentProjects, listProjects } from "../lib/api";
import { buildProjectContextMenu } from "../lib/contextMenu/actions";
import { humanizeError } from "../lib/errors";
import { cardLibraryStoreApi } from "../lib/stores/cardLibraryStore";
import { invoke } from "../lib/tauriCompat";
import type { Project } from "../types";
import { DashboardHeader } from "./dashboard/DashboardHeader";
import { DashboardSearchModal } from "./dashboard/DashboardSearchModal";
import { NavItem } from "./dashboard/NavItem";
import { NewProjectCard } from "./dashboard/NewProjectCard";
import { ProjectsGrid } from "./dashboard/ProjectsGrid";
import { useProjectActions } from "./dashboard/useProjectActions";
import { ContextMenu } from "./ui/ContextMenu";
import { toast } from "./ui/Toast";

interface DashboardProps {
	onOpenSettings: () => void;
	onOpenProject?: (projectId: string) => void;
}

type Tab = "overview" | "recent" | "archived";

export default function Dashboard({
	onOpenSettings,
	onOpenProject,
}: DashboardProps) {
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [activeTab, setActiveTab] = useState<Tab>("overview");
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

	const {
		handleRenameProject,
		handleToggleArchiveProject,
		handleDeleteProject,
		handleRevealProject,
	} = useProjectActions({ loadProjects });

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

	const projectContextMenuItems = contextMenu
		? buildProjectContextMenu({
				onOpen: () => handleOpenProject(contextMenu.project.id),
				onRename: () => void handleRenameProject(contextMenu.project),
				onToggleArchive: () =>
					void handleToggleArchiveProject(contextMenu.project),
				onDelete: () => void handleDeleteProject(contextMenu.project),
				onReveal: () => void handleRevealProject(contextMenu.project),
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
					<NavItem
						icon={Brain}
						label="知识卡片"
						active={false}
						onClick={() => cardLibraryStoreApi.open()}
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
				<DashboardSearchModal
					open={showSearch}
					searchQuery={searchQuery}
					onSearchQueryChange={setSearchQuery}
					selectedIndex={searchSelectedIndex}
					onSelectedIndexChange={(next) =>
						setSearchSelectedIndex(
							typeof next === "function" ? next(searchSelectedIndex) : next,
						)
					}
					filteredProjects={filteredProjects}
					onClose={() => setShowSearch(false)}
					onSelectProject={(projectId) => onOpenProject?.(projectId)}
				/>

				<div className="max-w-4xl mx-auto p-10 lg:p-14">
					<DashboardHeader
						greeting={greeting}
						username={username}
						viewMode={viewMode}
						onChangeViewMode={setViewMode}
						onOpenSearch={() => setShowSearch(true)}
					/>

					{/* New Project Entry — B.AI 卡片，点击 inline 展开输入区，避免 Modal */}
					{activeTab === "overview" && (
						<NewProjectCard
							expanded={showNewProject}
							onExpand={() => setShowNewProject(true)}
							onCancel={() => {
								setShowNewProject(false);
								setNewProjectName("");
							}}
							newProjectName={newProjectName}
							onChangeName={setNewProjectName}
							onCreate={handleCreateProject}
						/>
					)}

					<ProjectsGrid
						activeTab={activeTab}
						viewMode={viewMode}
						isLoading={isLoading}
						filteredProjects={filteredProjects}
						searchQuery={searchQuery}
						onOpenProject={handleOpenProject}
						onContextMenu={handleProjectContextMenu}
						onClearSearch={() => setSearchQuery("")}
						onCreateProject={() => setShowNewProject(true)}
					/>
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
