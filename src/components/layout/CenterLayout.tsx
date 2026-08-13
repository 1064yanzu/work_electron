/**
 * CenterLayout —— 中栏的递归分屏渲染层。
 *
 * 把 `centerTabsStore` 的布局树映射成嵌套的 `PanelGroup`：
 * `split` 节点 → 一层 PanelGroup + 中间夹 ResizeHandle；`leaf` 节点 → 一个
 * 编辑器组（自带标签条 + 内容区）。
 *
 * ## 为什么每个 split 都给 autoSaveId
 *
 * react-resizable-panels 用 `autoSaveId` 记住分隔条位置。id 里带上参与的组，
 * 是为了让「同一处分屏」在重启后能对上；组变了就当作新的一处分屏，从默认
 * 均分开始——比错误地套用一组不相干的旧尺寸要好。
 *
 * ## 焦点
 *
 * 点进某个组的任意位置就把它设为活动组（新标签、快捷键都作用于活动组）。
 * 用捕获阶段的 mousedown：内容区里有大量自带 onClick 的控件，冒泡阶段可能
 * 被 stopPropagation 掉。
 */
import { Fragment, useCallback } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";

import ResizeHandle from "./ResizeHandle";
import { CenterGroupContent } from "./CenterGroupContent";
import { CenterGroupDropZones } from "./CenterGroupDropZones";
import { CenterTabBar } from "./CenterTabBar";
import { PanelErrorBoundary } from "../ui/PanelErrorBoundary";
import {
	centerTabsStore,
	useCenterTabsStoreSelector,
	type LayoutNode,
} from "../../lib/stores/centerTabsStore";
import { cn } from "../../lib/utils";

export function CenterLayout() {
	const layout = useCenterTabsStoreSelector((s) => s.layout);
	return <LayoutNodeView node={layout} />;
}

function LayoutNodeView({ node }: { node: LayoutNode }) {
	if (node.type === "leaf") {
		return <CenterGroup groupId={node.groupId} />;
	}

	const autoSaveId = `centerSplit:${node.direction}:${node.children
		.flatMap(leafIds)
		.join("+")}`;

	return (
		<PanelGroup
			direction={node.direction}
			autoSaveId={autoSaveId}
			className="min-h-0 min-w-0"
		>
			{node.children.map((child, index) => {
				const key = leafIds(child).join("+");
				return (
					<Fragment key={key}>
						{index > 0 && <ResizeHandle direction={node.direction} />}
						<Panel minSize={12} className="min-h-0 min-w-0 overflow-hidden">
							<LayoutNodeView node={child} />
						</Panel>
					</Fragment>
				);
			})}
		</PanelGroup>
	);
}

/** 节点下所有叶子的组 id（用来生成稳定的 key / autoSaveId）。 */
function leafIds(node: LayoutNode): string[] {
	return node.type === "leaf" ? [node.groupId] : node.children.flatMap(leafIds);
}

/** 单个编辑器组：标签条 + 内容区（拖拽标签时内容区四边出现分屏落点）。 */
function CenterGroup({ groupId }: { groupId: string }) {
	const isActive = useCenterTabsStoreSelector(
		(s) => s.activeGroupId === groupId,
	);
	const hasSplit = useCenterTabsStoreSelector(
		(s) => Object.keys(s.groups).length > 1,
	);
	const dragging = useCenterTabsStoreSelector((s) => s.draggingTabId !== null);

	const handleFocus = useCallback(() => {
		centerTabsStore.focusGroup(groupId);
	}, [groupId]);

	return (
		<PanelErrorBoundary label="工作区">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: 只用来把焦点归到本组，不承担语义 */}
			<div
				onMouseDownCapture={handleFocus}
				onFocusCapture={handleFocus}
				className={cn(
					"relative flex h-full min-h-0 min-w-0 flex-col",
					// 只有真的分了屏才画活动组指示：没分屏时"活动"是废话，
					// 一条恒亮的边框只是噪音。非活动组同时压暗一档，
					// 让「快捷键/新标签会落在哪」一眼可辨
					hasSplit &&
						(isActive ? "ring-1 ring-inset ring-terracotta/45" : "opacity-90"),
				)}
			>
				<CenterTabBar groupId={groupId} />
				<div className="relative flex min-h-0 flex-1 flex-col">
					<CenterGroupContent groupId={groupId} />
					<CenterGroupDropZones groupId={groupId} dragging={dragging} />
				</div>
			</div>
		</PanelErrorBoundary>
	);
}
