/**
 * 编程工作区 - 文件浏览器（左面板）
 * 包含：搜索框 + 全部展开/收起 + 文件树 + "@附加到对话" 操作
 * 双击文件在中间面板打开
 */
import {
	ChevronsDownUp,
	ChevronsUpDown,
	FileText,
	FolderOpen,
	RefreshCcw,
	Search,
	X,
} from "lucide-react";
import { useCallback, useMemo, useRef } from "react";
import { attachContextFiles } from "../../lib/coding/contextFiles";
import { openCodingFilePreview } from "../../lib/coding/filePreview";
import {
	codingWorkspaceStore,
	useCodingWorkspaceSelector,
	type FileTreeNode,
} from "../../lib/stores/codingWorkspaceStore";
import { CodingFileTree, type CodingFileTreeHandle } from "./CodingFileTree";
import { toast } from "../ui/Toast";

interface CodingFileExplorerProps {
	onRefreshTree?: () => void;
}

export function CodingFileExplorer({ onRefreshTree }: CodingFileExplorerProps) {
	const fileTree = useCodingWorkspaceSelector((s) => s.fileTree);
	const fileTreeLoading = useCodingWorkspaceSelector((s) => s.fileTreeLoading);
	const searchQuery = useCodingWorkspaceSelector((s) => s.fileSearchQuery);
	const projectName = useCodingWorkspaceSelector((s) => s.projectName);

	const treeRef = useRef<CodingFileTreeHandle>(null);

	const handleSearch = useCallback((value: string) => {
		codingWorkspaceStore.setFileSearchQuery(value);
	}, []);

	const handleClearSearch = useCallback(() => {
		codingWorkspaceStore.setFileSearchQuery("");
	}, []);

	const handleAttachFile = useCallback((node: FileTreeNode) => {
		if (node.type === "file") {
			void attachContextFiles([node.path]).then((result) => {
				if (result.added > 0) {
					toast.success(`${node.name} 已加入当前线程上下文`);
				}
			});
		}
	}, []);

	const handleOpenFile = useCallback((node: FileTreeNode) => {
		if (node.type === "file") {
			// 单击：选中文件（左侧高亮）
			codingWorkspaceStore.setSelectedFile(node.path);
		}
	}, []);

	const handleDoubleClickFile = useCallback((node: FileTreeNode) => {
		if (node.type === "file") {
			// 双击：在中间面板打开文件 Tab
			void openCodingFilePreview(node.path);
		}
	}, []);

	const handleExpandAll = useCallback(() => {
		treeRef.current?.expandAll();
	}, []);

	const handleCollapseAll = useCallback(() => {
		treeRef.current?.collapseAll();
	}, []);

	// 过滤文件树
	const filteredTree = useMemo(() => {
		if (!searchQuery.trim()) return fileTree;
		return filterTree(fileTree, searchQuery.toLowerCase());
	}, [fileTree, searchQuery]);

	return (
		<div className="h-full flex flex-col bg-[#FAFAFA] dark:bg-[#111111]">
			{/* Header */}
			<div className="px-3 py-2.5 border-b border-black/[0.04] dark:border-white/[0.04]">
				<div className="flex items-center gap-2 mb-2">
					<FolderOpen className="w-3.5 h-3.5 text-zinc-500" />
					<span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider truncate">
						{projectName || "文件"}
					</span>
					<div className="ml-auto flex items-center gap-0.5">
						{/* 全部展开 */}
						<button
							type="button"
							onClick={handleExpandAll}
							className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
							title="全部展开"
						>
							<ChevronsUpDown className="h-3.5 w-3.5" />
						</button>
						{/* 全部收起 */}
						<button
							type="button"
							onClick={handleCollapseAll}
							className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
							title="全部收起"
						>
							<ChevronsDownUp className="h-3.5 w-3.5" />
						</button>
						{/* 刷新 */}
						{onRefreshTree && (
							<button
								type="button"
								onClick={onRefreshTree}
								className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
								title="刷新文件树"
							>
								<RefreshCcw className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				</div>

				{/* 搜索框 */}
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => handleSearch(e.target.value)}
						placeholder="搜索文件..."
						className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#D96C46]/30 focus:border-[#D96C46]/30 placeholder:text-zinc-400 text-zinc-700 dark:text-zinc-300"
					/>
					{searchQuery && (
						<button
							onClick={handleClearSearch}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-400 hover:text-zinc-600"
						>
							<X className="w-3 h-3" />
						</button>
					)}
				</div>
			</div>

			{/* 文件树 */}
			<div className="flex-1 overflow-y-auto scrollbar-thin py-1">
				{fileTreeLoading ? (
					<div className="flex items-center justify-center py-12">
						<div className="flex flex-col items-center gap-2">
							<div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-[#D96C46] rounded-full animate-spin" />
							<span className="text-xs text-zinc-400">加载文件树...</span>
						</div>
					</div>
				) : filteredTree.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 px-4">
						<FileText className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mb-2" />
						<span className="text-xs text-zinc-400 text-center">
							{searchQuery ? "没有匹配的文件" : "暂无文件"}
						</span>
					</div>
				) : (
					<CodingFileTree
						ref={treeRef}
						nodes={filteredTree}
						onOpenFile={handleOpenFile}
						onAttachFile={handleAttachFile}
						onDoubleClickFile={handleDoubleClickFile}
					/>
				)}
			</div>
		</div>
	);
}

/** 递归过滤文件树 */
function filterTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
	const result: FileTreeNode[] = [];
	for (const node of nodes) {
		if (node.type === "directory") {
			const filteredChildren = node.children
				? filterTree(node.children, query)
				: [];
			// 如果目录名匹配或者有匹配的子节点，保留该目录
			if (
				node.name.toLowerCase().includes(query) ||
				filteredChildren.length > 0
			) {
				result.push({
					...node,
					children:
						filteredChildren.length > 0 ? filteredChildren : node.children,
				});
			}
		} else {
			if (node.name.toLowerCase().includes(query)) {
				result.push(node);
			}
		}
	}
	return result;
}
