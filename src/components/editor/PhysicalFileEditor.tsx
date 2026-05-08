import {
	AlignLeft,
	Check,
	Copy,
	Eye,
	FileCode2,
	FileText,
	FolderOpen,
	Link2,
	Minimize2,
	RefreshCw,
	Save,
	Search,
	WrapText,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	IframePreview,
	type IframePreviewHandle,
} from "../sandbox/preview/IframePreview";
import {
	MonacoEditor,
	type MonacoCursorPosition,
	type MonacoEditorHandle,
	getMonacoLanguage,
} from "../sandbox/workspace/MonacoEditor";
import { safeInvoke } from "../../lib/tauriBridge";
import { cn } from "../../lib/utils";

interface PhysicalFileEditorProps {
	fileName: string;
	filePath?: string;
	content: string;
	dirty: boolean;
	isSaving: boolean;
	onContentChange: (content: string) => void;
	onSave: () => Promise<void> | void;
	onContextMenu?: (e: React.MouseEvent) => void;
}

const HTML_EXT_RE = /\.(html?|xhtml)$/i;

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toMonacoPath(filePath?: string): string | undefined {
	if (!filePath) return undefined;
	const normalized = filePath.replace(/\\/g, "/");
	return normalized.startsWith("file://")
		? normalized
		: `file://${encodeURI(normalized)}`;
}

export const PhysicalFileEditor = memo(function PhysicalFileEditor({
	fileName,
	filePath,
	content,
	dirty,
	isSaving,
	onContentChange,
	onSave,
	onContextMenu,
}: PhysicalFileEditorProps) {
	const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
	const [copiedAction, setCopiedAction] = useState<"" | "content" | "path">("");
	const [wordWrap, setWordWrap] = useState(false);
	const [minimap, setMinimap] = useState(true);
	const [cursorPosition, setCursorPosition] = useState<MonacoCursorPosition>({
		lineNumber: 1,
		column: 1,
	});
	const iframeRef = useRef<IframePreviewHandle>(null);
	const editorRef = useRef<MonacoEditorHandle>(null);

	const ext = useMemo(() => {
		const idx = fileName.lastIndexOf(".");
		return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : "";
	}, [fileName]);

	const isHtmlFile = HTML_EXT_RE.test(fileName);
	const language = useMemo(() => getMonacoLanguage(ext), [ext]);
	const isEmptyFile = content.length === 0;
	const lineCount = useMemo(
		() => content.split(/\r\n|\r|\n/).length,
		[content],
	);
	const byteLength = useMemo(
		() => new TextEncoder().encode(content).length,
		[content],
	);
	const monacoPath = useMemo(() => toMonacoPath(filePath), [filePath]);

	useEffect(() => {
		setViewMode("edit");
		setCursorPosition({ lineNumber: 1, column: 1 });
	}, [filePath]);

	useEffect(() => {
		if (!copiedAction) return;
		const t = setTimeout(() => setCopiedAction(""), 1200);
		return () => clearTimeout(t);
	}, [copiedAction]);

	const onSaveRef = useRef(onSave);
	useEffect(() => {
		onSaveRef.current = onSave;
	}, [onSave]);

	const handleMonacoChange = useCallback(
		(value: string | undefined) => {
			if (value === undefined) return;
			onContentChange(value);
		},
		[onContentChange],
	);

	const handleSave = useCallback(async () => {
		try {
			await onSaveRef.current();
		} catch (err) {
			console.error("[PhysicalFileEditor] save failed", err);
		}
	}, []);

	const handleCopy = useCallback(async () => {
		if (!content) return;
		await navigator.clipboard.writeText(content);
		setCopiedAction("content");
	}, [content]);

	const handleCopyPath = useCallback(async () => {
		if (!filePath) return;
		await navigator.clipboard.writeText(filePath);
		setCopiedAction("path");
	}, [filePath]);

	const handleReveal = useCallback(() => {
		if (!filePath) return;
		void safeInvoke("reveal_file_safe", { path: filePath });
	}, [filePath]);

	const handleRefreshPreview = useCallback(() => {
		iframeRef.current?.refresh();
	}, []);

	const handleFind = useCallback(() => {
		setViewMode("edit");
		requestAnimationFrame(() => {
			editorRef.current?.runAction("actions.find");
		});
	}, []);

	const handleFormat = useCallback(() => {
		setViewMode("edit");
		requestAnimationFrame(() => {
			editorRef.current?.formatDocument();
		});
	}, []);

	const fileExtensionLabel = ext.toUpperCase() || "FILE";
	const showPreviewToggle = isHtmlFile;

	return (
		<div
			className="flex-1 flex flex-col h-full bg-surface"
			onContextMenu={onContextMenu}
		>
			<div className="flex items-center justify-between gap-2 flex-wrap px-4 py-2 border-b border-border bg-warm-50/95 dark:bg-cream-900/80">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-sm font-medium text-text-secondary truncate">
						{fileName}
					</span>
					<span className="text-xs text-text-muted bg-warm-200 px-1.5 py-0.5 rounded">
						{fileExtensionLabel}
					</span>
					{dirty ? (
						<span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md">
							<span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
							未保存
						</span>
					) : null}
				</div>
				<div className="flex items-center gap-1 flex-wrap justify-end">
					{showPreviewToggle ? (
						<div className="flex items-center bg-warm-200 rounded-lg p-0.5 mr-2">
							<button
								type="button"
								onClick={() => setViewMode("edit")}
								className={cn(
									"px-3 py-1.5 min-h-9 text-xs font-medium rounded-md transition-all inline-flex items-center gap-1.5 focus-ring",
									viewMode === "edit"
										? "bg-surface dark:bg-cream-700 text-text-primary shadow-sm"
										: "text-text-secondary hover:text-text-primary dark:hover:text-zinc-200 hover:bg-warm-300/50 dark:hover:bg-cream-700/50",
								)}
								aria-label="切换到源码模式"
							>
								<FileCode2 className="w-3.5 h-3.5" />
								源码
							</button>
							<button
								type="button"
								onClick={() => setViewMode("preview")}
								className={cn(
									"px-3 py-1.5 min-h-9 text-xs font-medium rounded-md transition-all inline-flex items-center gap-1.5 focus-ring",
									viewMode === "preview"
										? "bg-surface dark:bg-cream-700 text-text-primary shadow-sm"
										: "text-text-secondary hover:text-text-primary dark:hover:text-zinc-200 hover:bg-warm-300/50 dark:hover:bg-cream-700/50",
								)}
								aria-label="切换到预览模式"
							>
								<Eye className="w-3.5 h-3.5" />
								预览
							</button>
						</div>
					) : null}

					<button
						type="button"
						onClick={handleFind}
						className="p-2.5 min-h-10 min-w-10 inline-flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-all focus-ring active:scale-95"
						title="查找 (⌘F)"
						aria-label="查找"
					>
						<Search className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={handleFormat}
						className="p-2.5 min-h-10 min-w-10 inline-flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-all focus-ring active:scale-95"
						title="格式化文档"
						aria-label="格式化文档"
					>
						<AlignLeft className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={() => setWordWrap((prev) => !prev)}
						className={cn(
							"p-2.5 min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg transition-all focus-ring active:scale-95",
							wordWrap
								? "text-primary bg-primary/10"
								: "text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200",
						)}
						title={wordWrap ? "关闭自动换行" : "开启自动换行"}
						aria-label={wordWrap ? "关闭自动换行" : "开启自动换行"}
					>
						<WrapText className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={() => setMinimap((prev) => !prev)}
						className={cn(
							"p-2.5 min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg transition-all focus-ring active:scale-95",
							minimap
								? "text-primary bg-primary/10"
								: "text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200",
						)}
						title={minimap ? "隐藏迷你地图" : "显示迷你地图"}
						aria-label={minimap ? "隐藏迷你地图" : "显示迷你地图"}
					>
						<Minimize2 className="w-4 h-4" />
					</button>

					{viewMode === "preview" && showPreviewToggle ? (
						<button
							type="button"
							onClick={handleRefreshPreview}
							className="p-2.5 min-h-10 min-w-10 inline-flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-all focus-ring active:scale-95"
							title="刷新预览"
							aria-label="刷新预览"
						>
							<RefreshCw className="w-4 h-4" />
						</button>
					) : null}

					<button
						type="button"
						onClick={handleSave}
						disabled={!dirty || isSaving}
						className={cn(
							"px-3 py-2 min-h-10 inline-flex items-center justify-center gap-1.5 rounded-lg transition-all focus-ring active:scale-95 text-xs font-medium",
							dirty
								? "bg-primary text-white hover:bg-primary/90 shadow-sm"
								: "text-text-muted hover:bg-warm-200",
							(!dirty || isSaving) &&
								"opacity-60 cursor-not-allowed hover:bg-transparent",
						)}
						title="保存 (⌘S)"
						aria-label="保存"
					>
						<Save className="w-3.5 h-3.5" />
						{isSaving ? "保存中" : "保存"}
					</button>
					<button
						type="button"
						onClick={handleCopy}
						disabled={!content}
						className={cn(
							"p-2.5 min-h-10 min-w-10 inline-flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-all focus-ring active:scale-95",
							!content && "opacity-45 cursor-not-allowed hover:bg-transparent",
						)}
						title="复制全部内容"
						aria-label="复制内容"
					>
						{copiedAction === "content" ? (
							<Check className="w-4 h-4" />
						) : (
							<Copy className="w-4 h-4" />
						)}
					</button>
					<button
						type="button"
						onClick={handleCopyPath}
						disabled={!filePath}
						className={cn(
							"p-2.5 min-h-10 min-w-10 inline-flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-all focus-ring active:scale-95",
							!filePath && "opacity-45 cursor-not-allowed hover:bg-transparent",
						)}
						title="复制路径"
						aria-label="复制路径"
					>
						{copiedAction === "path" ? (
							<Check className="w-4 h-4" />
						) : (
							<Link2 className="w-4 h-4" />
						)}
					</button>
					<button
						type="button"
						onClick={handleReveal}
						disabled={!filePath}
						className={cn(
							"p-2.5 min-h-10 min-w-10 inline-flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-all focus-ring active:scale-95",
							!filePath && "opacity-45 cursor-not-allowed hover:bg-transparent",
						)}
						title="在访达/文件管理器中显示"
						aria-label="在访达或文件管理器中显示"
					>
						<FolderOpen className="w-4 h-4" />
					</button>
				</div>
			</div>

			<div className="flex-1 min-h-0 bg-surface relative">
				{viewMode === "preview" && showPreviewToggle ? (
					<IframePreview
						ref={iframeRef}
						srcDoc={content || "<!doctype html><html><body></body></html>"}
						className="h-full"
						showEmptyOverlay={false}
					/>
				) : (
					<>
						<MonacoEditor
							key={filePath ?? fileName}
							ref={editorRef}
							value={content}
							language={language}
							path={monacoPath}
							onChange={handleMonacoChange}
							onSave={handleSave}
							onCursorPositionChange={setCursorPosition}
							wordWrap={wordWrap}
							minimap={minimap}
						/>
						{isEmptyFile ? (
							<div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-24">
								<div className="pointer-events-none flex flex-col items-center gap-2 text-center px-6">
									<FileText
										className="w-8 h-8 text-text-light/60"
										aria-hidden="true"
									/>
									<p className="text-sm text-text-muted font-medium">
										此文件为空
									</p>
									<p className="text-xs text-text-light max-w-xs leading-relaxed">
										直接开始输入，按 ⌘S 保存即可写入磁盘
									</p>
								</div>
							</div>
						) : null}
					</>
				)}
			</div>
			<div className="h-7 shrink-0 border-t border-border/70 bg-warm-50/95 dark:bg-cream-900/80 px-3 flex items-center justify-between gap-3 text-[11px] text-text-light">
				<div className="flex items-center gap-3 min-w-0">
					<span className="truncate">{filePath || fileName}</span>
					{dirty ? (
						<span className="text-amber-700 dark:text-amber-300">未保存</span>
					) : (
						<span>已同步</span>
					)}
				</div>
				<div className="flex items-center gap-3 shrink-0">
					<span>
						行 {cursorPosition.lineNumber}, 列 {cursorPosition.column}
					</span>
					<span>{lineCount} 行</span>
					<span>{formatBytes(byteLength)}</span>
					<span>Spaces: 2</span>
					<span>UTF-8</span>
					<span>{fileExtensionLabel}</span>
				</div>
			</div>
		</div>
	);
});
