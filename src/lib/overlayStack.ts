/**
 * 全局 Overlay 层级栈 —— 解决「多层弹层同时响应 Esc」的问题。
 *
 * 背景：FocusTrap / Modal / 权限卡等各自在 document 上挂 keydown，
 * Esc 会让 SettingsModal 与其上的 ConfirmDialog 同时关闭，甚至误触
 * 「Esc = 拒绝权限」。约定：
 *
 * 1. 每个模态 overlay 激活时 push，卸载时 pop；
 * 2. Esc 只由栈顶 overlay 消费（isTopOverlay），并 preventDefault；
 * 3. 非 overlay 的全局 Esc 行为（如权限卡快捷键）先查 hasOpenOverlay()，
 *    有任何弹层打开时让位。
 */

let counter = 0;
const stack: number[] = [];

/** 注册一层 overlay，返回其 id（卸载时用同一 id pop） */
export function pushOverlay(): number {
	counter += 1;
	stack.push(counter);
	return counter;
}

/** 注销 overlay。容忍乱序卸载（React 严格模式/异步卸载） */
export function popOverlay(id: number): void {
	const index = stack.indexOf(id);
	if (index >= 0) stack.splice(index, 1);
}

/** 该 overlay 当前是否位于栈顶（只有栈顶有权消费 Esc） */
export function isTopOverlay(id: number): boolean {
	return stack.length > 0 && stack[stack.length - 1] === id;
}

/** 当前是否有任何 overlay 打开（全局快捷键让位判断用） */
export function hasOpenOverlay(): boolean {
	return stack.length > 0;
}
