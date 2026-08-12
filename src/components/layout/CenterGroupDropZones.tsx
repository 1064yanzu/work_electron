/**
 * CenterGroupDropZones —— 把标签拖到内容区四条边时的分屏落点。
 *
 * VSCode 的核心分屏手势：拖住一个标签移到编辑区，靠近哪条边就在那个方向拆出
 * 新的一屏。比"右键 → 找到拆分菜单项"直观得多，也是把大屏用满的最短路径。
 *
 * 只在**真的正在拖标签**时才挂载（`types` 里有我们的 MIME），平时不存在，
 * 不会拦截内容区的任何鼠标事件——尤其不能挡住内嵌网页视图上方的交互区。
 */
import { useState } from "react";

import {
	centerTabsStore,
	type SplitDirection,
} from "../../lib/stores/centerTabsStore";
import { cn } from "../../lib/utils";
import { TAB_DRAG_MIME } from "./CenterTabBar";

type Edge = "left" | "right" | "top" | "bottom" | "center";

const EDGE_META: Record<
	Exclude<Edge, "center">,
	{ direction: SplitDirection; before: boolean; className: string }
> = {
	left: {
		direction: "horizontal",
		before: true,
		className: "inset-y-0 left-0 w-[22%]",
	},
	right: {
		direction: "horizontal",
		before: false,
		className: "inset-y-0 right-0 w-[22%]",
	},
	top: {
		direction: "vertical",
		before: true,
		className: "inset-x-0 top-0 h-[22%]",
	},
	bottom: {
		direction: "vertical",
		before: false,
		className: "inset-x-0 bottom-0 h-[22%]",
	},
};

/** 松手后的高亮预览：告诉用户新分屏会落在哪半边。 */
const PREVIEW_CLASS: Record<Exclude<Edge, "center">, string> = {
	left: "inset-y-0 left-0 w-1/2",
	right: "inset-y-0 right-0 w-1/2",
	top: "inset-x-0 top-0 h-1/2",
	bottom: "inset-x-0 bottom-0 h-1/2",
};

export function CenterGroupDropZones({
	groupId,
	dragging,
}: {
	groupId: string;
	/** 当前是否正在拖一个中栏标签 */
	dragging: boolean;
}) {
	const [hovered, setHovered] = useState<Edge | null>(null);

	if (!dragging) return null;

	const handleDrop = (edge: Edge) => (event: React.DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		setHovered(null);
		// 落下就算拖拽结束——不能等标签上的 onDragEnd。分屏会把这个标签搬到新组，
		// 源组里那个按钮随即被卸载，dragend 永远不会派发到它身上，
		// draggingTabId 就会一直挂着：落点层常驻，把整个内容区盖死（终端点不动、
		// 编辑器也点不动）。这里先结束，再做搬运。
		centerTabsStore.endTabDrag();
		const tabId = event.dataTransfer.getData(TAB_DRAG_MIME);
		if (!tabId) return;

		if (edge === "center") {
			centerTabsStore.moveTabToGroup(tabId, groupId);
			return;
		}
		const meta = EDGE_META[edge];
		centerTabsStore.splitGroup({
			groupId,
			direction: meta.direction,
			tabId,
			before: meta.before,
		});
	};

	const zoneProps = (edge: Edge) => ({
		onDragOver: (event: React.DragEvent) => {
			if (!event.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
			event.preventDefault();
			event.stopPropagation();
			event.dataTransfer.dropEffect = "move";
			setHovered(edge);
		},
		onDragLeave: () => setHovered((prev) => (prev === edge ? null : prev)),
		onDrop: handleDrop(edge),
	});

	return (
		<div className="pointer-events-none absolute inset-0 z-30">
			{/* 中央：移到本组（不拆分） */}
			<div
				{...zoneProps("center")}
				className="pointer-events-auto absolute inset-[22%]"
			/>
			{(Object.keys(EDGE_META) as (keyof typeof EDGE_META)[]).map((edge) => (
				<div
					key={edge}
					{...zoneProps(edge)}
					className={cn(
						"pointer-events-auto absolute",
						EDGE_META[edge].className,
					)}
				/>
			))}

			{/* 落点预览 */}
			{hovered && (
				<div
					className={cn(
						"pointer-events-none absolute rounded-lg border-2 border-terracotta/50 bg-terracotta/[0.12] transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150",
						hovered === "center" ? "inset-2" : PREVIEW_CLASS[hovered],
					)}
				/>
			)}
		</div>
	);
}
