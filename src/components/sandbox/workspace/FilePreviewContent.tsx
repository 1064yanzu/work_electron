import {
	BookOpen,
	Check,
	Copy,
	Download,
	Eye,
	FileCode2,
	FolderOpen,
	Link2,
	Package,
	Save,
	Terminal as TerminalIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { SandboxFile } from "../../../lib/managedModeStore";
import { managedModeStore } from "../../../lib/managedModeStore";
import {
	sandboxEditorStore,
	useSandboxEditorStoreSelector,
} from "../../../lib/sandboxEditorStore";
import { cn } from "../../../lib/utils";
import { convertFileSrc } from "../../../lib/tauriCompat";
import { isHtmlPreviewExtension } from "../../../lib/frontendPreview";
import { isReaderSupportedFile } from "../../../lib/reader/formats";
import { readerImportFiles } from "../../../lib/api/reader";
import { openReader } from "../../reader/ReaderApp";
import { toast } from "../../ui/Toast";
import { MarkdownRenderer } from "../../ui/MarkdownRenderer";
import DocumentViewer from "../../ui/DocumentViewer";
import {
	isAudioPreviewExtension,
	isVideoPreviewExtension,
	SandboxAudioPreview,
	SandboxVideoPreview,
} from "./SandboxMediaPreview";
import { SandboxImagePreview } from "./SandboxImagePreview";
import { BrowserShell } from "../preview/BrowserShell";
import { MonacoEditor, getMonacoLanguage } from "./MonacoEditor";
import {
	usePreviewServerStoreSelector,
	previewServerStore,
} from "../../../lib/previewServerStore";

interface FilePreviewContentProps {
	file: SandboxFile | null;
	taskId?: string;
	sandboxDir?: string;
	previewMode: "preview" | "source";
	onSetPreviewMode: (mode: "preview" | "source") => void;
	onLoadContent: (fileId: string) => Promise<void>;
	onRevealFile: (file: SandboxFile) => Promise<void> | void;
	emptyTitle?: string;
	emptyDescription?: string;
}

export const FilePreviewContent = memo(function FilePreviewContent({
	file,
	taskId,
	sandboxDir,
	previewMode,
	onSetPreviewMode,
	onLoadContent,
	onRevealFile,
	emptyTitle = "选择文件预览",
	emptyDescription = "点击左侧文件查看内容",
}: FilePreviewContentProps) {
	const [copiedAction, setCopiedAction] = useState<"" | "content" | "path">("");
	const [isSaving, setIsSaving] = useState(false);

	const previewServer = usePreviewServerStoreSelector((state) =>
		taskId ? state.servers[taskId] : undefined,
	);

	// 当前文件在 sandboxEditorStore 中的 tab（如有）
	const editorTab = useSandboxEditorStoreSelector((s) =>
		file ? s.openTabs.find((t) => t.id === file.id) || null : null,
	);

	// source 模式优先使用 editorTab 的内容（含未保存修改），fallback 到 file.content
	const sourceContent = editorTab?.content ?? file?.content ?? "";
	const sourceDirty = editorTab?.dirty ?? false;

	// 自动启动预览服务器（如果需要）
	// 注意：useEffect 依赖中包含 previewServer 整体，
	// 但启动失败（previewServer.error 存在）时不再重试，避免死循环。
	useEffect(() => {
		if (!taskId || !sandboxDir) return;
		if (previewServer?.running) return;
		if (previewServer?.error) return; // 已经失败过，不再无限重试

		// 触发条件：当前文件是 HTML 或 package.json，认为用户期望预览前端工程
		const hasPackageJson = file?.name === "package.json";
		const isHtmlFile = file && isHtmlPreviewExtension(file.extension);

		if (hasPackageJson || isHtmlFile) {
			// 不传 mode，让主进程根据沙盒内容自动探测
			// （单 HTML → single 模式立即可预览；含 dev script → dev 模式启动子进程）
			previewServerStore.start(taskId, sandboxDir);
		}
	}, [taskId, sandboxDir, file, previewServer?.running, previewServer?.error]);

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

	const [isOpeningReader, setIsOpeningReader] = useState(false);
	const canOpenInReader = file
		? isReaderSupportedFile(file.name) && Boolean(file.path)
		: false;

	const handleOpenInReader = useCallback(async () => {
		if (!file?.path) return;
		setIsOpeningReader(true);
		try {
			const books = await readerImportFiles({ paths: [file.path] });
			const book = books[0];
			if (!book) {
				toast.error("无法解析该文件，请确认格式与编码");
				return;
			}
			openReader(book.id);
		} catch (e) {
			console.error("Failed to open in reader:", file.path, e);
			toast.error("打开阅读器失败");
		} finally {
			setIsOpeningReader(false);
		}
	}, [file]);

	const handleMonacoChange = useCallback(
		(value: string | undefined) => {
			if (!file || value === undefined) return;
			sandboxEditorStore.updateContent(file.id, value);
		},
		[file],
	);

	const handleSave = useCallback(async () => {
		if (!file) return;
		const tab = sandboxEditorStore
			.getState()
			.openTabs.find((t) => t.id === file.id);
		if (!tab) {
			toast.info("当前文件未打开为可编辑标签页");
			return;
		}
		if (!tab.dirty) return;
		setIsSaving(true);
		try {
			const ok = await sandboxEditorStore.saveTab(file.id);
			if (ok) {
				// 把最新内容回写 managedModeStore，避免下次加载又取磁盘旧值
				managedModeStore.updateFile(file.id, {
					content: tab.content,
				});
				toast.success(`${file.name} 已保存`);
			} else {
				toast.error("保存失败");
			}
		} finally {
			setIsSaving(false);
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

	const renderSource = () => {
		if (!file) return null;
		const language = getMonacoLanguage(file.extension);
		return (
			<div className="flex-1 min-h-0 bg-surface">
				<MonacoEditor
					value={sourceContent}
					language={language}
					onChange={handleMonacoChange}
					onSave={handleSave}
					readOnly={!editorTab}
				/>
			</div>
		);
	};

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
			// 优先级 1：如果预览服务器已 ready，使用 BrowserShell
			if (previewServer?.ready && previewServer?.url) {
				return (
					<BrowserShell
						src={previewServer.url}
						taskId={taskId}
						className="flex-1"
					/>
				);
			}

			// 优先级 2：dev 模式启动中（需要等待子进程编译）
			// single / static 模式应当立即 ready，不应进入此分支
			// 失败（有 error）时不卡 loading，直接 fallback 到 srcDoc
			if (
				taskId &&
				sandboxDir &&
				previewServer?.running &&
				!previewServer?.ready &&
				!previewServer?.error &&
				previewServer?.mode === "dev"
			) {
				return (
					<div className="flex-1 relative bg-gradient-to-b from-cream-100 to-cream-200/40 dark:from-cream-900 dark:to-cream-950">
						<div className="absolute inset-0 flex flex-col items-center justify-center px-8">
							<div className="relative w-16 h-16 mb-5">
								<div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cream-200 to-cream-300 dark:from-cream-700 dark:to-cream-800 shadow-[inset_0_1px_2px_rgba(255,255,255,0.6),0_2px_8px_rgba(26,26,25,0.04)]" />
								<div className="absolute inset-0 flex items-center justify-center">
									<Package
										className="w-7 h-7 text-[#D96C46]"
										strokeWidth={1.5}
									/>
								</div>
								{/* 呼吸光环 */}
								<div className="absolute -inset-1.5 rounded-full border border-[#D96C46]/30 animate-pulse-slow" />
								<div className="absolute -inset-3 rounded-full border border-[#D96C46]/15 animate-pulse-slow" />
							</div>
							<h3 className="text-base font-semibold text-text-primary mb-1.5">
								正在启动开发服务器
							</h3>
							<p className="text-xs text-text-secondary leading-relaxed text-center max-w-sm mb-5">
								Vite / Next 等工程在首次启动时需要安装依赖与编译。
								<br />
								通常需要几秒到一分钟，请稍候...
							</p>
							{/* 进度条 */}
							<div className="w-56 h-1 rounded-full bg-cream-200 dark:bg-cream-800 overflow-hidden mb-3">
								<div className="h-full w-1/3 bg-gradient-to-r from-[#D96C46] via-[#E8A77A] to-[#D96C46] rounded-full animate-swarm-indeterminate" />
							</div>
							<div className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
								<TerminalIcon className="w-3 h-3" strokeWidth={1.5} />
								<span className="font-mono">npm run dev</span>
								{previewServer?.port ? (
									<>
										<span className="text-text-light">·</span>
										<span className="font-mono tabular-nums">
											:{previewServer.port}
										</span>
									</>
								) : null}
							</div>
						</div>
					</div>
				);
			}

			// 优先级 3：单 HTML / 启动失败 → fallback 到 srcDoc，复用 BrowserShell 保证视觉统一
			if (!file.content) {
				return (
					<BrowserShell taskId={taskId} title={file.name} className="flex-1" />
				);
			}
			return (
				<BrowserShell
					srcDoc={file.content}
					taskId={taskId}
					title={file.name}
					className="flex-1"
				/>
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
					{sourceDirty ? (
						<span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md">
							<span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
							未保存
						</span>
					) : null}
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
					{effectiveMode === "source" && editorTab ? (
						<button
							type="button"
							onClick={handleSave}
							disabled={!sourceDirty || isSaving}
							className={cn(
								"px-3 py-2 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl transition-all focus-ring active:scale-95 text-xs font-medium",
								sourceDirty
									? "bg-primary text-white hover:bg-primary/90 shadow-sm"
									: "text-text-muted hover:bg-warm-200",
								(!sourceDirty || isSaving) &&
									"opacity-60 cursor-not-allowed hover:bg-transparent",
							)}
							title="保存 (Cmd+S)"
							aria-label="保存"
						>
							<Save className="w-3.5 h-3.5" />
							{isSaving ? "保存中" : "保存"}
						</button>
					) : null}
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
					{canOpenInReader ? (
						<button
							type="button"
							onClick={handleOpenInReader}
							disabled={isOpeningReader}
							className={cn(
								"p-2.5 min-h-11 min-w-11 inline-flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-xl transition-all focus-ring active:scale-95",
								isOpeningReader && "opacity-60 cursor-wait",
							)}
							title="在阅读器中打开"
							aria-label="在阅读器中打开"
						>
							<BookOpen className="w-4 h-4" />
						</button>
					) : null}
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
