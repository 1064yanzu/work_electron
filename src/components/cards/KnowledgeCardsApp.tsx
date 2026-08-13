import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import {
	cardLibraryStoreApi,
	useCardLibraryStoreSelector,
} from "../../lib/stores/cardLibraryStore";
import { EASE, useGsapMotion } from "../../lib/motion";
import { useFocusTrap } from "../ui/FocusTrap";

import { KnowledgeCardsView } from "./KnowledgeCardsView";

/**
 * 知识卡片库全屏 Overlay。同 ReaderApp 的容器模式：
 * 由 cardLibraryStore.open 控制可见，通过 Portal 挂在 body。
 *
 * 打开动画：如果是从左栏的嵌入式卡片库点「放大」进来的（store 里带了
 * originRect），就把 transform-origin 定在那块面板的中心，让全屏视图**从那里
 * 长出来**——用户的视线不用重新找落点。没有起点信息时退化成居中弹出。
 *
 * 刻意不做逐卡片 Flip：嵌入视图并没有卸载，同一批 flip-id 会同时存在两份，
 * Flip 会配错对。整体放大 + 卡片 stagger 已经足够表达"是同一批东西变大了"。
 */
export function KnowledgeCardsApp() {
	const open = useCardLibraryStoreSelector((s) => s.open);
	const originRect = useCardLibraryStoreSelector((s) => s.originRect);
	const scopeRef = useRef<HTMLDivElement>(null);

	// Esc 关闭全屏卡片库（useFocusTrap 自动注册 overlayStack，只在栈顶时消费）
	const handleEscape = useCallback(() => cardLibraryStoreApi.close(), []);
	const trapRef = useFocusTrap<HTMLDivElement>({
		active: open,
		onEscape: handleEscape,
	});
	const setOverlayRef = useCallback(
		(node: HTMLDivElement | null) => {
			scopeRef.current = node;
			trapRef.current = node;
		},
		[trapRef],
	);

	useEffect(() => {
		if (!open) return;
		document.body.classList.add("card-library-overlay-open");
		return () => {
			document.body.classList.remove("card-library-overlay-open");
		};
	}, [open]);

	useGsapMotion(
		({ gsap, dur, amp, expressive }) => {
			const element = scopeRef.current;
			if (!element) return;

			// transform-origin 取起点矩形的中心，换算成 overlay 自身的百分比坐标；
			// 夹在 0–100%：起点可能有一部分在视口外（面板被滚动过）。
			const bounds = element.getBoundingClientRect();
			const toPercent = (value: number, start: number, size: number) =>
				size > 0
					? Math.min(100, Math.max(0, ((value - start) / size) * 100))
					: 50;
			const originX = originRect
				? toPercent(
						originRect.left + originRect.width / 2,
						bounds.left,
						bounds.width,
					)
				: 50;
			const originY = originRect
				? toPercent(
						originRect.top + originRect.height / 2,
						bounds.top,
						bounds.height,
					)
				: 50;

			const tl = gsap.timeline();
			tl.from(element, {
				opacity: 0,
				scale: originRect ? 0.88 : 0.96,
				transformOrigin: `${originX}% ${originY}%`,
				duration: dur(0.5),
				ease: EASE.outExpo,
				clearProps: "transform,opacity",
			});
			if (expressive) {
				const cards = element.querySelectorAll(".card-library__card");
				if (cards.length > 0) {
					tl.from(
						cards,
						{
							opacity: 0,
							y: amp(18),
							duration: dur(0.42),
							ease: EASE.outExpo,
							stagger: { each: 0.02, from: "start" },
							clearProps: "transform,opacity",
						},
						dur(0.14),
					);
				}
			}
		},
		{ dependencies: [open], skip: !open },
	);

	if (!open) return null;

	const node = (
		<div
			ref={setOverlayRef}
			className="card-library-overlay"
			role="dialog"
			aria-modal="true"
			aria-label="复习卡库"
		>
			<KnowledgeCardsView onClose={() => cardLibraryStoreApi.close()} />
		</div>
	);

	return createPortal(node, document.body);
}

/** 从某个元素放大打开（传入触发按钮所在的面板，动画就会从那里长出来）。 */
export function openKnowledgeCards(origin?: Element | null) {
	if (origin) {
		cardLibraryStoreApi.openFrom(origin);
		return;
	}
	cardLibraryStoreApi.open();
}
