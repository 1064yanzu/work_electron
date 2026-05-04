/**
 * 沙盒文件树侧边栏
 * 按分类分组显示文件列表，支持搜索过滤
 */

import {
	ChevronDown,
	ChevronRight,
	FileCode,
	FileText,
	Image as ImageIcon,
	Search,
	Table,
	X,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import type { SandboxFile } from "../../../lib/managedModeStore";
import { cn } from "../../../lib/utils";

// ==================== 辅助函数 ====================

/** 根据分类获取图标 */
function getCategoryIcon(category: string) {
	switch (category) {
		case "code":
			return <FileCode className="w-3.5 h-3.5" />;
		case "images":
			return <ImageIcon className="w-3.5 h-3.5" />;
		case "data":
			return <Table className="w-3.5 h-3.5" />;
		default:
			return <FileText className="w-3.5 h-3.5" />;
	}
}

// ==================== 分类列表定义 ====================

const CATEGORIES = [
	{ key: "code", title: "代码" },
	{ key: "docs", title: "文档" },
	{ key: "data", title: "数据" },
	{ key: "images", title: "图片" },
	{ key: "other", title: "其他" },
];

// ==================== FileTreeSidebar ====================

interface FileTreeSidebarProps {
	/** 文件列表（仅文件类型） */
	files: SandboxFile[];
	/** 当前选中的文件 ID */
	selectedFileId: string | null;
	/** 搜索关键词 */
	searchQuery: string;
	/** 搜索变更回调 */
	onSearchQueryChange: (query: string) => void;
	/** 选择文件回调 */
	onSelectFile: (file: SandboxFile) => void;
	/** 文件总数 */
	totalFiles: number;
}

export const FileTreeSidebar = memo(function FileTreeSidebar({
	files,
	selectedFileId,
	searchQuery,
	onSearchQueryChange,
	onSelectFile,
	totalFiles,
}: FileTreeSidebarProps) {
	const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
		() => new Set(["code", "docs", "data"]),
	);

	const filteredFiles = useMemo(() => {
		if (!searchQuery.trim()) return files;
		const query = searchQuery.toLowerCase();
		return files.filter(
			(f) =>
				f.name.toLowerCase().includes(query) ||
				f.path.toLowerCase().includes(query),
		);
	}, [files, searchQuery]);

	// 按分类分组
	const grouped = useMemo(() => {
		const groups: Record<string, SandboxFile[]> = {};
		for (const f of filteredFiles) {
			const cat = f.category || "other";
			if (!groups[cat]) groups[cat] = [];
			groups[cat].push(f);
		}
		for (const key of Object.keys(groups)) {
			groups[key].sort((a, b) => a.name.localeCompare(b.name));
		}
		return groups;
	}, [filteredFiles]);

	const toggleCategory = useCallback((key: string) => {
		setExpandedCategories((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const hasSearch = searchQuery.trim().length > 0;

	return (
		<div className="h-full flex flex-col bg-surface">
			{/* 搜索栏 */}
			<div className="border-b border-border p-2.5">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light" />
					<input
						type="text"
						placeholder="搜索文件..."
						value={searchQuery}
						onChange={(e) => onSearchQueryChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") onSearchQueryChange("");
						}}
						className="w-full pl-8 pr-8 py-1.5 text-xs bg-warm-50 border border-border rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 transition-all placeholder:text-text-muted"
						aria-label="搜索文件"
					/>
					{hasSearch ? (
						<button
							type="button"
							onClick={() => onSearchQueryChange("")}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-muted hover:text-text-secondary hover:bg-warm-200 transition-colors"
							title="清空搜索"
							aria-label="清空搜索"
						>
							<X className="w-3 h-3" />
						</button>
					) : null}
				</div>
				<div className="mt-1.5 text-[11px] text-text-light">
					{hasSearch
						? `匹配 ${filteredFiles.length}/${totalFiles}`
						: `共 ${totalFiles} 个文件`}
				</div>
			</div>

			{/* 文件列表 */}
			<div className="flex-1 overflow-y-auto py-1">
				{filteredFiles.length === 0 ? (
					<div className="px-3 py-6 text-center">
						<p className="text-xs text-text-light">
							{hasSearch ? "没有匹配文件" : "暂无文件"}
						</p>
					</div>
				) : (
					CATEGORIES.map((cat) => {
						const catFiles = grouped[cat.key];
						if (!catFiles || catFiles.length === 0) return null;
						const isExpanded = expandedCategories.has(cat.key);

						return (
							<div key={cat.key} className="mb-1">
								<button
									type="button"
									onClick={() => toggleCategory(cat.key)}
									className="flex min-h-[32px] items-center gap-1.5 px-2.5 py-1 w-full text-left focus-ring"
								>
									<span className="text-text-light">
										{isExpanded ? (
											<ChevronDown className="w-3 h-3" />
										) : (
											<ChevronRight className="w-3 h-3" />
										)}
									</span>
									<span className="text-[11px] font-medium tracking-wide text-text-secondary uppercase">
										{cat.title}
									</span>
									<span className="text-[10px] text-text-muted ml-0.5">
										{catFiles.length}
									</span>
								</button>
								{isExpanded && (
									<div className="mt-px">
										{catFiles.map((file) => {
											const isSelected = selectedFileId === file.id;
											return (
												<button
													key={file.id}
													type="button"
													onClick={() => onSelectFile(file)}
													className={cn(
														"w-full min-h-[28px] flex items-center gap-2 px-3 py-1 text-[12px] transition-colors focus-ring",
														isSelected
															? "bg-warm-200 text-text-primary"
															: "text-text-secondary hover:bg-warm-50/50",
													)}
												>
													<span
														className={cn(
															"shrink-0",
															isSelected
																? "text-text-secondary"
																: "text-text-light",
														)}
													>
														{getCategoryIcon(file.category)}
													</span>
													<span className="truncate flex-1 text-left">
														{file.name}
													</span>
													{file.isNew ? (
														<span className="w-1.5 h-1.5 rounded-full bg-focus shrink-0" />
													) : null}
												</button>
											);
										})}
									</div>
								)}
							</div>
						);
					})
				)}
			</div>
		</div>
	);
});
