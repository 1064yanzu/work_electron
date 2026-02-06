import { Check, Copy, Download, Eye, FileCode2, Link2 } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import type { SandboxFile } from "../../../lib/managedModeStore";
import { cn } from "../../../lib/utils";
import { SandboxImagePreview } from "./SandboxImagePreview";

interface FilePreviewContentProps {
	file: SandboxFile | null;
	previewMode: "preview" | "source";
	onSetPreviewMode: (mode: "preview" | "source") => void;
	onLoadContent: (fileId: string) => Promise<void>;
	emptyTitle?: string;
	emptyDescription?: string;
}

export const FilePreviewContent = memo(function FilePreviewContent({
	file,
	previewMode,
	onSetPreviewMode,
	onLoadContent,
	emptyTitle = "选择文件预览",
	emptyDescription = "点击左侧文件查看内容",
}: FilePreviewContentProps) {
	const [copiedAction, setCopiedAction] = useState<"" | "content" | "path">("");

	useEffect(() => {
		if (file && file.content === undefined) {
			onLoadContent(file.id);
		}
	}, [file, onLoadContent]);

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

	const handleDownload = useCallback(() => {
		if (!file?.content) return;
		const blob = new Blob([file.content], { type: file.mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = file.name;
		a.click();
		URL.revokeObjectURL(url);
	}, [file]);

	if (!file) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-zinc-900">
				<div className="text-center space-y-2">
					<h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-300">
						{emptyTitle}
					</h3>
					<p className="text-sm text-zinc-400">{emptyDescription}</p>
				</div>
			</div>
		);
	}

	const isImage = file.category === "images";
	const isHtmlLike = ["html", "tsx", "jsx"].includes(file.extension);
	const previewAvailable =
		isImage ||
		isHtmlLike ||
		file.extension === "md" ||
		file.content !== undefined;

	const renderSource = () => (
		<div className="flex-1 overflow-auto bg-zinc-900 dark:bg-black">
			<div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-800 dark:bg-zinc-900 sticky top-0">
				<div className="flex gap-1.5">
					<span className="w-3 h-3 rounded-full bg-red-500/70" />
					<span className="w-3 h-3 rounded-full bg-yellow-500/70" />
					<span className="w-3 h-3 rounded-full bg-green-500/70" />
				</div>
				<span className="text-xs text-zinc-500 font-mono ml-2">
					{file.name}
				</span>
			</div>
			<pre className="p-4 text-[13px] font-mono text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
				{file.content || ""}
			</pre>
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

		if (isHtmlLike) {
			if (!file.content) {
				return (
					<div className="flex-1 flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900">
						预览内容为空，已自动回退到源码模式
					</div>
				);
			}
			return (
				<div className="flex-1 bg-white">
					<iframe
						srcDoc={file.content}
						className="w-full h-full border-0"
						title="文件预览"
						sandbox="allow-scripts"
					/>
				</div>
			);
		}

		if (file.extension === "md") {
			return (
				<div className="flex-1 overflow-auto bg-white dark:bg-zinc-900 px-8 py-6">
					<div className="max-w-3xl mx-auto prose dark:prose-invert prose-zinc">
						<pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
							{file.content}
						</pre>
					</div>
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
	const canDownload = Boolean(file.content);
	const fileExtensionLabel = file.extension.toUpperCase() || "FILE";

	return (
		<div className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-900">
			<div className="flex items-center justify-between gap-2 flex-wrap px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
						{file.name}
					</span>
					<span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
						{fileExtensionLabel}
					</span>
				</div>
				<div className="flex items-center gap-1 flex-wrap justify-end">
					{isFallbackToSource ? (
						<span className="mr-2 inline-flex items-center px-2 py-1 rounded-md text-[11px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
							预览不可用，已降级源码
						</span>
					) : null}
					<div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 mr-2">
						<button
							type="button"
							onClick={() => onSetPreviewMode("preview")}
							className={cn(
								"px-2 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1",
								effectiveMode === "preview"
									? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
									: "text-zinc-500 hover:text-zinc-700",
							)}
						>
							<Eye className="w-3 h-3" />
							预览
						</button>
						<button
							type="button"
							onClick={() => onSetPreviewMode("source")}
							className={cn(
								"px-2 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1",
								effectiveMode === "source"
									? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
									: "text-zinc-500 hover:text-zinc-700",
							)}
						>
							<FileCode2 className="w-3 h-3" />
							源码
						</button>
					</div>
					<button
						type="button"
						onClick={handleCopy}
						disabled={!canCopyContent}
						className={cn(
							"p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors",
							!canCopyContent &&
								"opacity-45 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent hover:text-zinc-400",
						)}
						title="复制"
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
						className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
						title="复制路径"
					>
						{copiedAction === "path" ? (
							<Check className="w-4 h-4" />
						) : (
							<Link2 className="w-4 h-4" />
						)}
					</button>
					<button
						type="button"
						onClick={handleDownload}
						disabled={!canDownload}
						className={cn(
							"p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors",
							!canDownload &&
								"opacity-45 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent hover:text-zinc-400",
						)}
						title="下载"
					>
						<Download className="w-4 h-4" />
					</button>
				</div>
			</div>
			{effectiveMode === "preview" ? renderPreview() : renderSource()}
		</div>
	);
});
