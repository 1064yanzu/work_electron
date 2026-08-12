/**
 * 中栏分屏布局树的纯算法。
 *
 * 与 `centerTabsStore` 分开，是因为这部分是**没有任何副作用的树代数**：
 * 拆分、剪枝、折叠。它也是整套分屏里最容易写错的地方（少折叠一层单孩子 split
 * 就会留下一个永远拖不动的分隔条），单独成文件才能脱离 store 与浏览器环境
 * 直接测。
 */

/** 分屏方向。horizontal = 左右并排，vertical = 上下并排。 */
export type SplitDirection = "horizontal" | "vertical";

/** 布局树节点。 */
export type LayoutNode =
	| { type: "leaf"; groupId: string }
	| { type: "split"; direction: SplitDirection; children: LayoutNode[] };

/** 深度优先收集树里的全部组 id（也就是各分屏从左上到右下的顺序）。 */
export function collectGroupIds(node: LayoutNode): string[] {
	if (node.type === "leaf") return [node.groupId];
	return node.children.flatMap(collectGroupIds);
}

/**
 * 剪枝：摘掉不在 `keep` 里的叶子，并折叠只剩一个孩子的 split。
 *
 * 折叠是必须的——一个只有一个孩子的 PanelGroup 会渲染出一条无处可拖的分隔条，
 * 而且下一次同方向拆分会把树越叠越深。全部叶子都被摘掉时返回 null，
 * 由调用方决定兜底。
 */
export function pruneLayout(
	node: LayoutNode,
	keep: Set<string>,
): LayoutNode | null {
	if (node.type === "leaf") return keep.has(node.groupId) ? node : null;
	const children = node.children
		.map((child) => pruneLayout(child, keep))
		.filter((child): child is LayoutNode => child !== null);
	if (children.length === 0) return null;
	if (children.length === 1) return children[0];
	return { ...node, children };
}

/**
 * 在树里把某个叶子拆成「原叶子 + 新叶子」。
 *
 * 若该叶子的父级正好是同方向的 split，就把新叶子插到兄弟位（保持树扁平，
 * 与 VSCode 一致）；否则在原地长出一层新的 split。不这么做的话连拆三次
 * 就是三层嵌套，分隔条的拖动范围与尺寸分配都会变得难以预期。
 *
 * 找不到目标叶子时原样返回（不抛错：调用方可能正好在并发关组）。
 */
export function splitAt(
	node: LayoutNode,
	targetGroupId: string,
	newGroupId: string,
	direction: SplitDirection,
	before: boolean,
): LayoutNode {
	if (node.type === "leaf") {
		if (node.groupId !== targetGroupId) return node;
		const leaf: LayoutNode = { type: "leaf", groupId: newGroupId };
		return {
			type: "split",
			direction,
			children: before ? [leaf, node] : [node, leaf],
		};
	}

	// 同方向的父级：直接插兄弟，避免嵌套
	if (node.direction === direction) {
		const index = node.children.findIndex(
			(child) => child.type === "leaf" && child.groupId === targetGroupId,
		);
		if (index >= 0) {
			const children = [...node.children];
			children.splice(before ? index : index + 1, 0, {
				type: "leaf",
				groupId: newGroupId,
			});
			return { ...node, children };
		}
	}

	return {
		...node,
		children: node.children.map((child) =>
			splitAt(child, targetGroupId, newGroupId, direction, before),
		),
	};
}

/** 树的最大嵌套深度（调试与断言用）。 */
export function layoutDepth(node: LayoutNode): number {
	if (node.type === "leaf") return 1;
	return 1 + Math.max(...node.children.map(layoutDepth));
}
