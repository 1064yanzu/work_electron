/**
 * 编辑器标签栏
 * 管理多文件标签页的切换和关闭，支持 dirty 标记和文件类型图标
 */

import { FileCode, FileJson, FileText, Image, Table, X } from "lucide-react";
import { memo, useCallback } from "react";
import { cn } from "../../../lib/utils";

// ==================== 文件类型图标映射 ====================

const CODE_EXTENSIONS = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"py",
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
	"rb",
	"php",
	"sh",
	"bash",
	"zsh",
	"sql",
	"vue",
	"svelte",
]);

const STYLE_EXTENSIONS = new Set(["css", "scss", "less", "sass"]);

const DATA_EXTENSIONS = new Set([
	"json",
	"jsonc",
	"yaml",
	"yml",
	"toml",
	"xml",
	"csv",
]);

const DOC_EXTENSIONS = new Set(["md", "markdown", "txt", "rtf"]);

function getTabIcon(extension: string) {
	const ext = extension.toLowerCase().replace(/^\./, "");
	if (CODE_EXTENSIONS.has(ext) || STYLE_EXTENSIONS.has(ext))
		return <FileCode className="w-3 h-3" />;
	if (DATA_EXTENSIONS.has(ext)) return <FileJson className="w-3 h-3" />;
	if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext))
		return <Image className="w-3 h-3" />;
	if (["xlsx", "xls", "csv"].includes(ext))
		return <Table className="w-3 h-3" />;
	if (DOC_EXTENSIONS.has(ext)) return <FileText className="w-3 h-3" />;
	if (ext === "html" || ext === "htm") return <FileCode className="w-3 h-3" />;
	return <FileText className="w-3 h-3" />;
}

// ==================== 类型 ====================

interface EditorTabItem {
	id: string;
	name: string;
	dirty: boolean;
	extension: string;
}

interface EditorTabsProps {
	/** 标签页列表 */
	tabs: EditorTabItem[];
	/** 当前活跃标签页 ID */
	activeTabId: string | null;
	/** 选择标签页回调 */
	onSelect: (tabId: string) => void;
	/** 关闭标签页回调 */
	onClose: (tabId: string) => void;
	/** 关闭其他标签页回调 */
	onCloseOthers?: (tabId: string) => void;
	/** 关闭所有标签页回调 */
	onCloseAll?: () => void;
}

// ==================== 单个标签页 ====================

interface TabButtonProps {
	tab: EditorTabItem;
	isActive: boolean;
	onSelect: (tabId: string) => void;
	onClose: (e: React.MouseEvent, tabId: string) => void;
}

const TabButton = memo(function TabButton({
	tab,
	isActive,
	onSelect,
	onClose,
}: TabButtonProps) {
	return (
		<button
			type="button"
			onClick={() => onSelect(tab.id)}
			className={cn(
				"group relative flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 text-[12px] font-medium rounded-md transition-colors cursor-pointer shrink-0 max-w-[160px]",
				isActive
					? "bg-surface text-text-primary shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
					: "text-text-muted hover:bg-surface/60 hover:text-text-secondary",
			)}
			title={tab.name}
		>
			{/* 文件类型图标 */}
			<span
				className={cn(
					"shrink-0",
					isActive ? "text-text-secondary" : "text-text-light",
				)}
			>
				{getTabIcon(tab.extension)}
			</span>

			{/* dirty 标记 */}
			{tab.dirty ? (
				<span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
			) : null}

			{/* 文件名 */}
			<span className="truncate">{tab.name}</span>

			{/* 关闭按钮 */}
			<button
				type="button"
				onClick={(e) => onClose(e, tab.id)}
				className={cn(
					"ml-0.5 p-0.5 rounded transition-all shrink-0 cursor-pointer",
					isActive
						? "opacity-60 hover:opacity-100 hover:bg-warm-200 dark:hover:bg-cream-700"
						: "opacity-0 group-hover:opacity-100 hover:bg-warm-300 dark:hover:bg-cream-700",
				)}
				aria-label={`关闭 ${tab.name}`}
			>
				<X className="w-3 h-3" />
			</button>

			{/* 活跃指示条 */}
			{isActive ? (
				<span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
			) : null}
		</button>
	);
});

// ==================== EditorTabs ====================

export const EditorTabs = memo(function EditorTabs({
	tabs,
	activeTabId,
	onSelect,
	onClose,
}: EditorTabsProps) {
	const handleClose = useCallback(
		(e: React.MouseEvent, tabId: string) => {
			e.stopPropagation();
			onClose(tabId);
		},
		[onClose],
	);

	if (tabs.length === 0) return null;

	return (
		<div className="flex items-center h-9 bg-warm-50/80 dark:bg-cream-900/80 border-b border-border px-1 gap-0.5 overflow-x-auto scrollbar-thin">
			{tabs.map((tab) => (
				<TabButton
					key={tab.id}
					tab={tab}
					isActive={tab.id === activeTabId}
					onSelect={onSelect}
					onClose={handleClose}
				/>
			))}
		</div>
	);
});
