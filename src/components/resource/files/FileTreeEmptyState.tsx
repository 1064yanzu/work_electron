import { FolderOpen } from "lucide-react";
import { IllustratedEmptyState } from "../../ui/EmptyState";
import { Skeleton } from "../../ui/Skeleton";

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
		// 树形骨架：模拟"目录 + 缩进子项"的形状，单一 shimmer 指示
		return (
			<div className="space-y-2.5 px-4 py-3" aria-busy="true">
				<Skeleton className="h-4 w-3/4" />
				<Skeleton className="ml-4 h-4 w-2/3" />
				<Skeleton className="ml-4 h-4 w-1/2" />
				<Skeleton className="h-4 w-3/5" />
			</div>
		);
	}

	if (variant === "empty") {
		return (
			<IllustratedEmptyState
				illustration="folder"
				title="文件夹为空"
				description="用头部的「新建文件」「新建文件夹」按钮开始创建"
				className="px-4"
			/>
		);
	}

	return (
		<IllustratedEmptyState
			illustration="folder"
			title="无工作路径"
			description="从「对话」中选择一条已绑定目录的对话，或为当前对话绑定一个目录"
			className="px-4"
			action={
				onOpenFolder ? (
					<button
						type="button"
						onClick={onOpenFolder}
						className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-warm-200/60 hover:text-text-primary"
					>
						<FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
						打开文件夹
					</button>
				) : undefined
			}
		/>
	);
}
