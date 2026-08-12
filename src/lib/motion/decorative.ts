/**
 * decorative —— 装饰性动画注册表。
 *
 * 「装饰性」= 无限循环的呼吸/光晕/流动这类**不承载信息**的动画。它们在
 * 拖拽分栏、拖拽卡片这些对帧率最敏感的时刻应该让路。
 *
 * 复用现有的 `src/lib/interaction/perfDegraded.ts` 语义：拖拽开始给 `<html>`
 * 挂 `.perf-degraded`（引用计数，多拖拽源并发安全），这里监听同一个类名，
 * 把注册过的循环动画 `pause()`，松手 `resume()`。
 *
 * 只管循环动画：一次性的入场/出场补间本来就短，暂停它们反而会看到半截状态。
 */
// gsap 的类型包声明了全局 `gsap` 命名空间（node_modules/gsap/types/animation.d.ts），
// 直接引用即可；默认导入 `import type gsapTypes from "gsap"` 拿到的是值的类型，
// 不能当命名空间用（`gsapTypes.core.Animation` 会报 TS2503）。
type Animation = gsap.core.Animation;

const registry = new Set<Animation>();
let degraded = false;

/**
 * 注册一个循环装饰动画，返回注销函数。
 * 典型用法：`useGsapMotion` 内部 `return registerDecorative(tl)`。
 */
export function registerDecorative(animation: Animation): () => void {
	registry.add(animation);
	if (degraded) animation.pause();
	return () => {
		registry.delete(animation);
	};
}

function setDegraded(next: boolean): void {
	if (next === degraded) return;
	degraded = next;
	for (const animation of registry) {
		if (next) {
			animation.pause();
		} else {
			animation.resume();
		}
	}
}

if (
	typeof document !== "undefined" &&
	typeof MutationObserver !== "undefined"
) {
	const root = document.documentElement;
	const sync = () => setDegraded(root.classList.contains("perf-degraded"));
	sync();
	new MutationObserver(sync).observe(root, {
		attributes: true,
		attributeFilter: ["class"],
	});
}
