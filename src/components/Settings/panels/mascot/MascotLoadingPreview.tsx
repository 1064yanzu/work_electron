/**
 * MascotLoadingPreview — 单独展示视频版「思考动画」
 *
 * 仅在当前 IP 有 loading.mp4 时渲染。
 * 与表情画廊放在一起会破坏静态网格节奏，所以单独抽出来。
 */
import { Play } from "lucide-react";
import {
	getMascotAnimation,
	type MascotId,
} from "../../../../lib/mascot/manifest";

interface MascotLoadingPreviewProps {
	id: MascotId;
	accentColor: string;
}

export function MascotLoadingPreview({
	id,
	accentColor,
}: MascotLoadingPreviewProps) {
	const src = getMascotAnimation(id, "loading");
	if (!src) return null;
	return (
		<div
			className="flex items-center gap-4 rounded-2xl border border-border bg-cream-50 p-4"
			style={{ borderColor: `${accentColor}33` }}
		>
			<div
				className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl"
				style={{ backgroundColor: `${accentColor}14` }}
			>
				<video
					key={src}
					src={src}
					autoPlay
					loop
					muted
					playsInline
					preload="metadata"
					className="h-full w-full object-contain"
				/>
				<div className="pointer-events-none absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface/90 shadow-bai-card">
					<Play
						className="h-2.5 w-2.5 ml-0.5"
						strokeWidth={2}
						style={{ color: accentColor }}
						fill="currentColor"
					/>
				</div>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold text-text-primary">
						思考态视频动画
					</span>
					<span
						className="rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wider"
						style={{
							backgroundColor: `${accentColor}1F`,
							color: accentColor,
						}}
					>
						LOOP
					</span>
				</div>
				<p className="mt-1 text-xs leading-relaxed text-text-muted">
					文档生成、Agent 等待等长任务中替代静态图片，让等待更生动。仅当前 IP
					配置了视频时启用。
				</p>
			</div>
		</div>
	);
}
