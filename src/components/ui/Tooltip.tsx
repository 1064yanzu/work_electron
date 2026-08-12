import { type ReactNode, useState, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import {
	intersectsNativeView,
	type OverlayBox,
} from "../../lib/stores/nativeViewRectStore";

interface TooltipProps {
	children: ReactNode;
	content: string;
	/** 延迟显示毫秒数 */
	delay?: number;
	/** 位置偏好 */
	placement?: "top" | "bottom" | "left" | "right";
}

type Placement = NonNullable<TooltipProps["placement"]>;

/** 翻转方向：被原生视图挡住时往反方向让。 */
const OPPOSITE: Record<Placement, Placement> = {
	top: "bottom",
	bottom: "top",
	left: "right",
	right: "left",
};

/**
 * 估算 tooltip 尺寸，用于「会不会被原生视图盖住」的预判。
 *
 * 真实尺寸要渲染完才知道，但这里只需要判断是否与一块通常横跨整个面板的
 * 矩形相交，纵向估准就够了；宽度按 CJK 全角估上限，宁可估宽不估窄。
 */
const ESTIMATED_HEIGHT = 30;
function estimateWidth(content: string): number {
	return Math.max(56, content.length * 13 + 20);
}

/** 按放置方向算出 tooltip 会占据的矩形。 */
function boxFor(
	placement: Placement,
	x: number,
	y: number,
	content: string,
): OverlayBox {
	const w = estimateWidth(content);
	const h = ESTIMATED_HEIGHT;
	switch (placement) {
		case "top":
			return { left: x - w / 2, right: x + w / 2, top: y - h, bottom: y };
		case "bottom":
			return { left: x - w / 2, right: x + w / 2, top: y, bottom: y + h };
		case "left":
			return { left: x - w, right: x, top: y - h / 2, bottom: y + h / 2 };
		case "right":
			return { left: x, right: x + w, top: y - h / 2, bottom: y + h / 2 };
	}
}

/** 按放置方向算出锚点坐标。 */
function anchorFor(
	placement: Placement,
	rect: DOMRect,
): { x: number; y: number } {
	switch (placement) {
		case "top":
			return { x: rect.left + rect.width / 2, y: rect.top - 6 };
		case "bottom":
			return { x: rect.left + rect.width / 2, y: rect.bottom + 6 };
		case "left":
			return { x: rect.left - 6, y: rect.top + rect.height / 2 };
		case "right":
			return { x: rect.right + 6, y: rect.top + rect.height / 2 };
	}
}

/**
 * 简易 Tooltip 组件，鼠标悬浮显示文字说明
 * 支持 top / bottom / left / right 四个方向
 *
 * **自动避让原生视图**：内嵌 Web AI 站点用的 `WebContentsView` 由合成器画在
 * 整个 DOM 之上，z-index 对它无效。若首选方向会落进原生视图的矩形，就翻到
 * 反方向去（见 `nativeViewRectStore`）——这比「浮层一出现就把网页视图摘掉」
 * 温和得多，悬停提示不该让整个网页闪一下。
 */
export function Tooltip({
	children,
	content,
	delay = 400,
	placement = "bottom",
}: TooltipProps) {
	const [visible, setVisible] = useState(false);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [actualPlacement, setActualPlacement] = useState<Placement>(placement);
	const triggerRef = useRef<HTMLDivElement>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
	const tooltipId = useId();

	const showTooltip = () => {
		timeoutRef.current = setTimeout(() => {
			if (!triggerRef.current) return;
			const rect = triggerRef.current.getBoundingClientRect();

			let resolved: Placement = placement;
			let anchor = anchorFor(resolved, rect);

			// 首选方向会被原生视图盖住 → 翻到反方向；反方向同样被盖就维持首选
			// （两边都挡时没有更好的选择，至少行为可预期）
			if (intersectsNativeView(boxFor(resolved, anchor.x, anchor.y, content))) {
				const flipped = OPPOSITE[resolved];
				const flippedAnchor = anchorFor(flipped, rect);
				if (
					!intersectsNativeView(
						boxFor(flipped, flippedAnchor.x, flippedAnchor.y, content),
					)
				) {
					resolved = flipped;
					anchor = flippedAnchor;
				}
			}

			setActualPlacement(resolved);
			setPosition(anchor);
			setVisible(true);
		}, delay);
	};

	const hideTooltip = () => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setVisible(false);
	};

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	const getTransform = () => {
		switch (actualPlacement) {
			case "top":
				return "translateX(-50%) translateY(-100%)";
			case "bottom":
				return "translateX(-50%)";
			case "left":
				return "translateX(-100%) translateY(-50%)";
			case "right":
				return "translateY(-50%)";
		}
	};

	return (
		<>
			<div
				ref={triggerRef}
				onMouseEnter={showTooltip}
				onMouseLeave={hideTooltip}
				onFocus={showTooltip}
				onBlur={hideTooltip}
				className="inline-flex"
				aria-describedby={visible ? tooltipId : undefined}
			>
				{children}
			</div>
			{visible &&
				createPortal(
					<div
						id={tooltipId}
						role="tooltip"
						className={cn(
							"fixed z-[9999] px-2.5 py-1.5 text-xs font-medium rounded-full",
							"bg-cream-900 text-cream-50 dark:bg-cream-100 dark:text-cream-900",
							"shadow-bai-pop pointer-events-none whitespace-nowrap",
							"animate-in fade-in-0 zoom-in-95 duration-150",
						)}
						style={{
							left: position.x,
							top: position.y,
							transform: getTransform(),
						}}
					>
						{content}
					</div>,
					document.body,
				)}
		</>
	);
}
