/**
 * AutoVirtualGrid —— 超过阈值才启用的列表/网格虚拟化。
 *
 * ## 为什么需要它
 *
 * 项目里多个列表（提示词库、技能、知识卡片…）都是「一次性 .map 出全部条目」。
 * 条目本身不轻（卡片带图标、标签、菜单、hover 态），几百条就是几千个 DOM 节点，
 * 打开面板要卡顿一下，滚动掉帧。
 *
 * ## 设计取舍
 *
 * 1. **低于阈值不虚拟化**：绝大多数用户的列表只有几十条。虚拟化本身有成本
 *    （测量、绝对定位、滚动容器约束），条目少时是净亏。默认 60 条才启用，
 *    低于阈值时渲染结构与原来完全一致（同一个容器 className + 直接 map），
 *    所以不会影响既有的 CSS 网格/间距行为。
 *
 * 2. **网格按行虚拟化**：CSS `auto-fill` 的列数取决于容器宽度，虚拟化必须先知道
 *    列数才能把「第 N 个条目」映射到「第 M 行」。这里用 ResizeObserver 实测容器
 *    宽度反推列数，而不是写死断点——写死断点在分屏/侧栏拖动时会立刻错位。
 *
 * 3. **measureElement 动态测高**：条目高度不固定（描述文字可能换行），
 *    estimateSize 只作初值，实际高度由 measureElement 回填。
 *    注意：被测量的元素上不能加 `content-visibility: auto`，否则测到的是占位高度。
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useMemo,
	useState,
} from "react";

export interface AutoVirtualGridProps<T> {
	items: T[];
	/** 滚动容器。必须是**实际产生滚动**的那个元素（overflow-y:auto） */
	scrollRef: RefObject<HTMLElement | null>;
	renderItem: (item: T, index: number) => ReactNode;
	getItemKey: (item: T, index: number) => string;

	/** 超过这个数量才启用虚拟化 */
	threshold?: number;
	/** 条目预估高度（网格模式下是「一行」的预估高度） */
	estimateSize: number;

	/**
	 * 网格模式的最小列宽（对应 CSS `minmax(<minColumnWidth>px, 1fr)`）。
	 * 不传则按单列列表处理。
	 */
	minColumnWidth?: number;
	/** 条目间距（px），需与容器的 gap 一致，用于列数计算和行间距补偿 */
	gap?: number;

	/** 未启用虚拟化时套在外层的容器 className（保持原有布局） */
	className?: string;
	overscan?: number;
}

const DEFAULT_THRESHOLD = 60;

export function AutoVirtualGrid<T>({
	items,
	scrollRef,
	renderItem,
	getItemKey,
	threshold = DEFAULT_THRESHOLD,
	estimateSize,
	minColumnWidth,
	gap = 0,
	className,
	overscan = 6,
}: AutoVirtualGridProps<T>) {
	const enabled = items.length > threshold;

	const [containerWidth, setContainerWidth] = useState(0);
	useEffect(() => {
		// 只有网格模式 + 已启用虚拟化时才需要知道宽度
		if (!enabled || !minColumnWidth) return;
		const el = scrollRef.current;
		if (!el) return;
		const update = () => setContainerWidth(el.clientWidth);
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, [enabled, minColumnWidth, scrollRef]);

	const columns = useMemo(() => {
		if (!minColumnWidth) return 1;
		if (containerWidth <= 0) return 1;
		// 与 CSS `repeat(auto-fill, minmax(minColumnWidth, 1fr))` 的列数算法一致
		return Math.max(
			1,
			Math.floor((containerWidth + gap) / (minColumnWidth + gap)),
		);
	}, [containerWidth, minColumnWidth, gap]);

	const rowCount = enabled ? Math.ceil(items.length / columns) : 0;

	const virtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => estimateSize,
		overscan,
	});

	// 低于阈值：保持与虚拟化前完全相同的 DOM 结构
	if (!enabled) {
		return (
			<div className={className}>
				{items.map((item, index) => (
					<div key={getItemKey(item, index)} style={{ display: "contents" }}>
						{renderItem(item, index)}
					</div>
				))}
			</div>
		);
	}

	return (
		<div
			style={{
				height: `${virtualizer.getTotalSize()}px`,
				position: "relative",
				width: "100%",
			}}
		>
			{virtualizer.getVirtualItems().map((virtualRow) => {
				const start = virtualRow.index * columns;
				const rowItems = items.slice(start, start + columns);
				return (
					<div
						key={virtualRow.key}
						data-index={virtualRow.index}
						ref={virtualizer.measureElement}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							transform: `translateY(${virtualRow.start}px)`,
							display: columns > 1 ? "grid" : "flex",
							gridTemplateColumns:
								columns > 1 ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
							flexDirection: columns > 1 ? undefined : "column",
							gap: `${gap}px`,
							// 行与行之间的间距：靠 padding 撑开，避免 transform 定位算错
							paddingBottom: `${gap}px`,
						}}
					>
						{rowItems.map((item, i) => (
							<div key={getItemKey(item, start + i)}>
								{renderItem(item, start + i)}
							</div>
						))}
					</div>
				);
			})}
		</div>
	);
}
