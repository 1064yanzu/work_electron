import { Folder, Search, X } from "lucide-react";
import { prefetchProjectData } from "../../lib/query";
import type { Project } from "../../types";

interface DashboardSearchModalProps {
	open: boolean;
	searchQuery: string;
	onSearchQueryChange: (value: string) => void;
	selectedIndex: number;
	onSelectedIndexChange: (next: number | ((prev: number) => number)) => void;
	filteredProjects: Project[];
	onClose: () => void;
	onSelectProject: (projectId: string) => void;
}

export function DashboardSearchModal({
	open,
	searchQuery,
	onSearchQueryChange,
	selectedIndex,
	onSelectedIndexChange,
	filteredProjects,
	onClose,
	onSelectProject,
}: DashboardSearchModalProps) {
	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 backdrop-blur-md flex items-start justify-center pt-[20vh]"
			style={{
				backgroundColor: "color-mix(in srgb, var(--t-bg) 85%, transparent)",
			}}
			onClick={onClose}
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
							onSearchQueryChange(e.target.value);
							onSelectedIndexChange(-1);
						}}
						onKeyDown={(e) => {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								onSelectedIndexChange((prev) =>
									Math.min(prev + 1, filteredProjects.length - 1),
								);
							} else if (e.key === "ArrowUp") {
								e.preventDefault();
								onSelectedIndexChange((prev) => Math.max(prev - 1, -1));
							} else if (e.key === "Enter" && selectedIndex >= 0) {
								e.preventDefault();
								const selected = filteredProjects[selectedIndex];
								if (selected) {
									onSelectProject(selected.id);
									onClose();
								}
							} else if (e.key === "Escape") {
								onClose();
							}
						}}
					/>
					<button
						onClick={onClose}
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
										onSelectProject(project.id);
										onClose();
									}}
									onMouseEnter={() => prefetchProjectData(project.id)}
									className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 group transition-colors cursor-pointer ${
										filteredProjects.indexOf(project) === selectedIndex
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
	);
}
