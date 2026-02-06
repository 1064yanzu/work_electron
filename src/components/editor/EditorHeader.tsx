import {
	Bold,
	Check,
	ChevronLeft,
	Code,
	Columns,
	Copy,
	Download,
	Edit3,
	Eye,
	Heading1,
	Italic,
	LayoutGrid,
	Link,
	List,
	Loader2,
	MoreHorizontal,
	Quote,
	Save,
	Sparkles,
	Trash2,
	ZoomIn,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import type { EditorDensity } from "./useEditorUiPrefs";

interface EditorHeaderProps {
	editorMode: "edit" | "preview" | "split";
	onSetEditorMode: (mode: "edit" | "preview" | "split") => void;
	onBackToList: () => void;
	onInsertMarkdown: (prefix: string, suffix?: string) => void;
	onAiPolish: () => void;
	onSave: () => void;
	onCopy: () => void;
	onExport: () => void;
	onDelete: () => void;
	selectedOutput: boolean;
	isSaving: boolean;
	hasUnsavedChanges: boolean;
	lastSavedLabel: string;
	focusMode: boolean;
	onToggleFocusMode: () => void;
	density: EditorDensity;
	onToggleDensity: () => void;
}

export function EditorHeader({
	editorMode,
	onSetEditorMode,
	onBackToList,
	onInsertMarkdown,
	onAiPolish,
	onSave,
	onCopy,
	onExport,
	onDelete,
	selectedOutput,
	isSaving,
	hasUnsavedChanges,
	lastSavedLabel,
	focusMode,
	onToggleFocusMode,
	density,
	onToggleDensity,
}: EditorHeaderProps) {
	const [showMoreMenu, setShowMoreMenu] = useState(false);

	return (
		<header className="flex items-center justify-between px-4 py-3 border-b border-black/[0.03] dark:border-white/[0.05] bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm shrink-0 z-40 relative">
			<div className="flex items-center gap-2 w-1/4">
				<button
					onClick={onBackToList}
					className="p-2 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
					title="返回列表"
				>
					<ChevronLeft className="w-5 h-5" />
				</button>
			</div>

			<div className="flex items-center justify-center flex-1 overflow-x-auto scrollbar-hide">
				{editorMode !== "preview" && !focusMode ? (
					<div className="flex items-center gap-0.5 px-2 py-1 bg-zinc-100/50 dark:bg-zinc-800/50 rounded-lg">
						<button
							onClick={() => onInsertMarkdown("**", "**")}
							className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
							title="粗体"
						>
							<Bold className="w-3.5 h-3.5" />
						</button>
						<button
							onClick={() => onInsertMarkdown("*", "*")}
							className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
							title="斜体"
						>
							<Italic className="w-3.5 h-3.5" />
						</button>

						<div className="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

						<button
							onClick={() => onInsertMarkdown("# ")}
							className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
							title="标题"
						>
							<Heading1 className="w-3.5 h-3.5" />
						</button>
						<button
							onClick={() => onInsertMarkdown("- ")}
							className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
							title="列表"
						>
							<List className="w-3.5 h-3.5" />
						</button>
						<button
							onClick={() => onInsertMarkdown("> ")}
							className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
							title="引用"
						>
							<Quote className="w-3.5 h-3.5" />
						</button>

						<div className="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

						<button
							onClick={() => onInsertMarkdown("[", "](" + "url" + ")")}
							className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
							title="链接"
						>
							<Link className="w-3.5 h-3.5" />
						</button>
						<button
							onClick={() => onInsertMarkdown("```\n", "\n```")}
							className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
							title="代码"
						>
							<Code className="w-3.5 h-3.5" />
						</button>

						<div className="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

						<button
							onClick={onAiPolish}
							className="p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-all"
							title="AI 润色"
						>
							<Sparkles className="w-3.5 h-3.5" />
						</button>
					</div>
				) : null}
			</div>

			<div className="flex items-center justify-end gap-1 shrink-0">
				<div className="flex items-center bg-zinc-100/50 dark:bg-zinc-800/50 rounded-md p-0.5">
					<button
						onClick={() => onSetEditorMode("edit")}
						className={cn(
							"p-1 rounded transition-all",
							editorMode === "edit"
								? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300",
						)}
						title="编辑"
					>
						<Edit3 className="w-3.5 h-3.5" />
					</button>
					<button
						onClick={() => onSetEditorMode("split")}
						className={cn(
							"p-1 rounded transition-all",
							editorMode === "split"
								? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300",
						)}
						title="分屏"
					>
						<Columns className="w-3.5 h-3.5" />
					</button>
					<button
						onClick={() => onSetEditorMode("preview")}
						className={cn(
							"p-1 rounded transition-all",
							editorMode === "preview"
								? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300",
						)}
						title="预览"
					>
						<Eye className="w-3.5 h-3.5" />
					</button>
				</div>

				<div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-700" />

				<button
					onClick={onToggleFocusMode}
					className={cn(
						"p-1.5 rounded transition-colors",
						focusMode
							? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
							: "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800",
					)}
					title={focusMode ? "退出专注模式" : "专注模式"}
				>
					<ZoomIn className="w-3.5 h-3.5" />
				</button>
				<button
					onClick={onToggleDensity}
					className={cn(
						"p-1.5 rounded transition-colors",
						density === "compact"
							? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
							: "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800",
					)}
					title={density === "compact" ? "切换舒适密度" : "切换紧凑密度"}
				>
					<LayoutGrid className="w-3.5 h-3.5" />
				</button>

				<div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-700" />

				<button
					onClick={onSave}
					disabled={!selectedOutput || isSaving || !hasUnsavedChanges}
					className={cn(
						"flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed",
						hasUnsavedChanges
							? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200"
							: "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
						isSaving && "pointer-events-none",
					)}
					title={
						isSaving
							? "正在保存到本地数据库"
							: hasUnsavedChanges
								? "保存当前更改"
								: lastSavedLabel
									? `所有更改已保存 · ${lastSavedLabel}`
									: "所有更改已保存"
					}
				>
					{isSaving ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : hasUnsavedChanges ? (
						<Save className="w-3.5 h-3.5" />
					) : (
						<Check className="w-3.5 h-3.5" />
					)}
					<span>
						{isSaving ? "保存中…" : hasUnsavedChanges ? "保存" : "已保存"}
					</span>
				</button>

				<div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-700" />

				<button
					onClick={onCopy}
					className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
					title="复制"
				>
					<Copy className="w-3.5 h-3.5" />
				</button>

				<div className="relative">
					<button
						onClick={() => setShowMoreMenu(!showMoreMenu)}
						className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
						title="更多操作"
					>
						<MoreHorizontal className="w-4 h-4" />
					</button>
					{showMoreMenu ? (
						<>
							<div
								className="fixed inset-0 z-40"
								onClick={() => setShowMoreMenu(false)}
							/>
							<div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 py-2 z-50">
								<button
									onClick={() => {
										onExport();
										setShowMoreMenu(false);
									}}
									className="w-full px-4 py-2 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center gap-2"
								>
									<Download className="w-4 h-4" />
									导出 Markdown
								</button>
								<div className="my-1 border-t border-zinc-100 dark:border-zinc-700/50" />
								<button
									onClick={() => {
										onDelete();
										setShowMoreMenu(false);
									}}
									className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
								>
									<Trash2 className="w-4 h-4" />
									删除文档
								</button>
							</div>
						</>
					) : null}
				</div>
			</div>
		</header>
	);
}
