import { Download, Loader2 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { getImageDataUrl } from "../../lib/agent/imageDataUrlCache";
import { ImageLightbox } from "./ImageLightbox";
import { useAgentStoreSelector } from "../../lib/agent/store";
import { managedModeStore } from "../../lib/managedModeStore";
import { safeInvoke } from "../../lib/tauriBridge";

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

export const InlineImage = memo(function InlineImage({
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
	const savedRef = useRef(false);
	// 使用 selector 只订阅 currentTask，减少不必要的重渲染
	const currentTask = useAgentStoreSelector(state => state.currentTask);

	const downloadName = useMemo(
		() => guessDownloadName(title, path),
		[title, path],
	);

	// 获取 sandboxDir
	const sandboxDir = useMemo(() => {
		return (currentTask?.metadata as any)?.sandboxDir as string | undefined;
	}, [currentTask]);

	// 自动保存 base64 图片到沙盒目录
	useEffect(() => {
		if (!path.startsWith("data:")) return; // 只处理 base64 图片
		if (!sandboxDir) return;
		if (savedRef.current) return; // 已保存过

		savedRef.current = true;

		(async () => {
			try {
				// 解析 base64 数据
				const match = path.match(/^data:image\/(\w+);base64,(.+)$/);
				if (!match) return;

				const ext = match[1] === "jpeg" ? "jpg" : match[1];
				const base64Data = match[2];
				const fileName = downloadName || `image_${Date.now()}.${ext}`;
				const filePath = `${sandboxDir}/${fileName}`;

				// 写入文件到沙盒
				await safeInvoke<{ success: boolean }>("write_file_safe", {
					payload: {
						path: filePath,
						content: base64Data,
						encoding: "base64",
						create_dirs: true,
					},
				});

				// 同时保存到产物数据库
				try {
					const sessionId = sandboxDir.split("/").pop() || `session_${Date.now()}`;
					await safeInvoke("artifact_save", {
						session_id: sessionId,
						file_name: fileName,
						content: base64Data,
						encoding: "base64",
						description: `Generated image: ${title || fileName}`,
					});
				} catch (dbErr) {
					console.warn("[InlineImage] Failed to save image to database:", dbErr);
				}

				// 触发沙箱文件列表刷新（使用静态导入的 store）
				try {
					await managedModeStore.scanSandboxDir(sandboxDir);
				} catch (e) {
					// 静默失败
				}
			} catch (err) {
				console.error("[InlineImage] Failed to auto-save base64 image:", err);
			}
		})();
	}, [path, sandboxDir, downloadName, title]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				let url: string;
				if (path.startsWith("data:")) {
					url = path;
				} else {
					url = await getImageDataUrl(path);
				}
				if (cancelled) return;
				setDataUrl(url);
			} catch (e) {
				if (cancelled) return;
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
});
