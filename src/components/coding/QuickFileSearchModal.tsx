/**
 * 快速文件搜索弹窗（Cmd+P 触发）
 * 模糊搜索项目文件，支持键盘导航和选中打开
 */
import { FileCode2, Search, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	codingWorkspaceStore,
	useCodingWorkspaceSelector,
	type FileTreeNode,
} from "../../lib/stores/codingWorkspaceStore";

interface QuickFileSearchModalProps {
	projectPath: string;
	onClose: () => void;
}

/** 扁平化文件树为 { name, relativePath } 列表 */
interface FlatFile {
	name: string;
	relativePath: string;
	fullPath: string;
}

function flattenTree(
	nodes: FileTreeNode[],
	projectPath: string,
	prefix = "",
): FlatFile[] {
	const result: FlatFile[] = [];
	for (const node of nodes) {
		const relativePath = prefix ? `${prefix}/${node.name}` : node.name;
		if (node.type === "file") {
			result.push({
				name: node.name,
				relativePath,
				fullPath: projectPath ? `${projectPath}/${relativePath}` : node.path,
			});
		}
		if (node.children?.length) {
			result.push(...flattenTree(node.children, projectPath, relativePath));
		}
	}
	return result;
}

/**
 * 模糊匹配得分（越低越好），-1 表示不匹配
 * 支持连续子串和首字母缩写匹配（如 "cws" 匹配 "CodingWorkspace.tsx"）
 */
function fuzzyScore(query: string, target: string): number {
	const q = query.toLowerCase();
	const t = target.toLowerCase();

	// 精确子串 → 最优
	const idx = t.indexOf(q);
	if (idx !== -1) return idx;

	// 模糊字符顺序匹配
	let qi = 0;
	let score = 0;
	let lastPos = -1;
	for (let ti = 0; ti < t.length && qi < q.length; ti++) {
		if (t[ti] === q[qi]) {
			if (lastPos !== -1) score += ti - lastPos - 1; // 间距越大分数越高（越差）
			// 单词边界加分（更好）：驼峰 / 分隔符后
			if (ti > 0 && /[/\\._\-]/.test(t[ti - 1])) {
				score -= 1;
			} else if (
				ti > 0 &&
				t[ti - 1] === t[ti - 1].toLowerCase() &&
				target[ti] === target[ti].toUpperCase()
			) {
				score -= 1; // 驼峰边界
			}
			lastPos = ti;
			qi++;
		}
	}
	if (qi !== q.length) return -1;
	return 100 + score;
}

interface ScoredFile {
	file: FlatFile;
	score: number;
}

function QuickFileSearchModalInner({
	projectPath,
	onClose,
}: QuickFileSearchModalProps) {
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const fileTree = useCodingWorkspaceSelector((s) => s.fileTree);

	// 扁平化文件列表
	const allFiles = useMemo(
		() => flattenTree(fileTree, projectPath),
		[fileTree, projectPath],
	);

	// 过滤 + 排序
	const filteredFiles = useMemo<ScoredFile[]>(() => {
		const trimmed = query.trim();
		if (!trimmed) {
			return allFiles.slice(0, 50).map((f) => ({ file: f, score: 0 }));
		}

		const scored: ScoredFile[] = [];
		for (const file of allFiles) {
			// 同时匹配文件名和路径，取最优
			const nameScore = fuzzyScore(trimmed, file.name);
			const pathScore = fuzzyScore(trimmed, file.relativePath);
			const best =
				nameScore === -1 && pathScore === -1
					? -1
					: nameScore === -1
						? pathScore
						: pathScore === -1
							? nameScore
							: Math.min(nameScore, pathScore);

			if (best !== -1) {
				scored.push({ file, score: best });
			}
		}

		scored.sort((a, b) => a.score - b.score);
		return scored.slice(0, 50);
	}, [query, allFiles]);

	// 选中索引边界修正
	useEffect(() => {
		setSelectedIndex(0);
	}, [query]);

	// 自动聚焦输入框
	useEffect(() => {
		requestAnimationFrame(() => inputRef.current?.focus());
	}, []);

	// 选中项滚动到可见区域
	useEffect(() => {
		const listEl = listRef.current;
		if (!listEl) return;
		const selected = listEl.children[selectedIndex] as HTMLElement | undefined;
		selected?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	// 打开文件
	const openFile = useCallback(
		(file: FlatFile) => {
			codingWorkspaceStore.openCenterTab(file.fullPath);
			onClose();
		},
		[onClose],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case "Escape":
					e.preventDefault();
					onClose();
					break;
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((i) => Math.min(i + 1, filteredFiles.length - 1));
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((i) => Math.max(i - 1, 0));
					break;
				case "Enter":
					e.preventDefault();
					if (filteredFiles[selectedIndex]) {
						openFile(filteredFiles[selectedIndex].file);
					}
					break;
			}
		},
		[filteredFiles, selectedIndex, onClose, openFile],
	);

	return (
		<div
			className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			{/* 背景遮罩 */}
			<div
				className="absolute inset-0 bg-black/20 dark:bg-black/40"
				onClick={onClose}
			/>

			{/* 搜索面板 */}
			<div className="relative w-full max-w-[560px] max-h-[60vh] bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl border border-zinc-200/80 dark:border-zinc-700/60 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
				{/* 搜索输入 */}
				<div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
					<Search className="w-4 h-4 text-zinc-400 shrink-0" />
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="输入文件名搜索..."
						className="flex-1 bg-transparent text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none"
						spellCheck={false}
						autoComplete="off"
					/>
					{query && (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					)}
					<span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">
						{filteredFiles.length} 个文件
					</span>
				</div>

				{/* 搜索结果 */}
				<div ref={listRef} className="flex-1 overflow-y-auto py-1">
					{filteredFiles.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-10 text-center">
							<FileCode2 className="mb-2 h-6 w-6 text-zinc-300 dark:text-zinc-600" />
							<div className="text-xs text-zinc-400">
								{query.trim() ? "没有匹配的文件" : "项目中暂无文件"}
							</div>
						</div>
					) : (
						filteredFiles.map(({ file }, index) => (
							<FileResultRow
								key={file.relativePath}
								file={file}
								selected={index === selectedIndex}
								onClick={() => openFile(file)}
								onMouseEnter={() => setSelectedIndex(index)}
							/>
						))
					)}
				</div>

				{/* 底部提示 */}
				<div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-4">
					<span className="flex items-center gap-1 text-[10px] text-zinc-400">
						<kbd className="rounded border border-zinc-200 px-1 py-0.5 font-mono text-[9px] dark:border-zinc-700">
							↑↓
						</kbd>
						导航
					</span>
					<span className="flex items-center gap-1 text-[10px] text-zinc-400">
						<kbd className="rounded border border-zinc-200 px-1 py-0.5 font-mono text-[9px] dark:border-zinc-700">
							↵
						</kbd>
						打开
					</span>
					<span className="flex items-center gap-1 text-[10px] text-zinc-400">
						<kbd className="rounded border border-zinc-200 px-1 py-0.5 font-mono text-[9px] dark:border-zinc-700">
							esc
						</kbd>
						关闭
					</span>
				</div>
			</div>
		</div>
	);
}

/** 单个文件结果项 */
const FileResultRow = memo(function FileResultRow({
	file,
	selected,
	onClick,
	onMouseEnter,
}: {
	file: FlatFile;
	selected: boolean;
	onClick: () => void;
	onMouseEnter: () => void;
}) {
	const ext = file.name.includes(".")
		? file.name.split(".").pop()?.toLowerCase() || ""
		: "";
	const dirPath = file.relativePath.includes("/")
		? file.relativePath.slice(0, file.relativePath.lastIndexOf("/"))
		: "";

	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={onMouseEnter}
			className={`w-full flex items-center gap-2.5 px-4 py-1.5 text-left transition-colors ${
				selected
					? "bg-[#D96C46]/8 dark:bg-[#D96C46]/10"
					: "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
			}`}
		>
			<FileCode2 className={`h-4 w-4 shrink-0 ${getFileIconColor(ext)}`} />
			<div className="min-w-0 flex-1 flex items-baseline gap-2">
				<span
					className={`truncate text-[13px] ${
						selected
							? "font-medium text-[#D96C46]"
							: "text-zinc-700 dark:text-zinc-300"
					}`}
				>
					{file.name}
				</span>
				{dirPath && (
					<span className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">
						{dirPath}
					</span>
				)}
			</div>
			{ext && (
				<span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
					{ext}
				</span>
			)}
		</button>
	);
});

/** 文件类型图标颜色 */
function getFileIconColor(ext: string): string {
	switch (ext) {
		case "ts":
		case "tsx":
			return "text-blue-500";
		case "js":
		case "jsx":
			return "text-yellow-500";
		case "css":
		case "scss":
		case "less":
			return "text-purple-500";
		case "html":
			return "text-orange-500";
		case "json":
			return "text-green-500";
		case "md":
		case "mdx":
			return "text-zinc-500";
		case "py":
			return "text-emerald-500";
		case "rs":
			return "text-red-500";
		case "go":
			return "text-cyan-500";
		case "vue":
			return "text-green-600";
		case "svelte":
			return "text-orange-600";
		default:
			return "text-zinc-400";
	}
}

export const QuickFileSearchModal = memo(QuickFileSearchModalInner);
