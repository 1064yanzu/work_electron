/**
 * Tweaks 浮动 overlay 容器。内嵌现有 TweaksPanel。
 * 位置:主体右上角(top-3.5 right-3.5),宽 320,跟 chrome 浮起 4-6px。
 */
import { TweaksPanel } from "../TweaksPanel";

interface DesignTweaksOverlayProps {
	sessionId: string;
	runId: string | null;
	mode?: string;
	onClose: () => void;
}

export function DesignTweaksOverlay({
	sessionId,
	runId,
	mode,
	onClose,
}: DesignTweaksOverlayProps) {
	return (
		<div className="absolute top-3.5 right-3.5 z-[5] w-80 max-h-[calc(100%-28px)] rounded-xl bg-background border border-border shadow-bai-pop overflow-hidden flex flex-col">
			<TweaksPanel
				sessionId={sessionId}
				runId={runId}
				mode={mode}
				onClose={onClose}
			/>
		</div>
	);
}
