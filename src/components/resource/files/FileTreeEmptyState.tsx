import { Folder, FolderOpen, RefreshCcw } from "lucide-react";

interface FileTreeEmptyStateProps {
	variant: "no-path" | "loading" | "empty";
	onOpenFolder?: () => void;
}

/** FILES 面板的三种空态：无工作路径 / 加载中 / 文件夹为空。 */
export function FileTreeEmptyState({
	variant,
	onOpenFolder,
}: FileTreeEmptyStateProps) {
	if (variant === "loading") {
		return (
			<div className="text-center py-10 px-6 mt-10">
				<RefreshCcw className="w-5 h-5 text-text-light mx-auto mb-3 animate-spin" />
				<p className="text-xs text-text-light">加载中…</p>
			</div>
		);
	}

	if (variant === "empty") {
		return (
			<div className="text-center py-10 px-6 mt-10">
				<p className="text-sm text-text-muted font-medium">文件夹为空</p>
				<p className="text-xs text-text-light mt-2">
					点击头部的 + 按钮新建文件或文件夹
				</p>
			</div>
		);
	}

	return (
		<div className="text-center py-10 px-6 mt-10">
			<Folder className="w-10 h-10 text-text-light mx-auto mb-4" />
			<p className="text-sm text-text-muted font-medium">无工作路径</p>
			<p className="text-xs text-text-light mt-2">
				从「对话」中选择一条已绑定目录的对话，
				<br />
				或为当前对话绑定一个目录：
			</p>
			{onOpenFolder ? (
				<button
					type="button"
					onClick={onOpenFolder}
					className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-warm-50 hover:bg-warm-200 dark:hover:bg-cream-700 text-text-secondary transition-colors cursor-pointer"
				>
					<FolderOpen className="w-3.5 h-3.5" />
					打开文件夹
				</button>
			) : null}
		</div>
	);
}
