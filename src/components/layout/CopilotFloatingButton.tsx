/**
 * CopilotFloatingButton — 右栏收起后的悬浮唤起按钮。
 *
 * 从 App.tsx 里拆出来单独放，一是 App.tsx 已经够长，
 * 二是它需要自己的入场时间轴和按压反馈，混在总壳里读起来很吵。
 *
 * 入场锚点定在右下角（`transformOrigin: 100% 100%`）：右栏是从右侧收起的，
 * 按钮就该从同一个方向"缩"出来，视线不用重新找落点。
 */

import { MessageCircle } from "lucide-react";

import { EASE, useGsapMotion, useSpringPress } from "../../lib/motion";

export interface CopilotFloatingButtonProps {
	onClick: () => void;
	/** 展示在 title 里的快捷键提示，如 "⌘L" */
	shortcutHint: string;
}

export function CopilotFloatingButton({
	onClick,
	shortcutHint,
}: CopilotFloatingButtonProps) {
	const { ref, active: springPress } = useSpringPress<HTMLButtonElement>({
		pressScale: 0.95,
	});

	useGsapMotion(({ gsap, dur, amp, expressive }) => {
		const element = ref.current;
		if (!element) return;
		const tl = gsap.timeline();
		tl.from(element, {
			opacity: 0,
			scale: 0.72,
			y: amp(14),
			duration: dur(0.46),
			ease: EASE.spring,
			transformOrigin: "100% 100%",
			clearProps: "transform,opacity",
		});
		if (expressive) {
			// 图标比文字晚一点点弹进来，读起来是"按钮先到，内容再落位"
			tl.from(
				element.querySelector("svg"),
				{
					scale: 0.4,
					rotate: -30,
					duration: dur(0.44),
					ease: EASE.spring,
					clearProps: "transform",
				},
				dur(0.1),
			);
		}
	}, {});

	return (
		<button
			ref={ref}
			type="button"
			onClick={onClick}
			className={[
				"fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 backdrop-blur-md rounded-full duration-150",
				springPress
					? "transition-[background-color,box-shadow,color]"
					: "transition-[background-color,box-shadow,transform,color] active:scale-[0.98]",
			].join(" ")}
			style={{
				backgroundColor: "var(--t-bg-surface)",
				color: "var(--t-text-primary)",
				border: "1px solid var(--t-border)",
				boxShadow: "0 4px 12px 0 rgb(26 26 25 / 0.06)",
			}}
			title={`打开 AI 对话 (${shortcutHint})`}
		>
			<MessageCircle className="w-4 h-4" strokeWidth={1.5} />
			<span className="text-sm font-medium">AI 对话</span>
		</button>
	);
}
