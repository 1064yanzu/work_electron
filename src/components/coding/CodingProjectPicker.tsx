/**
 * 项目选择器面板
 * 在 Dashboard 的 "AI 编程" tab 下渲染
 * 提供：选择本地目录 + 最近项目列表
 */
import { Clock, Code2, FolderOpen, Sparkles, X } from "lucide-react";
import { useCallback } from "react";
import {
	codingWorkspaceStore,
	useCodingWorkspaceSelector,
	type RecentCodingProject,
} from "../../lib/stores/codingWorkspaceStore";

interface CodingProjectPickerProps {
	onOpenCoding?: (projectPath: string) => void;
}

export function CodingProjectPicker({
	onOpenCoding,
}: CodingProjectPickerProps) {
	const recentProjects = useCodingWorkspaceSelector((s) => s.recentProjects);

	const handleSelectDirectory = useCallback(async () => {
		try {
			const result = await window.electronAPI.invoke(
				"coding_select_directory",
				{},
			);
			if (result?.path) {
				onOpenCoding?.(result.path);
			}
		} catch (error) {
			console.error("[CodingProjectPicker] 选择目录失败:", error);
		}
	}, [onOpenCoding]);

	const handleOpenRecent = useCallback(
		(project: RecentCodingProject) => {
			onOpenCoding?.(project.path);
		},
		[onOpenCoding],
	);

	const handleRemoveRecent = useCallback(
		(e: React.MouseEvent, path: string) => {
			e.stopPropagation();
			codingWorkspaceStore.removeRecentProject(path);
		},
		[],
	);

	return (
		<div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
			{/* Header */}
			<header className="mb-16">
				<div className="flex items-center gap-3 mb-4">
					<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D96C46]/10 to-[#D96C46]/5 flex items-center justify-center">
						<Code2 className="w-5 h-5 text-[#D96C46]" />
					</div>
					<h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight text-zinc-900 dark:text-zinc-50">
						AI 编程
					</h1>
				</div>
				<p className="text-zinc-400 font-sans text-sm ml-[52px]">
					选择一个项目目录，开始 AI 辅助编程
				</p>
			</header>

			{/* Open Directory Card */}
			<div
				onClick={handleSelectDirectory}
				className="group relative w-full bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 hover:border-[#D96C46]/30 dark:hover:border-[#D96C46]/30 transition-all duration-300 cursor-pointer mb-12 overflow-hidden hover:shadow-[0_12px_40px_-12px_rgba(217,108,70,0.15)] active:scale-[0.995]"
			>
				<div className="px-8 py-10 flex items-center justify-between">
					<div>
						<h2 className="text-2xl font-serif text-zinc-900 dark:text-white mb-2 group-hover:translate-x-1 transition-transform duration-300">
							打开项目目录
						</h2>
						<p className="text-zinc-400 text-sm font-sans group-hover:text-zinc-500 transition-colors">
							选择本地文件夹，AI 将自动感知项目结构与 Git 状态
						</p>
					</div>
					<div className="w-12 h-12 rounded-full bg-[#D96C46]/10 flex items-center justify-center text-[#D96C46] group-hover:scale-110 transition-transform duration-300">
						<FolderOpen className="w-5 h-5" />
					</div>
				</div>
			</div>

			{/* Recent Projects */}
			{recentProjects.length > 0 && (
				<div>
					<div className="flex items-center justify-between mb-6 pb-3 border-b border-zinc-100 dark:border-zinc-800/50">
						<h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
							<Clock className="w-3.5 h-3.5" />
							最近打开的项目
						</h3>
					</div>

					<div className="space-y-2">
						{recentProjects.map((project) => (
							<div
								key={project.path}
								onClick={() => handleOpenRecent(project)}
								className="group flex items-center gap-4 px-5 py-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 cursor-pointer transition-all duration-200 hover:shadow-sm active:scale-[0.99]"
							>
								<div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
									<FolderOpen className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="font-serif font-medium text-sm text-zinc-800 dark:text-zinc-100 truncate">
										{project.name}
									</div>
									<div className="text-xs text-zinc-400 truncate mt-0.5 font-mono">
										{project.path}
									</div>
								</div>
								<div className="flex items-center gap-2 shrink-0">
									<span className="text-[11px] text-zinc-400 tabular-nums">
										{formatRelativeTime(project.lastOpenedAt)}
									</span>
									<button
										onClick={(e) => handleRemoveRecent(e, project.path)}
										className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-all"
										title="移除记录"
									>
										<X className="w-3.5 h-3.5" />
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Empty State */}
			{recentProjects.length === 0 && (
				<div className="text-center py-16">
					<Sparkles className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
					<p className="font-serif text-zinc-400 text-lg">
						选择一个项目开始编程之旅
					</p>
					<p className="text-zinc-400/60 text-sm mt-2">
						支持任何本地项目目录，AI 会自动识别项目类型
					</p>
				</div>
			)}
		</div>
	);
}

/** 格式化相对时间 */
function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	if (hours < 24) return `${hours} 小时前`;
	if (days < 7) return `${days} 天前`;
	return new Date(timestamp).toLocaleDateString("zh-CN", {
		month: "short",
		day: "numeric",
	});
}
