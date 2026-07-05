/**
 * perfDegraded — 拖拽期间的全局渲染降级开关（F10 玻璃主题降耗）
 *
 * 拖拽分栏 / 拖拽资料卡片时给 <html> 挂 `.perf-degraded` 类，
 * CSS 侧（src/index.css + src/lib/themes/glassTheme.css）据此临时关停
 * backdrop-filter（GPU 重采样是拖拽掉帧的主因），松手立即恢复。
 *
 * 用引用计数支持多个拖拽源并发（如分栏 handle + 卡片拖拽），
 * 任意一个激活即降级，全部释放才恢复。
 */

let activeCount = 0;

export function setPerfDegraded(active: boolean) {
	if (typeof document === "undefined") return;
	activeCount = Math.max(0, activeCount + (active ? 1 : -1));
	document.documentElement.classList.toggle("perf-degraded", activeCount > 0);
}
