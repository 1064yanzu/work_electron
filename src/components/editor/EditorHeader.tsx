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
	Quote,
	Save,
	PenLine,
	Trash2,
	ZoomIn,
} from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { EditorDensity } from "./useEditorUiPrefs";
import { Tooltip } from "../ui/Tooltip";

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
	canSave: boolean;
	selectedOutput: boolean;
	isSaving: boolean;
	hasUnsavedChanges: boolean;
	lastSavedLabel: string;
	focusMode: boolean;
	onToggleFocusMode: () => void;
	density: EditorDensity;
	onToggleDensity: () => void;
	showFormattingTools?: boolean;
}

interface IconBtnProps {
	label: string;
	onClick: () => void;
	icon: ReactNode;
	active?: boolean;
	disabled?: boolean;
}

function IconBtn({ label, onClick, icon, active, disabled }: IconBtnProps) {
	return (
		<Tooltip content={label}>
			<button
				type="button"
				onClick={onClick}
				disabled={disabled}
				aria-label={label}
				className={cn(
					"focus-ring h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg transition-colors",
					active
						? "bg-primary/12 dark:bg-primary/20 text-primary"
						: "text-text-secondary hover:text-text-primary hover:bg-warm-200",
					disabled && "opacity-50 cursor-not-allowed",
				)}
			>
				{icon}
			</button>
		</Tooltip>
	);
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
	canSave,
	selectedOutput,
	isSaving,
	hasUnsavedChanges,
	lastSavedLabel,
	focusMode,
	onToggleFocusMode,
	density,
	onToggleDensity,
	showFormattingTools = true,
}: EditorHeaderProps) {
	const saveLabel = isSaving
		? "保存中…"
		: hasUnsavedChanges
			? "待保存"
			: lastSavedLabel
				? `已保存 · ${lastSavedLabel}`
				: "已保存";

	return (
		<header className="doc-toolbar shrink-0 border-b border-border/70 px-2 py-2 sm:px-3 flex items-center gap-1.5 sm:gap-2 relative z-30 overflow-x-auto">
			<div className="flex items-center gap-1.5 shrink-0">
				<IconBtn
					label="返回文档列表"
					onClick={onBackToList}
					icon={<ChevronLeft className="w-5 h-5" />}
				/>

				<div className="hidden sm:inline-flex items-center rounded-xl border border-border bg-surface/90/80 p-0.5">
					<button
						type="button"
						onClick={() => onSetEditorMode("edit")}
						className={cn(
							"focus-ring min-h-10 px-3 rounded-lg inline-flex items-center gap-1.5 text-sm font-medium transition-colors",
							editorMode === "edit"
								? "bg-dark-muted text-white"
								: "text-text-secondary dark:text-zinc-200 hover:bg-warm-200",
						)}
					>
						<Edit3 className="w-4 h-4" />
						编辑
					</button>
					<button
						type="button"
						onClick={() => onSetEditorMode("split")}
						className={cn(
							"focus-ring min-h-10 px-3 rounded-lg inline-flex items-center gap-1.5 text-sm font-medium transition-colors",
							editorMode === "split"
								? "bg-dark-muted text-white"
								: "text-text-secondary dark:text-zinc-200 hover:bg-warm-200",
						)}
					>
						<Columns className="w-4 h-4" />
						分屏
					</button>
					<button
						type="button"
						onClick={() => onSetEditorMode("preview")}
						className={cn(
							"focus-ring min-h-10 px-3 rounded-lg inline-flex items-center gap-1.5 text-sm font-medium transition-colors",
							editorMode === "preview"
								? "bg-dark-muted text-white"
								: "text-text-secondary dark:text-zinc-200 hover:bg-warm-200",
						)}
					>
						<Eye className="w-4 h-4" />
						预览
					</button>
				</div>
			</div>

			{/* Spacer */}
			<div className="flex-1 min-w-0" />

			{editorMode !== "preview" && !focusMode && showFormattingTools ? (
				<div className="hidden lg:flex items-center shrink-0 rounded-lg border border-border bg-surface/88/78 p-0.5">
					<IconBtn
						label="粗体"
						onClick={() => onInsertMarkdown("**", "**")}
						icon={<Bold className="w-4 h-4" />}
					/>
					<IconBtn
						label="斜体"
						onClick={() => onInsertMarkdown("*", "*")}
						icon={<Italic className="w-4 h-4" />}
					/>
					<IconBtn
						label="标题"
						onClick={() => onInsertMarkdown("# ")}
						icon={<Heading1 className="w-4 h-4" />}
					/>
					<IconBtn
						label="列表"
						onClick={() => onInsertMarkdown("- ")}
						icon={<List className="w-4 h-4" />}
					/>
					<IconBtn
						label="引用"
						onClick={() => onInsertMarkdown("> ")}
						icon={<Quote className="w-4 h-4" />}
					/>
					<IconBtn
						label="链接"
						onClick={() => onInsertMarkdown("[", "](url)")}
						icon={<Link className="w-4 h-4" />}
					/>
					<IconBtn
						label="代码块"
						onClick={() => onInsertMarkdown("```\n", "\n```")}
						icon={<Code className="w-4 h-4" />}
					/>
					<IconBtn
						label="AI 润色"
						onClick={onAiPolish}
						icon={<PenLine className="w-4 h-4" />}
						active
					/>
				</div>
			) : null}

			<div className="flex items-center gap-1 shrink-0">
				<button
					type="button"
					onClick={onSave}
					disabled={!canSave || isSaving || !hasUnsavedChanges}
					className={cn(
						"focus-ring min-h-11 px-3.5 rounded-xl border inline-flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
						hasUnsavedChanges
							? "bg-primary/12 dark:bg-primary/22 border-primary/35 text-primary"
							: "bg-surface border-border text-text-secondary dark:text-zinc-200",
					)}
					title={saveLabel}
				>
					{isSaving ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : hasUnsavedChanges ? (
						<Save className="w-4 h-4" />
					) : (
						<Check className="w-4 h-4" />
					)}
					<span className="hidden xl:inline truncate">{saveLabel}</span>
				</button>

				<IconBtn
					label={focusMode ? "退出专注模式" : "进入专注模式"}
					onClick={onToggleFocusMode}
					icon={<ZoomIn className="w-4 h-4" />}
					active={focusMode}
				/>
				<IconBtn
					label={density === "compact" ? "切换为舒适密度" : "切换为紧凑密度"}
					onClick={onToggleDensity}
					icon={<LayoutGrid className="w-4 h-4" />}
					active={density === "compact"}
				/>
				<IconBtn
					label="复制文档内容"
					onClick={onCopy}
					icon={<Copy className="w-4 h-4" />}
					disabled={!selectedOutput}
				/>
				<IconBtn
					label="导出 Markdown"
					onClick={onExport}
					icon={<Download className="w-4 h-4" />}
					disabled={!selectedOutput}
				/>
				<IconBtn
					label="删除文档"
					onClick={onDelete}
					icon={<Trash2 className="w-4 h-4 text-rose-500" />}
					disabled={!selectedOutput}
				/>
			</div>
		</header>
	);
}
