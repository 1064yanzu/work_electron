import { Download, Loader2, Maximize2 } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { getImageDataUrl } from "../../../lib/agent/imageDataUrlCache";
import { formatFileSize } from "../../../lib/managedModeStore";
import { ImageLightbox } from "../../ui/ImageLightbox";

export const SandboxImagePreview = memo(function SandboxImagePreview({
	filePath,
	fileName,
	fileSize,
}: {
	filePath: string;
	fileName: string;
	fileSize: number;
}) {
	const [dataUrl, setDataUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLightboxOpen, setIsLightboxOpen] = useState(false);
	const downloadName = useMemo(() => {
		const trimmed = fileName.trim();
		return trimmed || "image.png";
	}, [fileName]);

	useEffect(() => {
		let cancelled = false;
		setDataUrl(null);
		setError(null);

		getImageDataUrl(filePath)
			.then((url) => {
				if (!cancelled) setDataUrl(url);
			})
			.catch((err) => {
				if (!cancelled) setError(err.message || "加载失败");
			});

		return () => {
			cancelled = true;
		};
	}, [filePath]);

	if (error) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-cream-50 via-white to-cream-50 dark:from-cream-900 dark:via-cream-900 dark:to-cream-900">
				<div className="text-sm text-error">图片加载失败: {error}</div>
			</div>
		);
	}

	if (!dataUrl) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-cream-50 via-white to-cream-50 dark:from-cream-900 dark:via-cream-900 dark:to-cream-900">
				<Loader2 className="w-6 h-6 animate-spin text-text-light" />
				<p className="mt-2 text-sm text-text-light">加载中...</p>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-cream-50 via-white to-cream-50 dark:from-cream-900 dark:via-cream-900 dark:to-cream-900">
			<div className="rounded-3xl bg-surface/85 backdrop-blur-md border border-black/[0.06] dark:border-white/[0.08] shadow-[0_18px_60px_-35px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.02] dark:ring-white/[0.06] p-3 animate-scale-in">
				<button
					type="button"
					onClick={() => setIsLightboxOpen(true)}
					className="block rounded-2xl overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-500/40"
					title="点击放大预览"
				>
					<img
						src={dataUrl}
						alt={fileName}
						className="max-w-full max-h-[62vh] object-contain rounded-2xl shadow-[0_10px_30px_-20px_rgba(0,0,0,0.25)] cursor-zoom-in transition-transform duration-150 group-hover:scale-[1.01]"
					/>
				</button>
			</div>
			<div className="mt-4 inline-flex items-center gap-2 text-xs font-mono text-text-muted px-2.5 py-1 rounded-full bg-surface/70 ring-1 ring-black/5 dark:ring-white/10 backdrop-blur">
				<span className="truncate max-w-[34vw]">{fileName}</span>
				<span className="text-text-light">·</span>
				<span>{formatFileSize(fileSize)}</span>
			</div>
			<div className="mt-3 inline-flex items-center gap-2">
				<button
					type="button"
					onClick={() => setIsLightboxOpen(true)}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-dark-muted text-white hover:opacity-90 transition-opacity"
				>
					<Maximize2 className="w-3.5 h-3.5" />
					放大预览
				</button>
				<a
					href={dataUrl}
					download={downloadName}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-surface text-text-secondary ring-1 ring-black/5 dark:ring-white/10 hover:bg-warm-50 transition-colors"
				>
					<Download className="w-3.5 h-3.5" />
					下载
				</a>
			</div>
			<ImageLightbox
				open={isLightboxOpen}
				src={dataUrl}
				title={fileName}
				downloadName={downloadName}
				onClose={() => setIsLightboxOpen(false)}
			/>
		</div>
	);
});
