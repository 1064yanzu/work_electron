/**
 * PetBubbleShell — 所有气泡的共用外壳
 *
 * 升级要点：
 * - 暖色微渐变内底（accentColor 极淡）+ 主背景层
 * - backdrop blur 增强桌面叠加感
 * - 思考态时边缘呼吸光晕（glowing prop）
 * - 水滴指针自带 accent 色阴影
 * - 支持 onPointerEnter/Leave 让外层冻结自动消失计时器
 * - placement: 默认上方（指针朝下）；屏幕顶部空间不足时翻成下方（指针朝上）
 * - sinking: 关闭时走 sink 动画而不是瞬间消失
 *
 * ## 进出场为什么换成 GSAP timeline
 *
 * 原来是三个 CSS keyframes（rise / drop / sink）加上内容行各自写
 * `animationDelay`。问题在于**它们没有共同的时钟**：气泡本体的缩放曲线和
 * 内容行的延迟是两套独立动画，改任一边的时长都要手工重算另一边的 delay，
 * 而且 reduce-motion 把 duration 压到 0.01ms 时，delay 并不会跟着压缩，
 * 内容行会在气泡早就到位之后才慢悠悠冒出来。
 *
 * 换成一条 timeline 后：本体 → 内容行 → 台词逐字，全部挂在同一个时间原点上，
 * 档位缩放由 `dur()` 统一负责，改一个参数整段跟着动。
 *
 * 调用方用两个标记参与这条时间轴：
 * - `data-bubble-row`：需要依次淡入的内容行
 * - `data-bubble-line`：需要逐字显现的台词（仅 expressive 档；内容必须在
 *   气泡生命周期内保持稳定，否则 SplitText 拆出来的 span 会和 React 打架）
 */

import {
	useRef,
	type CSSProperties,
	type PointerEvent,
	type ReactNode,
} from "react";

import { EASE, textReveal, useGsapMotion } from "../../lib/motion";

import { withAlpha } from "./utils";

export type PetBubblePlacement = "top" | "bottom";

export interface PetBubbleShellProps {
	children: ReactNode;
	accentColor?: string;
	noInteract?: boolean;
	/** 是否处于"思考/进行中"态：开启边缘呼吸光晕 */
	glowing?: boolean;
	/** 鼠标悬停在气泡上时回调（外层用来冻结自动关闭计时器） */
	onPointerEnter?: (e: PointerEvent<HTMLDivElement>) => void;
	onPointerLeave?: (e: PointerEvent<HTMLDivElement>) => void;
	/** 气泡放在角色上方（指针朝下，默认）或下方（指针朝上） */
	placement?: PetBubblePlacement;
	/** 是否处于退场动画期 */
	sinking?: boolean;
	/** 额外样式（用于宽度限制等场景） */
	style?: CSSProperties;
}

export function PetBubbleShell({
	children,
	accentColor = "#D96C46",
	noInteract,
	glowing,
	onPointerEnter,
	onPointerLeave,
	placement = "top",
	sinking = false,
	style,
}: PetBubbleShellProps) {
	const isBottom = placement === "bottom";
	const rootRef = useRef<HTMLDivElement>(null);
	// 上方气泡从角色头顶"升"起来，下方气泡从下巴"落"下去：
	// 位移方向和缩放锚点都得跟着 placement 翻，否则会看起来从错误的一侧钻出来
	const dir = isBottom ? -1 : 1;

	useGsapMotion(
		({ gsap, dur, amp, expressive }) => {
			const element = rootRef.current;
			if (!element) return;

			if (sinking) {
				gsap.to(element, {
					opacity: 0,
					scale: 0.86,
					y: amp(6) * dir,
					duration: dur(0.2),
					ease: "power2.in",
					overwrite: "auto",
				});
				return;
			}

			const tl = gsap.timeline();
			tl.fromTo(
				element,
				{ opacity: 0, scale: 0.78, y: amp(10) * dir },
				{
					opacity: 1,
					scale: 1,
					y: 0,
					duration: dur(0.36),
					ease: EASE.spring,
					clearProps: "transform",
				},
			);

			const rows = element.querySelectorAll("[data-bubble-row]");
			if (rows.length > 0) {
				tl.from(
					rows,
					{
						opacity: 0,
						y: amp(6),
						duration: dur(0.3),
						ease: EASE.outExpo,
						stagger: expressive ? 0.05 : 0,
						clearProps: "transform,opacity",
					},
					dur(0.1),
				);
			}

			const line = element.querySelector<HTMLElement>("[data-bubble-line]");
			if (line) {
				// 中文逐字；textReveal 在非 expressive 档直接返回 undefined
				return textReveal(line, {
					type: "chars",
					stagger: 0.018,
					y: 8,
					duration: dur(0.38),
					delay: dur(0.18),
				});
			}
		},
		{ dependencies: [sinking, isBottom] },
	);

	return (
		<div
			ref={rootRef}
			className="relative"
			style={{
				pointerEvents: noInteract ? "none" : "auto",
				// 缩放锚点压在指针根部，气泡看起来是"从角色身上长出来的"
				transformOrigin: isBottom
					? "50% calc(0% - 6px)"
					: "50% calc(100% + 6px)",
				...style,
			}}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
		>
			{/* 呼吸光晕层 — 仅 glowing 时显示 */}
			{glowing && (
				<div
					aria-hidden="true"
					className="absolute -inset-1 rounded-[24px] animate-pet-glow-breath pointer-events-none"
					style={{
						background: `radial-gradient(ellipse at 50% 60%, ${withAlpha(accentColor, 0.22)} 0%, transparent 70%)`,
					}}
				/>
			)}

			<div
				className="relative px-4 py-3"
				style={{
					// 双层背景：底色 + 极淡 accent 渐变（给气泡"暖意"）
					background: `linear-gradient(180deg, ${withAlpha(accentColor, 0.05)} 0%, var(--t-bg-surface, #ffffff) 38%, var(--t-bg-surface, #ffffff) 100%)`,
					backdropFilter: "blur(8px)",
					WebkitBackdropFilter: "blur(8px)",
					borderRadius: "20px 20px 22px 22px",
					boxShadow: `
						0 0 0 1px ${withAlpha(accentColor, 0.1)},
						0 1px 1px 0 rgba(26, 26, 25, 0.04),
						0 8px 24px -10px rgba(26, 26, 25, 0.18),
						0 24px 48px -24px ${withAlpha(accentColor, 0.22)}
					`,
				}}
			>
				{children}
			</div>

			{/* 水滴形指针：根据 placement 翻转方向 */}
			<svg
				width="22"
				height="14"
				viewBox="0 0 22 14"
				aria-hidden="true"
				className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
				style={{
					...(isBottom ? { top: "-11px" } : { bottom: "-11px" }),
					transform: isBottom
						? "translateX(-50%) rotate(180deg)"
						: "translateX(-50%)",
					filter: `drop-shadow(0 ${isBottom ? -4 : 4}px 6px ${withAlpha(accentColor, 0.14)})`,
				}}
			>
				<path
					d="M 1 0 C 5 0, 8 6, 11 13 C 14 6, 17 0, 21 0 Z"
					fill="var(--t-bg-surface, #ffffff)"
				/>
			</svg>
		</div>
	);
}
