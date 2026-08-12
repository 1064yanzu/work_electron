import { FilePen, FilePlus, Loader2 } from "lucide-react";
import { useMascot } from "../../lib/mascotStore";
import { Mascot } from "../Mascot/Mascot";
import { MascotLoadingVideo } from "../Mascot/MascotLoadingVideo";

export function ProcessingCard({ type }: { type: "update" | "create" }) {
	const { enabled, getAnimation } = useMascot();
	const hasLoadingVideo = !!getAnimation("loading");

	return (
		<div className="my-4 group relative overflow-hidden rounded-2xl bg-surface/50 ring-1 ring-cream-900/5 dark:ring-cream-100/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-4 select-none transition-[color,background-color,border-color,opacity,box-shadow,transform] hover:shadow-md">
			<div className="absolute inset-0 bg-gradient-to-r from-transparent via-cream-50/50 to-transparent dark:via-white/5 skeleton-shimmer" />
			<div className="flex items-center gap-4 relative z-10">
				{enabled ? (
					hasLoadingVideo ? (
						<MascotLoadingVideo size="md" wrapperClassName="shrink-0" />
					) : (
						<Mascot
							slot={type === "create" ? "state-organize" : "emotion-thinking"}
							size="md"
							float
							wrapperClassName="shrink-0"
						/>
					)
				) : (
					<div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center shrink-0 ring-1 ring-cream-900/5 dark:ring-cream-700">
						{type === "create" ? (
							<FilePlus className="w-5 h-5 text-indigo-500 animate-pulse" />
						) : (
							<FilePen className="w-5 h-5 text-indigo-500 animate-pulse" />
						)}
					</div>
				)}
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<p className="font-medium text-text-primary text-sm tracking-tight">
							{type === "create" ? "正在构思新文档" : "正在优化文档内容"}
						</p>
						<Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500/70" />
					</div>
					<p className="text-xs text-text-light mt-0.5 font-medium">
						AI 正在实时生成并应用变更...
					</p>
				</div>
			</div>
		</div>
	);
}
