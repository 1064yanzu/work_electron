import {
	Check,
	Copy,
	Download,
	Eye,
	FileCode2,
	FolderOpen,
	Link2,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { SandboxFile } from "../../../lib/managedModeStore";
import { cn } from "../../../lib/utils";
import { convertFileSrc } from "../../../lib/tauriCompat";
import { isHtmlPreviewExtension } from "../../../lib/frontendPreview";
import { MarkdownRenderer } from "../../ui/MarkdownRenderer";
import DocumentViewer from "../../ui/DocumentViewer";
import {
	isAudioPreviewExtension,
	isVideoPreviewExtension,
	SandboxAudioPreview,
	SandboxVideoPreview,
} from "./SandboxMediaPreview";
import { SandboxImagePreview } from "./SandboxImagePreview";

interface FilePreviewContentProps {
	file: SandboxFile | null;
	previewMode: "preview" | "source";
	onSetPreviewMode: (mode: "preview" | "source") => void;
	onLoadContent: (fileId: string) => Promise<void>;
	onRevealFile: (file: SandboxFile) => Promise<void> | void;
	emptyTitle?: string;
	emptyDescription?: string;
}

export const FilePreviewContent = memo(function FilePreviewContent({
	file,
	previewMode,
	onSetPreviewMode,
	onLoadContent,
	onRevealFile,
	emptyTitle = "选择文件预览",
	emptyDescription = "点击左侧文件查看内容",
}: FilePreviewContentProps) {
	const [copiedAction, setCopiedAction] = useState<"" | "content" | "path">("");

	const isImage = file?.category === "images";
	const isVideo = file ? isVideoPreviewExtension(file.extension) : false;
	const isAudio = file ? isAudioPreviewExtension(file.extension) : false;
	const isDocument = file?.extension === "pdf" || file?.extension === "docx";
	const canPreviewWithoutText =
		Boolean(isImage) || isVideo || isAudio || Boolean(isDocument);

	useEffect(() => {
		if (file && file.content === undefined && !canPreviewWithoutText) {
			onLoadContent(file.id);
		}
	}, [canPreviewWithoutText, file, onLoadContent]);

	useEffect(() => {
		if (!copiedAction) return;
		const t = setTimeout(() => setCopiedAction(""), 1200);
		return () => clearTimeout(t);
	}, [copiedAction]);

	const handleCopy = useCallback(async () => {
		if (file?.content) {
			await navigator.clipboard.writeText(file.content);
			setCopiedAction("content");
		}
	}, [file]);

	const handleCopyPath = useCallback(async () => {
		if (!file?.path) return;
		await navigator.clipboard.writeText(file.path);
		setCopiedAction("path");
	}, [file]);

	const handleRevealFile = useCallback(() => {
		if (!file) return;
		return onRevealFile(file);
	}, [file, onRevealFile]);

	const handleDownload = useCallback(() => {
		if (!file) return;
		const a = document.createElement("a");
		a.download = file.name;
		const url = file.content
			? URL.createObjectURL(new Blob([file.content], { type: file.mimeType }))
			: convertFileSrc(file.path);
		a.href = url;
		a.click();
		if (file.content) {
			URL.revokeObjectURL(url);
		}
	}, [file]);

	// useMemo must be called before any early returns to satisfy React Hooks rules
	const copiedLabel = useMemo(
		() =>
			copiedAction === "content"
				? "内容已复制"
				: copiedAction === "path"
					? "路径已复制"
					: "",
		[copiedAction],
	);

	if (!file) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-900/80">
				<div className="text-center space-y-4">
					{/* 装饰性图标 */}
					<div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700 flex items-center justify-center shadow-inner">
						<Eye className="w-7 h-7 text-text-light" />
					</div>
					<h3 className="text-lg font-semibold text-text-primary dark:text-zinc-200">
						{emptyTitle}
					</h3>
					<p className="text-sm text-text-muted max-w-xs mx-auto leading-relaxed">
						{emptyDescription}
					</p>
				</div>
			</div>
		);
	}

	const isHtmlLike = isHtmlPreviewExtension(file.extension);
	const isMarkdown = file.extension === "md" || file.extension === "markdown";
	const previewAvailable =
		isImage ||
		isVideo ||
		isAudio ||
		isHtmlLike ||
		isMarkdown ||
		isDocument ||
		file.content !== undefined;
	const isLoadingContent = !canPreviewWithoutText && file.content === undefined;

	const renderSource = () => (
		<div className="flex-1 overflow-auto bg-dark-muted dark:bg-black">
			<div className="flex items-center gap-2 px-4 py-2 border-b border-dark-border bg-dark-surface sticky top-0">
				<div className="flex gap-1.5">
					<span className="w-3 h-3 rounded-full bg-error/70" />
					<span className="w-3 h-3 rounded-full bg-yellow-500/70" />
					<span className="w-3 h-3 rounded-full bg-green-500/70" />
				</div>
				<span className="text-xs text-text-light font-mono ml-2">
					{file.name}
				</span>
			</div>
			<div className="p-4 font-mono text-[13px] leading-relaxed text-zinc-200">
				{(file.content || "").split("\n").map((line, index) => (
					<div
						key={`${file.id}-line-${index + 1}`}
						className="grid grid-cols-[3rem_minmax(0,1fr)] group hover:bg-dark-surface/50 -mx-4 px-4 transition-colors"
					>
						<span
							className="select-none text-right pr-3 text-text-muted group-hover:text-text-light cursor-pointer transition-colors"
							title={`第 ${index + 1} 行`}
						>
							{index + 1}
						</span>
						<span className="whitespace-pre-wrap break-words">
							{line || " "}
						</span>
					</div>
				))}
			</div>
		</div>
	);

	const renderPreview = () => {
		if (isImage) {
			return (
				<SandboxImagePreview
					filePath={file.path}
					fileName={file.name}
					fileSize={file.size}
				/>
			);
		}

		if (isVideo) {
			return (
				<SandboxVideoPreview
					filePath={file.path}
					fileName={file.name}
					mimeType={file.mimeType}
				/>
			);
		}

		if (isAudio) {
			return (
				<SandboxAudioPreview
					filePath={file.path}
					fileName={file.name}
					mimeType={file.mimeType}
				/>
			);
		}

		if (isHtmlLike) {
			if (!file.content) {
				return (
					<div className="flex-1 flex items-center justify-center text-sm text-text-muted bg-surface">
						预览内容为空，已自动回退到源码模式
					</div>
				);
			}
			return (
				<div className="flex-1 bg-surface">
					<iframe
						srcDoc={file.content}
						className="w-full h-full border-0"
						title="文件预览"
						sandbox="allow-scripts"
					/>
				</div>
			);
		}

		if (isMarkdown) {
			return (
				<div className="flex-1 overflow-auto bg-surface px-8 py-6">
					<article className="max-w-3xl mx-auto prose prose-zinc dark:prose-invert">
						<MarkdownRenderer
							content={file.content || ""}
							className="text-sm leading-relaxed"
						/>
					</article>
				</div>
			);
		}

		if (isDocument) {
			return (
				<div className="flex-1 min-h-0 p-4 bg-warm-50">
					<DocumentViewer
						src={file.path}
						type={file.extension as "pdf" | "docx"}
						className="h-full min-h-0 rounded-xl overflow-hidden"
					/>
				</div>
			);
		}

		return renderSource();
	};

	const effectiveMode =
		previewMode === "preview" && !previewAvailable ? "source" : previewMode;
	const isFallbackToSource =
		previewMode === "preview" && effectiveMode === "source";
	const canCopyContent = Boolean(file.content);
	const canDownload = Boolean(file.path || file.content);
	const fileExtensionLabel = file.extension.toUpperCase() || "FILE";

	return (
		<div className="flex-1 flex flex-col h-full bg-surface">
			<div className="flex items-center justify-between gap-2 flex-wrap px-4 py-2 border-b border-border bg-warm-50">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-sm font-medium text-text-secondary truncate">
						{file.name}
					</span>
					<span className="text-xs text-text-muted bg-warm-200 px-1.5 py-0.5 rounded">
						{fileExtensionLabel}
					</span>
				</div>
				<div className="flex items-center gap-1 flex-wrap justify-end">
					{copiedLabel ? (
						<span
							className="mr-2 inline-flex items-center px-2 py-1 rounded-md text-[11px] bg-success/8 text-success dark:bg-emerald-900/20 dark:text-success"
							aria-live="polite"
						>
							{copiedLabel}
						</span>
					) : null}
					{isFallbackToSource ? (
						<span className="mr-2 inline-flex items-center px-2 py-1 rounded-md text-[11px] bg-peach-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
							预览不可用，已降级源码
						</span>
					) : null}
					<div className="flex items-center bg-warm-200 rounded-lg p-0.5 mr-2">
						<button
							type="button"
							onClick={() => onSetPreviewMode("preview")}
							className={cn(
								"px-3 py-1.5 min-h-9 text-xs font-medium rounded-lg transition-all inline-flex items-center gap-1.5 focus-ring",
								effectiveMode === "preview"
									? "bg-surface dark:bg-cream-700 text-text-primary shadow-sm"
									: "text-text-secondary hover:text-text-primary dark:hover:text-zinc-200 hover:bg-warm-300/50 dark:hover:bg-cream-700/50",
							)}
							aria-label="切换到预览模式"
						>
							<Eye className="w-3.5 h-3.5" />
							预览
						</button>
						<button
							type="button"
							onClick={() => onSetPreviewMode("source")}
							className={cn(
								"px-3 py-1.5 min-h-9 text-xs font-medium rounded-lg transition-all inline-flex items-center gap-1.5 focus-ring",
								effectiveMode === "source"
									? "bg-surface dark:bg-cream-700 text-text-primary shadow-sm"
									: "text-text-secondary hover:text-text-primary dark:hover:text-zinc-200 hover:bg-warm-300/50 dark:hover:bg-cream-700/50",
							)}
							aria-label="切换到源码模式"
						>
							<FileCode2 className="w-3.5 h-3.5" />
							源码
						</button>
					</div>
					{/* 分隔线 */}
					<div className="h-6 w-px bg-warm-300 dark:bg-cream-700 mx-1" />
					<button
						type="button"
						onClick={handleCopy}
						disabled={!canCopyContent}
						className={cn(
							"p-2.5 min-h-11 min-w-11 inline-flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-xl transition-all focus-ring active:scale-95",
							!canCopyContent &&
								"opacity-45 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent hover:text-text-muted",
						)}
						title="复制内容 (⌘C)"
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
						className="p-2.5 min-h-11 min-w-11 inline-flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-xl transition-all focus-ring active:scale-95"
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
						onClick={handleRevealFile}
						className="p-2.5 min-h-11 min-w-11 inline-flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-xl transition-all focus-ring active:scale-95"
						title="在访达/文件管理器中显示"
						aria-label="在访达或文件管理器中显示"
					>
						<FolderOpen className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={handleDownload}
						disabled={!canDownload}
						className={cn(
							"p-2.5 min-h-11 min-w-11 inline-flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-xl transition-all focus-ring active:scale-95",
							!canDownload &&
								"opacity-45 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent hover:text-text-muted",
						)}
						title="下载文件 (⌘D)"
						aria-label="下载文件"
					>
						<Download className="w-4 h-4" />
					</button>
				</div>
			</div>
			{isLoadingContent ? (
				<div className="flex-1 p-6 bg-surface">
					<div className="max-w-4xl mx-auto space-y-4">
						{/* 标题骨架 */}
						<div className="h-8 w-2/5 rounded-lg skeleton" />
						{/* 段落骨架 */}
						<div className="space-y-2.5 pt-2">
							<div className="h-4 w-full rounded skeleton" />
							<div className="h-4 w-[95%] rounded skeleton" />
							<div className="h-4 w-[88%] rounded skeleton" />
						</div>
						{/* 第二段 */}
						<div className="space-y-2.5 pt-3">
							<div className="h-4 w-full rounded skeleton" />
							<div className="h-4 w-[92%] rounded skeleton" />
							<div className="h-4 w-3/4 rounded skeleton" />
						</div>
					</div>
				</div>
			) : effectiveMode === "preview" ? (
				renderPreview()
			) : (
				renderSource()
			)}
		</div>
	);
});
