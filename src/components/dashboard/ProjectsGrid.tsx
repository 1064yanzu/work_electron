import { ChevronRight, Folder, Plus } from "lucide-react";
import { prefetchProjectData } from "../../lib/query";
import type { Project } from "../../types";
import { EmptyOnboarding } from "./EmptyOnboarding";

type ViewMode = "grid" | "list";
type Tab = "overview" | "recent" | "archived";

interface ProjectsGridProps {
	activeTab: Tab;
	viewMode: ViewMode;
	isLoading: boolean;
	filteredProjects: Project[];
	searchQuery: string;
	onOpenProject: (projectId: string) => void;
	onContextMenu: (e: React.MouseEvent, project: Project) => void;
	onClearSearch: () => void;
	onCreateProject: () => void;
}

export function ProjectsGrid({
	activeTab,
	viewMode,
	isLoading,
	filteredProjects,
	searchQuery,
	onOpenProject,
	onContextMenu,
	onClearSearch,
	onCreateProject,
}: ProjectsGridProps) {
	return (
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
					onClick={onCreateProject}
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
							onClick={() => onOpenProject(project.id)}
							onMouseEnter={() => prefetchProjectData(project.id)}
							onContextMenu={(e) => onContextMenu(e, project)}
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
									{new Date(project.updated_at).toLocaleDateString("zh-CN", {
										month: "short",
										day: "numeric",
									})}
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
										onClick={onClearSearch}
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
								<EmptyOnboarding onCreateProject={onCreateProject} />
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
