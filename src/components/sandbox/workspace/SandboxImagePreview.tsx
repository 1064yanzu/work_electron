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
			<div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-zinc-50 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
				<div className="text-sm text-red-500">图片加载失败: {error}</div>
			</div>
		);
	}

	if (!dataUrl) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-zinc-50 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
				<Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
				<p className="mt-2 text-sm text-zinc-400">加载中...</p>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-zinc-50 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
			<div className="rounded-3xl bg-white/85 dark:bg-zinc-950/60 backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_18px_60px_-35px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.02] dark:ring-white/[0.06] p-3 animate-scale-in">
				<button
					type="button"
					onClick={() => setIsLightboxOpen(true)}
					className="block rounded-2xl overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/40"
					title="点击放大预览"
				>
					<img
						src={dataUrl}
						alt={fileName}
						className="max-w-full max-h-[62vh] object-contain rounded-2xl shadow-[0_10px_30px_-20px_rgba(0,0,0,0.25)] cursor-zoom-in transition-transform duration-200 group-hover:scale-[1.01]"
					/>
				</button>
			</div>
			<div className="mt-4 inline-flex items-center gap-2 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 px-2.5 py-1 rounded-full bg-white/70 dark:bg-zinc-950/40 ring-1 ring-black/5 dark:ring-white/10 backdrop-blur">
				<span className="truncate max-w-[34vw]">{fileName}</span>
				<span className="text-zinc-300 dark:text-zinc-700">·</span>
				<span>{formatFileSize(fileSize)}</span>
			</div>
			<div className="mt-3 inline-flex items-center gap-2">
				<button
					type="button"
					onClick={() => setIsLightboxOpen(true)}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
				>
					<Maximize2 className="w-3.5 h-3.5" />
					放大预览
				</button>
				<a
					href={dataUrl}
					download={downloadName}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 ring-1 ring-black/5 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
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
