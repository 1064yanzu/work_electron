import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useMascot } from "../../lib/mascotStore";
import { Mascot, type MascotSize } from "./Mascot";
import { MascotLoadingVideo } from "./MascotLoadingVideo";

export interface MascotThinkingProps {
	label?: string;
	hint?: string;
	size?: MascotSize;
	className?: string;
	/** off 时回退到 Loader2 */
	fallback?: React.ReactNode;
}

/**
 * MascotThinking — 大尺寸思考占位
 *
 * 用于 ProcessingCard / 长时间等待区域。小尺寸位置（如 CopilotHeader）
 * 不要用，缩太小看不清 IP。
 *
 * 渲染优先级：
 * 1. 当前 IP 有 loading 视频（如 leisure / 摸鱼生活版）→ 播放视频
 * 2. 否则用 emotion-thinking PNG + float 动画
 * 3. off 状态 → fallback
 */
export function MascotThinking({
	label = "正在思考",
	hint,
	size = "lg",
	className,
	fallback,
}: MascotThinkingProps) {
	const { enabled, getAnimation } = useMascot();

	if (!enabled) {
		return (
			<>
				{fallback ?? (
					<div
						className={cn(
							"flex items-center justify-center gap-3 text-text-light py-6",
							className,
						)}
					>
						<Loader2 className="w-5 h-5 animate-spin" />
						<span className="text-sm">{label}…</span>
					</div>
				)}
			</>
		);
	}

	const hasLoadingVideo = !!getAnimation("loading");

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-3 py-4 animate-fade-in",
				className,
			)}
		>
			{hasLoadingVideo ? (
				<MascotLoadingVideo size={size} />
			) : (
				<Mascot slot="emotion-thinking" size={size} float />
			)}
			<div className="flex items-center gap-2 text-text-secondary">
				<span className="text-sm font-medium tracking-tight">{label}</span>
				<span className="inline-flex gap-0.5">
					<span className="w-1 h-1 rounded-full bg-text-light/70 animate-thinking-dot" />
					<span
						className="w-1 h-1 rounded-full bg-text-light/70 animate-thinking-dot"
						style={{ animationDelay: "0.15s" }}
					/>
					<span
						className="w-1 h-1 rounded-full bg-text-light/70 animate-thinking-dot"
						style={{ animationDelay: "0.3s" }}
					/>
				</span>
			</div>
			{hint && (
				<p className="text-xs text-text-light max-w-xs text-center">{hint}</p>
			)}
		</div>
	);
}
