/**
 * 原生视图占位登记表 —— 给 DOM 浮层用来避让 `WebContentsView`。
 *
 * ## 为什么需要它
 *
 * 内嵌 Web AI 站点用的是 Electron 的 `WebContentsView`，它由**合成器**直接画在
 * 整个 BrowserWindow 的 DOM 之上。这意味着 z-index 在它面前完全失效：
 * `z-[9999]` 的 tooltip、下拉菜单、popover，只要位置落在原生视图的矩形里，
 * 就会被整块盖住——用户看到的是一条黑边（浮层露出来的那几个像素）。
 *
 * 已有的应对是「浮层出现就把原生视图摘掉」（`data-native-overlay`），对模态框
 * 是对的，但对一个 400ms 延迟的悬停提示就太重了：网页会闪出去再闪回来。
 *
 * 所以这里提供第二条路：把原生视图的矩形登记出来，浮层自己**翻到另一侧**去，
 * 既不遮挡也不需要摘视图。
 *
 * 不用 createStore 是因为消费方（Tooltip）只在弹出的那一刻同步读一次，
 * 不需要订阅与重渲染。
 */

export interface NativeViewRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** 浮层自身的矩形（视口坐标）。 */
export interface OverlayBox {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** key → 矩形。key 用来区分多个原生视图（目前只有 aihub 一个）。 */
const rects = new Map<string, NativeViewRect>();

/**
 * 登记 / 更新某个原生视图的位置。传 null 表示它已经不在窗口上了。
 *
 * 调用方必须在**摘掉视图时也调一次 null**，否则浮层会继续避让一块
 * 其实已经空出来的区域。
 */
export function setNativeViewRect(
	key: string,
	rect: NativeViewRect | null,
): void {
	if (rect && rect.width > 0 && rect.height > 0) {
		rects.set(key, rect);
	} else {
		rects.delete(key);
	}
}

/** 当前所有原生视图的矩形。 */
export function getNativeViewRects(): NativeViewRect[] {
	return [...rects.values()];
}

/** 给定矩形是否与任何原生视图重叠（重叠即会被盖住）。 */
export function intersectsNativeView(box: OverlayBox): boolean {
	for (const rect of rects.values()) {
		const overlapX = box.left < rect.x + rect.width && box.right > rect.x;
		const overlapY = box.top < rect.y + rect.height && box.bottom > rect.y;
		if (overlapX && overlapY) return true;
	}
	return false;
}
