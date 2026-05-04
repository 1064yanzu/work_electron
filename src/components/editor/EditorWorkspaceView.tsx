import {
	memo,
	type ChangeEvent,
	type MouseEvent,
	type RefObject,
	useDeferredValue,
	useEffect,
	useMemo,
	useState,
} from "react";
import { cn } from "../../lib/utils";
import type { EditorDensity } from "./useEditorUiPrefs";
import {
	FileTypePreview,
	isMarkdownPreviewFile,
	isBinaryPreviewFile,
} from "./FileTypePreview";

interface EditorWorkspaceViewProps {
	editorMode: "edit" | "preview" | "split";
	selectedTitle: string;
	previewFileName: string;
	titleEditable: boolean;
	editorContent: string;
	onTitleChange: (title: string) => void;
	onContentChange: (content: string) => void;
	onEditorBlur: () => void;
	onTextareaScroll: () => void;
	onPreviewScroll: () => void;
	onTextareaContextMenu: (e: MouseEvent<HTMLTextAreaElement>) => void;
	onPreviewContextMenu: (e: MouseEvent) => void;
	textareaRef: RefObject<HTMLTextAreaElement>;
	editContainerRef: RefObject<HTMLDivElement>;
	previewContainerRef: RefObject<HTMLDivElement>;
	density: EditorDensity;
	filePath?: string;
}

function useThrottledPreview(value: string, delayMs: number) {
	const [throttled, setThrottled] = useState(value);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setThrottled(value);
		}, delayMs);
		return () => window.clearTimeout(timer);
	}, [value, delayMs]);

	return throttled;
}

const EditorPreviewPane = memo(function EditorPreviewPane({
	title,
	fileName,
	content,
	density,
	emptyText,
	filePath,
}: {
	title: string;
	fileName: string;
	content: string;
	density: EditorDensity;
	emptyText: string;
	filePath?: string;
}) {
	const isMarkdownPreview = isMarkdownPreviewFile(fileName);

	return (
		<>
			{isMarkdownPreview ? (
				<h1 className="text-[34px] leading-tight font-semibold tracking-tight text-text-primary mb-5">
					{title || "无标题"}
				</h1>
			) : null}
			<FileTypePreview
				fileName={fileName}
				content={content}
				density={density}
				emptyText={emptyText}
				filePath={filePath}
			/>
		</>
	);
});

export function EditorWorkspaceView({
	editorMode,
	selectedTitle,
	previewFileName,
	titleEditable,
	editorContent,
	onTitleChange,
	onContentChange,
	onEditorBlur,
	onTextareaScroll,
	onPreviewScroll,
	onTextareaContextMenu,
	onPreviewContextMenu,
	textareaRef,
	editContainerRef,
	previewContainerRef,
	density,
	filePath,
}: EditorWorkspaceViewProps) {
	const isBinaryFile = isBinaryPreviewFile(previewFileName);
	// 二进制文件强制使用 preview 模式
	const effectiveEditorMode = isBinaryFile ? "preview" : editorMode;
	const [isComposing, setIsComposing] = useState(false);
	const [compositionPreviewContent, setCompositionPreviewContent] =
		useState(editorContent);
	const deferredContent = useDeferredValue(editorContent);
	const throttledPreviewContent = useThrottledPreview(deferredContent, 150);

	useEffect(() => {
		if (!isComposing) {
			setCompositionPreviewContent(throttledPreviewContent);
		}
	}, [isComposing, throttledPreviewContent]);

	const previewContent = isComposing
		? compositionPreviewContent
		: throttledPreviewContent;
	const isMarkdownPreview = isMarkdownPreviewFile(previewFileName);
	const editorPlaceholder = isMarkdownPreview
		? "开始写作 Markdown..."
		: "开始编辑文件内容...";
	const splitPreviewEmptyText = isMarkdownPreview
		? "在左侧输入 Markdown 内容，这里会实时预览。"
		: "文件内容为空。";
	const isCompact = density === "compact";
	const maxWidthSplit = isCompact ? "max-w-3xl" : "max-w-2xl";
	const maxWidthSingle = isCompact ? "max-w-5xl" : "max-w-4xl";
	const textClass = isCompact
		? "text-[14px] leading-[1.65]"
		: "text-base leading-[1.75]";

	const titleInputClass =
		"focus-ring w-full border-none bg-transparent p-0 tracking-tight font-semibold text-text-primary dark:text-zinc-50 placeholder:text-text-muted dark:placeholder:text-text-light";
	const editorTextClass =
		"text-text-secondary placeholder:text-text-muted dark:placeholder:text-text-light caret-zinc-800 dark:caret-zinc-200";

	const textareaProps = useMemo(
		() => ({
			ref: textareaRef,
			value: editorContent,
			onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
				onContentChange(event.target.value),
			onBlur: onEditorBlur,
			onCompositionStart: () => setIsComposing(true),
			onCompositionEnd: () => setIsComposing(false),
			onContextMenu: onTextareaContextMenu,
			className: cn(
				"w-full min-h-[calc(100vh-220px)] resize-none border-none outline-none focus:ring-0 focus:outline-none p-0 bg-transparent",
				textClass,
				editorTextClass,
			),
			style: { boxShadow: "none" },
		}),
		[
			editorContent,
			editorTextClass,
			onContentChange,
			onEditorBlur,
			onTextareaContextMenu,
			textareaRef,
			textClass,
		],
	);

	if (effectiveEditorMode === "split") {
		return (
			<div className="flex h-full">
				<section
					ref={editContainerRef}
					className="flex-1 min-w-0 overflow-y-auto scrollbar-hide border-r border-border/70 bg-surface/70/45"
					aria-label="编辑区域"
				>
					<div
						className={cn(maxWidthSplit, "mx-auto px-5 py-6 sm:px-6 sm:py-7")}
					>
						<input
							type="text"
							value={selectedTitle}
							onChange={(e) => onTitleChange(e.target.value)}
							onBlur={onEditorBlur}
							className={cn(titleInputClass, "text-[34px] leading-tight mb-5")}
							placeholder="无标题"
							readOnly={!titleEditable}
							style={{ boxShadow: "none" }}
						/>
						<textarea
							{...textareaProps}
							onScroll={onTextareaScroll}
							className={cn(textareaProps.className, "font-mono")}
							placeholder={editorPlaceholder}
						/>
					</div>
				</section>

				<section
					ref={previewContainerRef}
					onScroll={onPreviewScroll}
					onContextMenu={onPreviewContextMenu}
					className="flex-1 min-w-0 overflow-y-auto scrollbar-hide bg-warm-50/80/60"
					aria-label="预览区域"
				>
					<div
						className={cn(maxWidthSplit, "mx-auto px-5 py-6 sm:px-6 sm:py-7")}
					>
						<EditorPreviewPane
							title={selectedTitle}
							fileName={previewFileName}
							content={previewContent}
							density={density}
							emptyText={splitPreviewEmptyText}
							filePath={filePath}
						/>
					</div>
				</section>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto scrollbar-hide bg-surface/72/35">
			<div className={cn(maxWidthSingle, "mx-auto px-6 py-7 sm:px-8 sm:py-8")}>
				{!isBinaryFile && (
					<input
						type="text"
						value={selectedTitle}
						onChange={(e) => onTitleChange(e.target.value)}
						onBlur={onEditorBlur}
						className={cn(
							titleInputClass,
							isMarkdownPreview
								? "text-[40px] leading-tight mb-7"
								: "text-[18px] leading-tight mb-4 font-medium text-text-secondary",
						)}
						placeholder="无标题"
						style={{ boxShadow: "none" }}
						readOnly={effectiveEditorMode === "preview" || !titleEditable}
					/>
				)}

				{effectiveEditorMode === "preview" ? (
					<div onContextMenu={onPreviewContextMenu} className="max-w-none">
						<FileTypePreview
							fileName={previewFileName}
							content={previewContent}
							density={density}
							emptyText="文件内容为空。"
							filePath={filePath}
						/>
					</div>
				) : !isMarkdownPreview && filePath ? (
					<div onContextMenu={onPreviewContextMenu} className="max-w-none">
						<FileTypePreview
							fileName={previewFileName}
							content={editorContent}
							density={density}
							emptyText="文件内容为空。"
							filePath={filePath}
						/>
					</div>
				) : (
					<textarea {...textareaProps} placeholder="开始写作..." />
				)}
			</div>
		</div>
	);
}
