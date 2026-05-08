/**
 * TTSToolbarButton — 单按钮入口（朗读 / 暂停 / 停止 三态）
 *
 * 用法：
 *   <TTSToolbarButton text="..." scope="chat" />
 *
 * 行为：
 *   - 当前未在朗读 → 点击开始朗读
 *   - 正在朗读 → 点击暂停
 *   - 已暂停 → 点击继续
 *   - 长按或者外部按钮调 stop 来停止
 */
import { Loader2, Pause, Play, Volume2 } from "lucide-react";
import { useTTS } from "../../lib/tts";
import type { TTSScope } from "../../lib/tts";

interface TTSToolbarButtonProps {
	text: string;
	scope: TTSScope;
	className?: string;
	label?: string;
	disabled?: boolean;
	/** 当点击时是否强制朗读（绕过 scene_*_enabled 开关） */
	force?: boolean;
}

export function TTSToolbarButton({
	text,
	scope,
	className,
	label,
	disabled,
	force,
}: TTSToolbarButtonProps) {
	const tts = useTTS({ scope });
	const isMine = tts.scope === scope;
	const status = isMine ? tts.status : "idle";

	const handleClick = () => {
		if (disabled || !text.trim()) return;
		if (status === "playing") {
			tts.pause();
		} else if (status === "paused") {
			tts.resume();
		} else {
			void tts.speak(text, { force: force ?? true });
		}
	};

	const Icon =
		status === "loading"
			? Loader2
			: status === "playing"
				? Pause
				: status === "paused"
					? Play
					: Volume2;

	const title =
		status === "playing"
			? "暂停朗读"
			: status === "paused"
				? "继续朗读"
				: status === "loading"
					? "合成中…"
					: "朗读";

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={disabled || !text.trim()}
			className={
				className ??
				"flex items-center gap-1.5 text-xs font-medium text-text-light hover:text-text-secondary dark:hover:text-text-light transition-colors disabled:opacity-40"
			}
			title={title}
		>
			<Icon
				className={`w-3 h-3 ${status === "loading" ? "animate-spin" : ""}`}
			/>
			{label ?? title}
		</button>
	);
}
