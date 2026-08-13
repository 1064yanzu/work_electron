import { ChevronsDownUp, FilePlus, FolderPlus, RefreshCcw } from "lucide-react";
import { cn } from "../../../lib/utils";
import { SidebarViewHeader } from "../sidebar/SidebarViewHeader";

interface FileTreeHeaderProps {
	hasPath: boolean;
	isLoading: boolean;
	onCreateFile: () => void;
	onCreateFolder: () => void;
	onCollapseAll: () => void;
	onRefresh: () => void;
}

/** 左边栏「文件」头部：标题 + 4 个图标按钮（新建文件 / 新建文件夹 / 折叠 / 刷新）。 */
export function FileTreeHeader({
	hasPath,
	isLoading,
	onCreateFile,
	onCreateFolder,
	onCollapseAll,
	onRefresh,
}: FileTreeHeaderProps) {
	return (
		<SidebarViewHeader
			title="文件"
			actions={
				<>
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
					<HeaderIconButton
						title="刷新"
						disabled={!hasPath}
						onClick={onRefresh}
					>
						<RefreshCcw
							className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
						/>
					</HeaderIconButton>
				</>
			}
		/>
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
					: "text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-black/5 dark:hover:bg-white/[0.06] cursor-pointer",
			)}
		>
			{children}
		</button>
	);
}
