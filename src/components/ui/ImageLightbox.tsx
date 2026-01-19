import { Download, X } from "lucide-react";

export function ImageLightbox({
	open,
	src,
	title,
	downloadName,
	onClose,
}: {
	open: boolean;
	src: string | null;
	title?: string;
	downloadName?: string;
	onClose: () => void;
}) {
	if (!open || !src) return null;

	const name = downloadName || (title ? `${title}.png` : "image.png");

	return (
		<div
			className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			onClick={onClose}
		>
			<div
				className="relative w-[min(980px,92vw)] h-[min(82vh,860px)] bg-white dark:bg-zinc-900 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] ring-1 ring-white/10 overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="absolute top-3 right-3 flex items-center gap-2 z-10">
					<a
						href={src}
						download={name}
						className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/90 dark:bg-zinc-800/90 text-zinc-700 dark:text-zinc-100 hover:bg-white dark:hover:bg-zinc-800 ring-1 ring-black/5 dark:ring-white/10 transition-colors"
						onClick={(e) => e.stopPropagation()}
						title="下载"
					>
						<Download className="w-4 h-4" />
						<span className="text-xs font-medium">下载</span>
					</a>
					<button
						type="button"
						className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/90 dark:bg-zinc-800/90 text-zinc-700 dark:text-zinc-100 hover:bg-white dark:hover:bg-zinc-800 ring-1 ring-black/5 dark:ring-white/10 transition-colors"
						onClick={onClose}
						title="关闭"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<div className="w-full h-full p-4 flex items-center justify-center">
					<img
						src={src}
						alt={title || "image"}
						className="max-w-full max-h-full object-contain rounded-xl ring-1 ring-black/5 dark:ring-white/10"
					/>
				</div>
			</div>
		</div>
	);
}
