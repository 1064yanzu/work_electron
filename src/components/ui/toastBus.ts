/**
 * toastBus —— 无 UI 依赖的全局 Toast 事件单例。
 *
 * ## 为什么从 Toast.tsx 拆出来
 *
 * `toast` 被 240+ 处调用，其中不少调用方是纯逻辑层（slashCommands、store、
 * service）。此前它们 import Toast.tsx 时会连带拖入 React 渲染器与
 * `lib/motion`（gsap）——这条链在 Node 环境（node:test）下直接崩溃
 * （gsap 的 CJS 包在 Node ESM 下没有具名导出），也让逻辑层背上了不必要的
 * UI 依赖。
 *
 * 拆分后：
 * - 逻辑层可以只 import 本文件（零 React / 零 gsap）；
 * - Toast.tsx 在模块加载时通过 `registerToastRenderer` 回注册挂载函数；
 * - 若调用 `toast.show()` 时渲染器尚未注册（调用方只引了 bus），
 *   动态 import Toast.tsx 完成注册后再派发，行为与之前完全一致。
 * - Toast.tsx 继续 re-export `toast`，既有 import 路径不受影响。
 */

export type ToastType = "success" | "error" | "info" | "warning";
export type ToastActionVariant = "default" | "primary" | "danger";

export interface ToastOptions {
	type?: ToastType;
	duration?: number;
	closable?: boolean;
	actionLabel?: string;
	onAction?: () => void | Promise<void>;
	actionVariant?: ToastActionVariant;
}

export interface ToastItem {
	id: string;
	message: string;
	type: ToastType;
	duration: number;
	closable: boolean;
	actionLabel?: string;
	onAction?: () => void | Promise<void>;
	actionVariant: ToastActionVariant;
}

export const TOAST_EVENT_NAME = "show-toast";

/** 幂等的容器挂载函数，由 Toast.tsx 在模块加载时注册 */
type ToastRenderer = () => void;

let renderer: ToastRenderer | null = null;

export function registerToastRenderer(fn: ToastRenderer): void {
	renderer = fn;
}

function buildPayload(message: string, options: ToastOptions): ToastItem {
	const id =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return {
		id,
		message,
		type: options.type || "info",
		duration: options.duration ?? 3000,
		closable: options.closable ?? true,
		actionLabel: options.actionLabel,
		onAction: options.onAction,
		actionVariant: options.actionVariant ?? "default",
	};
}

class ToastAPI {
	private dispatch(payload: ToastItem) {
		if (typeof window === "undefined") return;
		window.dispatchEvent(
			new CustomEvent(TOAST_EVENT_NAME, { detail: payload }),
		);
	}

	show(message: string, options: ToastOptions = {}) {
		const payload = buildPayload(message, options);
		if (renderer) {
			renderer();
			this.dispatch(payload);
			return;
		}
		// 渲染器尚未注册：调用方只 import 了 bus。动态引入组件模块
		// （其模块副作用会调用 registerToastRenderer）后再派发。
		void import("./Toast")
			.then(() => {
				renderer?.();
				this.dispatch(payload);
			})
			.catch(() => {
				// 非浏览器环境（测试）下加载渲染器失败：静默丢弃
			});
	}

	success(message: string, duration = 3000) {
		this.show(message, { type: "success", duration });
	}

	error(message: string, duration = 5000) {
		this.show(message, { type: "error", duration });
	}

	/**
	 * 错误 + 一键重试。retry 异步函数会在按下"再试一次"时调用，
	 * 抛错则再弹一个普通 error toast（避免无限重试循环）。
	 */
	errorWithRetry(
		message: string,
		retry: () => void | Promise<void>,
		options: { duration?: number; actionLabel?: string } = {},
	) {
		this.show(message, {
			type: "error",
			duration: options.duration ?? 6000,
			actionLabel: options.actionLabel ?? "再试一次",
			actionVariant: "danger",
			onAction: async () => {
				try {
					await retry();
				} catch (e) {
					this.show(`重试失败：${e instanceof Error ? e.message : String(e)}`, {
						type: "error",
						duration: 5000,
					});
				}
			},
		});
	}

	info(message: string, duration = 3000) {
		this.show(message, { type: "info", duration });
	}

	warning(message: string, duration = 4000) {
		this.show(message, { type: "warning", duration });
	}
}

export const toast = new ToastAPI();
