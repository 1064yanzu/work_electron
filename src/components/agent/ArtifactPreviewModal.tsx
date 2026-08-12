/**
 * ArtifactPreviewModal - 产物预览弹窗
 * 支持多种文件类型的全屏预览
 */
import { Download, FolderOpen, Library, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import type { ArtifactFileType } from "./ArtifactCard";
import { ZoomableImageViewer } from "../ui/ZoomableImageViewer";
import { Tooltip } from "../ui/Tooltip";

export interface ArtifactPreviewModalProps {
	isOpen: boolean;
	onClose: () => void;
	fileName: string;
	filePath: string;
	fileType: ArtifactFileType;
	fileSize: number;
	mimeType?: string;
	onDownload?: () => void;
	onReveal?: () => void;
	onImportToLibrary?: () => void;
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// 工具栏按钮
function ToolbarButton({
	icon: Icon,
	label,
	onClick,
	className,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	onClick?: () => void;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 px-3 py-2 rounded-lg",
				"text-sm font-medium text-text-secondary",
				"hover:bg-warm-200",
				"transition-colors duration-150",
				className,
			)}
		>
			<Icon className="w-4 h-4" />
			<span>{label}</span>
		</button>
	);
}

// 图片预览
function ImagePreview({ filePath }: { filePath: string }) {
	return (
		<ZoomableImageViewer
			src={`file://${filePath}`}
			alt="预览"
			className="bg-warm-50"
		/>
	);
}

// 代码/文本预览
function TextPreview({ filePath }: { filePath: string }) {
	const [content, setContent] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadContent() {
			try {
				setLoading(true);
				// 通过 IPC 读取文件内容
				const result = await window.electronAPI?.invoke("read_file_safe", {
					path: filePath,
					encoding: "utf-8",
				});
				setContent(result?.content || "");
			} catch (err) {
				setError(err instanceof Error ? err.message : "加载失败");
			} finally {
				setLoading(false);
			}
		}
		loadContent();
	}, [filePath]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cream-500" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full text-error">
				{error}
			</div>
		);
	}

	return (
		<div className="h-full overflow-auto p-6">
			<pre className="text-sm font-mono text-text-secondary whitespace-pre-wrap break-words">
				{content}
			</pre>
		</div>
	);
}

// HTML 预览
function HtmlPreview({ filePath }: { filePath: string }) {
	const [srcDoc, setSrcDoc] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				setLoading(true);
				setError(null);
				const result = await window.electronAPI?.invoke("read_file_safe", {
					path: filePath,
					encoding: "utf-8",
				});
				if (cancelled) return;
				setSrcDoc(result?.content || "");
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : "加载失败");
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [filePath]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cream-500" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full text-error">
				{error}
			</div>
		);
	}

	return (
		<iframe
			srcDoc={srcDoc}
			className="w-full h-full border-0 rounded-lg bg-surface"
			title="HTML 预览"
			sandbox="allow-scripts"
		/>
	);
}

// 通用文件信息预览
function GenericPreview({
	fileName,
	fileType,
	fileSize,
	mimeType,
}: {
	fileName: string;
	fileType: string;
	fileSize: number;
	mimeType?: string;
}) {
	return (
		<div className="flex flex-col items-center justify-center h-full gap-4">
			<div className="w-24 h-24 rounded-2xl bg-warm-200 flex items-center justify-center">
				<span className="text-4xl">📄</span>
			</div>
			<div className="text-center">
				<h3 className="text-lg font-semibold text-text-primary dark:text-cream-200">
					{fileName}
				</h3>
				<p className="text-sm text-text-muted mt-1">
					{fileType.toUpperCase()} · {formatFileSize(fileSize)}
					{mimeType && ` · ${mimeType}`}
				</p>
			</div>
			<p className="text-sm text-text-light">
				此文件类型暂不支持预览，请下载后使用其他应用打开
			</p>
		</div>
	);
}

export default function ArtifactPreviewModal({
	isOpen,
	onClose,
	fileName,
	filePath,
	fileType,
	fileSize,
	mimeType,
	onDownload,
	onReveal,
	onImportToLibrary,
}: ArtifactPreviewModalProps) {
	// ESC 键关闭
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		},
		[onClose],
	);

	useEffect(() => {
		if (isOpen) {
			document.addEventListener("keydown", handleKeyDown);
			document.body.style.overflow = "hidden";
		}
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = "";
		};
	}, [isOpen, handleKeyDown]);

	if (!isOpen) return null;

	// 渲染预览内容
	const renderPreview = () => {
		switch (fileType) {
			case "image":
				return <ImagePreview filePath={filePath} />;
			case "text":
			case "code":
				return <TextPreview filePath={filePath} />;
			case "html":
				return <HtmlPreview filePath={filePath} />;
			default:
				return (
					<GenericPreview
						fileName={fileName}
						fileType={fileType}
						fileSize={fileSize}
						mimeType={mimeType}
					/>
				);
		}
	};

	return (
		<div
			className={cn(
				"fixed inset-0 z-50",
				"flex items-center justify-center",
				"bg-black/50 backdrop-blur-sm",
				"animate-in fade-in duration-150",
			)}
			onClick={onClose}
		>
			<div
				className={cn(
					"relative w-[90vw] h-[85vh] max-w-6xl",
					"bg-surface",
					"rounded-3xl shadow-2xl",
					"flex flex-col overflow-hidden",
					"animate-in zoom-in-95 duration-250",
				)}
				onClick={(e) => e.stopPropagation()}
			>
				{/* 顶部工具栏 */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-border">
					<div className="flex items-center gap-3">
						<h2 className="text-lg font-semibold text-text-primary dark:text-cream-200 truncate max-w-md">
							{fileName}
						</h2>
						<span className="px-2 py-0.5 text-xs font-medium rounded-md bg-warm-200 text-text-muted">
							{formatFileSize(fileSize)}
						</span>
					</div>

					<div className="flex items-center gap-1">
						{onDownload && (
							<ToolbarButton
								icon={Download}
								label="下载"
								onClick={onDownload}
							/>
						)}
						{onImportToLibrary && (
							<ToolbarButton
								icon={Library}
								label="存入资料库"
								onClick={onImportToLibrary}
							/>
						)}
						{onReveal && (
							<ToolbarButton
								icon={FolderOpen}
								label="打开文件夹"
								onClick={onReveal}
							/>
						)}
						<Tooltip content="关闭" placement="bottom">
							<button
								type="button"
								onClick={onClose}
								className={cn(
									"ml-2 p-2 rounded-lg",
									"text-text-light hover:text-text-secondary dark:hover:text-text-light",
									"hover:bg-warm-200",
									"transition-colors duration-150",
								)}
							>
								<X className="w-5 h-5" />
							</button>
						</Tooltip>
					</div>
				</div>

				{/* 预览内容区域 */}
				<div className="flex-1 overflow-hidden bg-warm-50">
					{renderPreview()}
				</div>

				{/* 底部状态栏 */}
				<div className="flex items-center justify-between px-6 py-3 border-t border-border text-xs text-text-light">
					<span className="font-mono truncate max-w-xl">{filePath}</span>
					<span>{mimeType || fileType}</span>
				</div>
			</div>
		</div>
	);
}
