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
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { cn } from "../../lib/utils";
import type { EditorDensity } from "./useEditorUiPrefs";

interface EditorWorkspaceViewProps {
	editorMode: "edit" | "preview" | "split";
	selectedTitle: string;
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

const PreviewMarkdownContent = memo(function PreviewMarkdownContent({
	content,
	className,
}: {
	content: string;
	className: string;
}) {
	return <MarkdownRenderer content={content} className={className} />;
});

const EditorPreviewPane = memo(function EditorPreviewPane({
	title,
	content,
	className,
	emptyText,
}: {
	title: string;
	content: string;
	className: string;
	emptyText: string;
}) {
	return (
		<>
			<h1 className="text-[34px] leading-tight font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-5">
				{title || "无标题"}
			</h1>
			<article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-p:text-zinc-700 dark:prose-p:text-zinc-300 prose-p:leading-[1.75] prose-li:text-zinc-700 dark:prose-li:text-zinc-300 prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100">
				{content ? (
					<PreviewMarkdownContent content={content} className={className} />
				) : (
					<p className="text-zinc-600 dark:text-zinc-300">{emptyText}</p>
				)}
			</article>
		</>
	);
});

export function EditorWorkspaceView({
	editorMode,
	selectedTitle,
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
}: EditorWorkspaceViewProps) {
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
	const isCompact = density === "compact";
	const maxWidthSplit = isCompact ? "max-w-3xl" : "max-w-2xl";
	const maxWidthSingle = isCompact ? "max-w-5xl" : "max-w-4xl";
	const textClass = isCompact
		? "text-[14px] leading-[1.65]"
		: "text-base leading-[1.75]";

	const titleInputClass =
		"focus-ring w-full border-none bg-transparent p-0 tracking-tight font-semibold text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-500 dark:placeholder:text-zinc-400";
	const editorTextClass =
		"text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 caret-zinc-800 dark:caret-zinc-200";

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

	if (editorMode === "split") {
		return (
			<div className="flex h-full">
				<section
					ref={editContainerRef}
					className="flex-1 min-w-0 overflow-y-auto scrollbar-hide border-r border-zinc-200/70 dark:border-zinc-800/70 bg-white/70 dark:bg-zinc-950/45"
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
							style={{ boxShadow: "none" }}
						/>
						<textarea
							{...textareaProps}
							onScroll={onTextareaScroll}
							className={cn(textareaProps.className, "font-mono")}
							placeholder="开始写作 Markdown..."
						/>
					</div>
				</section>

				<section
					ref={previewContainerRef}
					onScroll={onPreviewScroll}
					onContextMenu={onPreviewContextMenu}
					className="flex-1 min-w-0 overflow-y-auto scrollbar-hide bg-zinc-50/80 dark:bg-zinc-900/60"
					aria-label="预览区域"
				>
					<div
						className={cn(maxWidthSplit, "mx-auto px-5 py-6 sm:px-6 sm:py-7")}
					>
						<EditorPreviewPane
							title={selectedTitle}
							content={previewContent}
							className={textClass}
							emptyText="在左侧输入 Markdown 内容，这里会实时预览。"
						/>
					</div>
				</section>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto scrollbar-hide bg-white/72 dark:bg-zinc-950/35">
			<div className={cn(maxWidthSingle, "mx-auto px-6 py-7 sm:px-8 sm:py-8")}>
				<input
					type="text"
					value={selectedTitle}
					onChange={(e) => onTitleChange(e.target.value)}
					onBlur={onEditorBlur}
					className={cn(titleInputClass, "text-[40px] leading-tight mb-7")}
					placeholder="无标题"
					style={{ boxShadow: "none" }}
					readOnly={editorMode === "preview"}
				/>

				{editorMode === "preview" ? (
					<article
						onContextMenu={onPreviewContextMenu}
						className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-p:text-zinc-700 dark:prose-p:text-zinc-300 prose-p:leading-[1.75] prose-li:text-zinc-700 dark:prose-li:text-zinc-300 prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100"
					>
						<PreviewMarkdownContent
							content={previewContent}
							className={textClass}
						/>
					</article>
				) : (
					<textarea {...textareaProps} placeholder="开始写作..." />
				)}
			</div>
		</div>
	);
}
