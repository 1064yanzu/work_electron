import { Download } from "lucide-react";
import { ZoomableImageViewer } from "./ZoomableImageViewer";

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
				className="relative w-[min(1220px,96vw)] h-[min(90vh,960px)] bg-surface rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] ring-1 ring-white/10 overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				<ZoomableImageViewer
					src={src}
					alt={title || "image"}
					onRequestClose={onClose}
					actionsSlot={
						<a
							href={src}
							download={name}
							className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-secondary dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-surface/10 transition-colors"
							onClick={(e) => e.stopPropagation()}
							title="下载"
						>
							<Download className="w-4 h-4" />
						</a>
					}
				/>
			</div>
		</div>
	);
}
