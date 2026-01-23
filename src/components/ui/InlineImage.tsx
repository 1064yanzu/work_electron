import { Download, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getImageDataUrl } from "../../lib/agent/imageDataUrlCache";
import { ImageLightbox } from "./ImageLightbox";

function guessDownloadName(title: string | undefined, path: string) {
	if (path.startsWith("data:")) {
		const ext = path.substring(5, path.indexOf(";")).split("/")[1] || "png";
		if (title && title.trim()) {
			const base = title.replace(/[\\/:*?"<>|]/g, "_");
			return base.endsWith(`.${ext}`) ? base : `${base}.${ext}`;
		}
		return `generated-image-${Date.now()}.${ext}`;
	}

	const file = path.split("/").pop() || "image.png";
	if (!title || !title.trim()) return file;
	// 保留扩展名
	const ext = file.includes(".") ? `.${file.split(".").pop()}` : ".png";
	const base = title.replace(/[\\/:*?"<>|]/g, "_");
	return base.endsWith(ext) ? base : `${base}${ext}`;
}

export function InlineImage({
	path,
	title,
	className,
	maxHeightClassName = "max-h-60",
}: {
	path: string;
	title?: string;
	className?: string;
	maxHeightClassName?: string;
}) {
	const [dataUrl, setDataUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState(false);

	const downloadName = useMemo(
		() => guessDownloadName(title, path),
		[title, path],
	);

	useEffect(() => {
		let cancelled = false;
		console.log('[InlineImage] Loading image:', path.substring(0, 100));
		(async () => {
			try {
				let url: string;
				if (path.startsWith("data:")) {
					console.log('[InlineImage] Using Data URL directly');
					url = path;
				} else {
					console.log('[InlineImage] Reading from file system');
					url = await getImageDataUrl(path);
				}
				if (cancelled) return;
				console.log('[InlineImage] Image loaded successfully');
				setDataUrl(url);
			} catch (e) {
				if (cancelled) return;
				console.error('[InlineImage] Error loading image:', e);
				setError(e instanceof Error ? e.message : String(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [path]);

	if (error) {
		return (
			<div className="text-[11px] text-zinc-400">图片加载失败: {path}</div>
		);
	}

	if (!dataUrl) {
		return (
			<div className="flex items-center gap-2 text-[11px] text-zinc-500">
				<Loader2 className="w-3 h-3 animate-spin" />
				加载图片...
			</div>
		);
	}

	return (
		<div className={className ? className : ""}>
			<div className="group relative">
				<button
					type="button"
					className="block w-full"
					onClick={() => setOpen(true)}
					title="点击放大预览"
				>
					<img
						src={dataUrl}
						alt={title || path}
						className={`max-w-full ${maxHeightClassName} object-contain rounded-xl ring-1 ring-black/5 dark:ring-white/10 cursor-zoom-in`}
					/>
				</button>

				<a
					href={dataUrl}
					download={downloadName}
					className="absolute top-2 right-2 inline-flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/90 dark:bg-zinc-800/90 text-zinc-700 dark:text-zinc-100 ring-1 ring-black/5 dark:ring-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
					title="下载"
					onClick={(e) => e.stopPropagation()}
				>
					<Download className="w-4 h-4" />
					<span className="text-xs font-medium">下载</span>
				</a>
			</div>

			<ImageLightbox
				open={open}
				src={dataUrl}
				title={title}
				downloadName={downloadName}
				onClose={() => setOpen(false)}
			/>
		</div>
	);
}
