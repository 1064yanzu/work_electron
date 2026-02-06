import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import type { MouseEvent, RefObject } from "react";
import type { EditorDensity } from "./useEditorUiPrefs";

interface EditorWorkspaceViewProps {
	editorMode: "edit" | "preview" | "split";
	selectedTitle: string;
	editorContent: string;
	onTitleChange: (title: string) => void;
	onContentChange: (content: string) => void;
	onTextareaScroll: () => void;
	onPreviewScroll: () => void;
	onTextareaContextMenu: (e: MouseEvent<HTMLTextAreaElement>) => void;
	onPreviewContextMenu: (e: MouseEvent) => void;
	textareaRef: RefObject<HTMLTextAreaElement>;
	editContainerRef: RefObject<HTMLDivElement>;
	previewContainerRef: RefObject<HTMLDivElement>;
	density: EditorDensity;
}

export function EditorWorkspaceView({
	editorMode,
	selectedTitle,
	editorContent,
	onTitleChange,
	onContentChange,
	onTextareaScroll,
	onPreviewScroll,
	onTextareaContextMenu,
	onPreviewContextMenu,
	textareaRef,
	editContainerRef,
	previewContainerRef,
	density,
}: EditorWorkspaceViewProps) {
	const isCompact = density === "compact";
	const maxWidthSplit = isCompact ? "max-w-3xl" : "max-w-2xl";
	const maxWidthSingle = isCompact ? "max-w-5xl" : "max-w-4xl";
	const textClass = isCompact
		? "text-[13px] leading-[1.6]"
		: "text-base leading-relaxed";

	if (editorMode === "split") {
		return (
			<div className="flex h-full">
				<div
					ref={editContainerRef}
					className="flex-1 overflow-y-auto scrollbar-hide border-r border-zinc-100 dark:border-zinc-800"
				>
					<div className={`${maxWidthSplit} mx-auto px-6 py-6`}>
						<input
							type="text"
							value={selectedTitle}
							onChange={(e) => onTitleChange(e.target.value)}
							className="w-full text-2xl font-semibold text-zinc-800 dark:text-zinc-50 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 border-none focus:ring-0 focus:outline-none bg-transparent p-0 mb-4 leading-tight selection:bg-amber-100 dark:selection:bg-amber-900/30"
							placeholder="无标题"
							style={{ boxShadow: "none" }}
						/>
						<textarea
							ref={textareaRef}
							value={editorContent}
							onChange={(e) => onContentChange(e.target.value)}
							onScroll={onTextareaScroll}
							onContextMenu={onTextareaContextMenu}
							className={`w-full min-h-[calc(100vh-200px)] resize-none border-none outline-none focus:ring-0 focus:outline-none p-0 bg-transparent ${textClass} text-zinc-600 dark:text-zinc-400 selection:bg-amber-100 dark:selection:bg-amber-900/30 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 caret-zinc-700 dark:caret-zinc-300 font-mono`}
							placeholder="开始写作 Markdown..."
							style={{ boxShadow: "none" }}
						/>
					</div>
				</div>

				<div
					ref={previewContainerRef}
					onScroll={onPreviewScroll}
					onContextMenu={onPreviewContextMenu}
					className="flex-1 overflow-y-auto scrollbar-hide bg-zinc-50/50 dark:bg-zinc-900/50"
				>
					<div className={`${maxWidthSplit} mx-auto px-6 py-6`}>
						<h1 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-50 mb-4 leading-tight">
							{selectedTitle || "无标题"}
						</h1>
						<article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-p:text-zinc-600 dark:prose-p:text-zinc-400 prose-sm">
							{editorContent ? (
								<MarkdownRenderer
									content={editorContent}
									className="text-sm leading-relaxed"
								/>
							) : (
								<p className="text-zinc-400 italic">
									在左侧输入 Markdown 内容，这里会实时预览...
								</p>
							)}
						</article>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto scrollbar-hide">
			<div className={`${maxWidthSingle} mx-auto px-8 py-6`}>
				<input
					type="text"
					value={selectedTitle}
					onChange={(e) => onTitleChange(e.target.value)}
					className="w-full text-3xl font-semibold text-zinc-800 dark:text-zinc-50 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 border-none focus:ring-0 focus:outline-none bg-transparent p-0 mb-6 leading-tight selection:bg-amber-100 dark:selection:bg-amber-900/30"
					placeholder="无标题"
					style={{ boxShadow: "none" }}
					readOnly={editorMode === "preview"}
				/>

				{editorMode === "preview" ? (
					<article
						onContextMenu={onPreviewContextMenu}
						className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-p:text-zinc-600 dark:prose-p:text-zinc-400"
					>
						<MarkdownRenderer content={editorContent} className={textClass} />
					</article>
				) : (
					<textarea
						ref={textareaRef}
						value={editorContent}
						onChange={(e) => onContentChange(e.target.value)}
						onContextMenu={onTextareaContextMenu}
						className={`w-full min-h-[calc(100vh-200px)] resize-none border-none outline-none focus:ring-0 focus:outline-none p-0 bg-transparent ${textClass} text-zinc-600 dark:text-zinc-400 selection:bg-amber-100 dark:selection:bg-amber-900/30 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 caret-zinc-700 dark:caret-zinc-300`}
						placeholder="开始写作..."
						style={{ boxShadow: "none" }}
					/>
				)}
			</div>
		</div>
	);
}
