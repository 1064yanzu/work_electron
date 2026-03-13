/**
 * 递归文件树渲染组件
 * 支持展开/折叠目录、选中文件、右键附加到对话
 * 显示 Git 状态标记和 diff 变更指示器
 */
import {
	ChevronDown,
	ChevronRight,
	File,
	FileCode,
	FileCog,
	FileJson,
	FileLock2,
	FileText,
	FileType,
	FolderClosed,
	FolderOpen,
	Image,
	Package,
	Paperclip,
} from "lucide-react";
import {
	useCallback,
	useImperativeHandle,
	useState,
	forwardRef,
	type Ref,
} from "react";
import {
	useCodingWorkspaceSelector,
	type FileTreeNode,
	type GitFileStatus,
} from "../../lib/stores/codingWorkspaceStore";
import { useDiffStoreSelector } from "../../lib/stores/diffStore";

// === 公开 ref handle，供父组件调用展开/折叠 ===
export interface CodingFileTreeHandle {
	expandAll: () => void;
	collapseAll: () => void;
}

interface CodingFileTreeProps {
	nodes: FileTreeNode[];
	depth?: number;
	onOpenFile?: (node: FileTreeNode) => void;
	onAttachFile?: (node: FileTreeNode) => void;
	onDoubleClickFile?: (node: FileTreeNode) => void;
}

export const CodingFileTree = forwardRef(function CodingFileTree(
	{
		nodes,
		depth = 0,
		onOpenFile,
		onAttachFile,
		onDoubleClickFile,
	}: CodingFileTreeProps,
	ref: Ref<CodingFileTreeHandle>,
) {
	// 全局展开/折叠状态（仅根层级管理）
	const [globalExpand, setGlobalExpand] = useState<
		"expand" | "collapse" | null
	>(null);

	useImperativeHandle(ref, () => ({
		expandAll: () => setGlobalExpand("expand"),
		collapseAll: () => setGlobalExpand("collapse"),
	}));

	// Git 状态映射（path -> status）
	const gitFiles = useCodingWorkspaceSelector((s) => s.gitStatus?.files);
	// Diff 数据（检测哪些文件有待处理 diff）
	const diffs = useDiffStoreSelector((s) => s.diffs);

	// 构建快速查找映射
	const gitStatusMap = gitFiles
		? new Map(gitFiles.map((f) => [f.absolutePath ?? f.path, f]))
		: new Map<string, GitFileStatus>();

	const pendingDiffPaths = new Set(
		Object.values(diffs)
			.filter((d) => d.status === "pending")
			.map((d) => d.filePath),
	);

	return (
		<div className="select-none">
			{nodes.map((node) => (
				<TreeNode
					key={node.path}
					node={node}
					depth={depth}
					onOpenFile={onOpenFile}
					onAttachFile={onAttachFile}
					onDoubleClickFile={onDoubleClickFile}
					gitStatusMap={gitStatusMap}
					pendingDiffPaths={pendingDiffPaths}
					globalExpand={globalExpand}
				/>
			))}
		</div>
	);
});

function TreeNode({
	node,
	depth,
	onOpenFile,
	onAttachFile,
	onDoubleClickFile,
	gitStatusMap,
	pendingDiffPaths,
	globalExpand,
}: {
	node: FileTreeNode;
	depth: number;
	onOpenFile?: (node: FileTreeNode) => void;
	onAttachFile?: (node: FileTreeNode) => void;
	onDoubleClickFile?: (node: FileTreeNode) => void;
	gitStatusMap: Map<string, GitFileStatus>;
	pendingDiffPaths: Set<string>;
	globalExpand: "expand" | "collapse" | null;
}) {
	const defaultExpanded =
		globalExpand === "expand"
			? true
			: globalExpand === "collapse"
				? false
				: depth < 1;
	const [expanded, setExpanded] = useState(defaultExpanded);

	// 响应全局展开/折叠变化
	if (globalExpand === "expand" && !expanded) {
		setExpanded(true);
	} else if (globalExpand === "collapse" && expanded && depth > 0) {
		setExpanded(false);
	}

	const selectedFilePath = useCodingWorkspaceSelector(
		(s) => s.selectedFilePath,
	);
	const isSelected = node.path === selectedFilePath;
	const isDir = node.type === "directory";

	// Git 状态
	const gitStatus = isDir ? undefined : gitStatusMap.get(node.path);
	// Diff 变更标记
	const hasPendingDiff = pendingDiffPaths.has(node.path);

	const handleClick = useCallback(() => {
		if (isDir) {
			setExpanded((prev) => !prev);
		} else {
			onOpenFile?.(node);
		}
	}, [isDir, node, onOpenFile]);

	const handleDoubleClick = useCallback(() => {
		if (!isDir) {
			onDoubleClickFile?.(node);
		}
	}, [isDir, node, onDoubleClickFile]);

	const handleAttach = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onAttachFile?.(node);
		},
		[node, onAttachFile],
	);

	const Icon = isDir
		? expanded
			? FolderOpen
			: FolderClosed
		: getFileIcon(node.name);

	const iconColor = isDir
		? "text-[#D96C46]/70"
		: getFileIconColor(node.name, gitStatus?.status);

	// Git 状态颜色和标记
	const statusIndicator = getGitStatusIndicator(gitStatus?.status);

	return (
		<>
			<div
				onClick={handleClick}
				onDoubleClick={handleDoubleClick}
				className={`group flex items-center gap-1 px-2 py-[3px] cursor-pointer transition-colors ${
					isSelected
						? "bg-[#D96C46]/8 text-zinc-900 dark:text-zinc-100"
						: "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
				}`}
				style={{ paddingLeft: `${depth * 16 + 8}px` }}
			>
				{/* 展开/折叠箭头 */}
				{isDir ? (
					<span className="w-4 h-4 flex items-center justify-center shrink-0">
						{expanded ? (
							<ChevronDown className="w-3 h-3 text-zinc-400" />
						) : (
							<ChevronRight className="w-3 h-3 text-zinc-400" />
						)}
					</span>
				) : (
					<span className="w-4 shrink-0" />
				)}

				{/* 文件/目录图标 */}
				<Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />

				{/* 名称 */}
				<span
					className={`text-xs truncate flex-1 ${statusIndicator?.textColor ?? ""}`}
				>
					{node.name}
				</span>

				{/* Diff 待处理标记 */}
				{hasPendingDiff && (
					<span
						className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
						title="有待处理的变更"
					/>
				)}

				{/* Git 状态标记 */}
				{statusIndicator && !hasPendingDiff && (
					<span
						className={`text-[9px] font-bold shrink-0 leading-none ${statusIndicator.color}`}
						title={statusIndicator.title}
					>
						{statusIndicator.letter}
					</span>
				)}

				{/* 附加按钮（仅文件） */}
				{!isDir && (
					<button
						onClick={handleAttach}
						className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-400 hover:text-[#D96C46] transition-opacity shrink-0"
						title="附加到对话 (@)"
					>
						<Paperclip className="w-3 h-3" />
					</button>
				)}
			</div>

			{/* 子节点 */}
			{isDir && expanded && node.children && (
				<CodingFileTree
					nodes={node.children}
					depth={depth + 1}
					onOpenFile={onOpenFile}
					onAttachFile={onAttachFile}
					onDoubleClickFile={onDoubleClickFile}
				/>
			)}
		</>
	);
}

// === Git 状态指示器 ===
interface StatusIndicator {
	letter: string;
	color: string;
	textColor: string;
	title: string;
}

function getGitStatusIndicator(
	status?: GitFileStatus["status"],
): StatusIndicator | null {
	switch (status) {
		case "modified":
			return {
				letter: "M",
				color: "text-amber-500",
				textColor: "text-amber-600 dark:text-amber-400",
				title: "已修改",
			};
		case "added":
			return {
				letter: "A",
				color: "text-emerald-500",
				textColor: "text-emerald-600 dark:text-emerald-400",
				title: "新增",
			};
		case "deleted":
			return {
				letter: "D",
				color: "text-red-500",
				textColor: "text-red-500/70",
				title: "已删除",
			};
		case "renamed":
			return {
				letter: "R",
				color: "text-blue-500",
				textColor: "text-blue-600 dark:text-blue-400",
				title: "已重命名",
			};
		case "copied":
			return {
				letter: "C",
				color: "text-cyan-500",
				textColor: "text-cyan-600 dark:text-cyan-400",
				title: "已复制",
			};
		case "conflicted":
			return {
				letter: "!",
				color: "text-orange-500",
				textColor: "text-orange-600 dark:text-orange-400",
				title: "存在冲突",
			};
		case "untracked":
			return {
				letter: "U",
				color: "text-zinc-400",
				textColor: "text-zinc-500",
				title: "未跟踪",
			};
		default:
			return null;
	}
}

// === 文件图标颜色（根据 Git 状态增强） ===
function getFileIconColor(
	filename: string,
	gitStatus?: GitFileStatus["status"],
): string {
	if (gitStatus === "added") return "text-emerald-500";
	if (gitStatus === "modified") return "text-amber-500";
	if (gitStatus === "deleted") return "text-red-500/50";
	if (gitStatus === "renamed") return "text-sky-500";
	if (gitStatus === "copied") return "text-cyan-500";
	if (gitStatus === "conflicted") return "text-orange-500";

	// 按文件类型给予语义化颜色
	const ext = filename.split(".").pop()?.toLowerCase() || "";
	if (["ts", "tsx"].includes(ext)) return "text-blue-500";
	if (["js", "jsx"].includes(ext)) return "text-yellow-500";
	if (["py"].includes(ext)) return "text-sky-500";
	if (["json", "yaml", "yml", "toml"].includes(ext)) return "text-amber-500/70";
	if (["md", "txt"].includes(ext)) return "text-zinc-400";
	if (["css", "scss", "less"].includes(ext)) return "text-purple-500";
	if (["html", "htm"].includes(ext)) return "text-orange-500";
	return "text-zinc-400 dark:text-zinc-500";
}

// === 文件图标映射（增强版） ===
function getFileIcon(filename: string) {
	const ext = filename.split(".").pop()?.toLowerCase() || "";
	const lowerName = filename.toLowerCase();

	// 特殊文件名
	if (
		lowerName === "package.json" ||
		lowerName === "cargo.toml" ||
		lowerName === "go.mod"
	)
		return Package;
	if (
		lowerName.endsWith(".lock") ||
		lowerName === "yarn.lock" ||
		lowerName === "pnpm-lock.yaml"
	)
		return FileLock2;
	if (
		lowerName.startsWith(".env") ||
		lowerName === ".gitignore" ||
		lowerName === ".editorconfig"
	)
		return FileCog;

	const codeExts = new Set([
		"ts",
		"tsx",
		"js",
		"jsx",
		"py",
		"rb",
		"go",
		"rs",
		"java",
		"c",
		"cpp",
		"h",
		"hpp",
		"cs",
		"swift",
		"kt",
		"vue",
		"svelte",
		"php",
		"sh",
		"bash",
		"zsh",
		"lua",
		"r",
		"scala",
		"css",
		"scss",
		"less",
		"html",
		"htm",
	]);
	const jsonExts = new Set(["json", "yaml", "yml", "toml", "xml"]);
	const imageExts = new Set([
		"png",
		"jpg",
		"jpeg",
		"gif",
		"svg",
		"webp",
		"ico",
	]);
	const textExts = new Set(["md", "txt", "rst", "log", "csv"]);
	const fontExts = new Set(["woff", "woff2", "ttf", "otf", "eot"]);

	if (codeExts.has(ext)) return FileCode;
	if (jsonExts.has(ext)) return FileJson;
	if (imageExts.has(ext)) return Image;
	if (textExts.has(ext)) return FileText;
	if (fontExts.has(ext)) return FileType;
	return File;
}
