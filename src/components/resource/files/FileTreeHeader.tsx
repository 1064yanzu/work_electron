import { ChevronsDownUp, FilePlus, FolderPlus, RefreshCcw } from "lucide-react";
import { cn } from "../../../lib/utils";

interface FileTreeHeaderProps {
	hasPath: boolean;
	isLoading: boolean;
	onCreateFile: () => void;
	onCreateFolder: () => void;
	onCollapseAll: () => void;
	onRefresh: () => void;
}

/** 左边栏 FILES 头部：标题 + 4 个图标按钮（新建文件 / 新建文件夹 / 折叠 / 刷新）。 */
export function FileTreeHeader({
	hasPath,
	isLoading,
	onCreateFile,
	onCreateFolder,
	onCollapseAll,
	onRefresh,
}: FileTreeHeaderProps) {
	return (
		<div className="px-6 py-5 flex items-center justify-between shrink-0 mb-2 border-b border-border dark:border-white/[0.05]">
			<h2 className="font-semibold text-[13px] text-text-muted uppercase tracking-widest">
				Files
			</h2>
			<div className="flex items-center gap-0.5">
				<HeaderIconButton
					title="新建文件"
					disabled={!hasPath}
					onClick={onCreateFile}
				>
					<FilePlus className="w-3.5 h-3.5" />
				</HeaderIconButton>
				<HeaderIconButton
					title="新建文件夹"
					disabled={!hasPath}
					onClick={onCreateFolder}
				>
					<FolderPlus className="w-3.5 h-3.5" />
				</HeaderIconButton>
				<HeaderIconButton
					title="折叠所有"
					disabled={!hasPath}
					onClick={onCollapseAll}
				>
					<ChevronsDownUp className="w-3.5 h-3.5" />
				</HeaderIconButton>
				<HeaderIconButton title="刷新" disabled={!hasPath} onClick={onRefresh}>
					<RefreshCcw
						className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
					/>
				</HeaderIconButton>
			</div>
		</div>
	);
}

interface HeaderIconButtonProps {
	title: string;
	disabled?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}

function HeaderIconButton({
	title,
	disabled,
	onClick,
	children,
}: HeaderIconButtonProps) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"p-1.5 rounded-lg transition-colors",
				disabled
					? "text-text-light/40 cursor-not-allowed"
					: "text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-black/5 dark:hover:bg-surface/10 cursor-pointer",
			)}
		>
			{children}
		</button>
	);
}
