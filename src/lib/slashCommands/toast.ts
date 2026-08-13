/**
 * Claude Code 风格斜杠命令 —— Toast 适配层。
 *
 * 任务：T2.2。
 *
 * 设计要点：
 * 1. 底层复用 `src/components/ui/Toast.tsx` 的全局单例 `toast`，不引入新的
 *    Toast 渲染器（保持唯一事实源）。
 * 2. 暴露 `showLoading(key)` 返回的 `handle` 具备 `replaceSuccess` /
 *    `replaceFailed` 两个方法，支持后续状态替换（loading → success/failed）。
 * 3. **200ms 延迟规则**：`showLoading` 调用时并不立即出 Toast，而是挂一个 200ms
 *    定时器；如果在 200ms 内已经调用 `replaceSuccess` / `replaceFailed` / `dismiss`，
 *    则**根本不显示 loading**（避免闪烁）。
 * 4. 失败态支持 `retryable` 透传，直接走底层 `toast.errorWithRetry`。
 * 5. `notify.info/success/error` 是直通封装，供命令侧直接使用。
 *
 * 注意：底层 Toast 是按 message 内容做事件分发的，**没有提供按 id 关闭的能力**。
 * 本适配层用以下策略保持"替换"语义：
 *   - loading 期间：只在计时器上记录"是否已经展示过 loading"；
 *   - 收到 replace* 调用时：如果 loading 未展示则直接出新 Toast；已展示则弹新的
 *     success/failed Toast（底层 loading 会按自己的 duration 自动消失）。
 * 这符合任务所述"成功替换 / 失败替换"的用户体验目标：用户看到的先是短暂的 loading，
 * 然后是最终态 Toast。
 */

import { toast } from "../../components/ui/toastBus";

// ---------------------------------------------------------------------------
// 参数与返回类型
// ---------------------------------------------------------------------------

/** loading / success / failed 的最小句柄。 */
export interface LoadingToastHandle {
	/** 替换为成功态。 */
	replaceSuccess(message: string): void;
	/** 替换为失败态（可选 retryable）。 */
	replaceFailed(
		message: string,
		options?: {
			retryable?: boolean;
			onRetry?: () => void | Promise<void>;
			actionLabel?: string;
		},
	): void;
	/** 主动取消；若 loading 未显示，相当于啥也没发生。 */
	dismiss(): void;
}

// ---------------------------------------------------------------------------
// 内部：延迟出 loading
// ---------------------------------------------------------------------------

/** loading toast 延迟显示阈值（ms）；与任务约定一致。 */
const LOADING_DELAY_MS = 200;

/** loading toast 的默认显示时长：0 = 不会自动消失，直到被替换或 dismiss。 */
const LOADING_DURATION_MS = 0;

/**
 * 创建一个带 200ms 延迟的 loading 句柄。
 *
 * 返回的 `handle` 满足：
 * - 首次调用 `replaceSuccess` / `replaceFailed` 之前若未超过 200ms，loading 不会出现；
 * - 超过 200ms 则 loading 出现；后续 replace* 再弹新 Toast。
 */
export function showLoading(message: string): LoadingToastHandle {
	let settled = false;

	const timer = setTimeout(() => {
		if (settled) return;
		// loading 阶段用 `info` 视觉，带无限 duration，等待 replace* 出终态
		toast.show(message, {
			type: "info",
			duration: LOADING_DURATION_MS,
			closable: true,
		});
	}, LOADING_DELAY_MS);

	const settle = (): boolean => {
		if (settled) return false;
		settled = true;
		clearTimeout(timer);
		return true;
	};

	return {
		replaceSuccess(successMessage: string): void {
			if (!settle()) return;
			// 无论 loading 是否已显示，都弹一条成功 Toast；底层 loading（若已显示）
			// 会被用户手动关闭或被后续 Toast 覆盖视线焦点。
			toast.success(successMessage);
		},
		replaceFailed(
			failedMessage: string,
			options?: {
				retryable?: boolean;
				onRetry?: () => void | Promise<void>;
				actionLabel?: string;
			},
		): void {
			if (!settle()) return;
			if (options?.retryable && options.onRetry) {
				toast.errorWithRetry(failedMessage, options.onRetry, {
					actionLabel: options.actionLabel,
				});
			} else {
				toast.error(failedMessage);
			}
		},
		dismiss(): void {
			settle();
		},
	};
}

// ---------------------------------------------------------------------------
// 直通封装
// ---------------------------------------------------------------------------

/**
 * 即时型 Toast 封装；命令侧直接调用，语义清晰。
 */
export const notify = {
	info(message: string): void {
		toast.info(message);
	},
	success(message: string): void {
		toast.success(message);
	},
	error(message: string): void {
		toast.error(message);
	},
	errorWithRetry(
		message: string,
		retry: () => void | Promise<void>,
		options?: { actionLabel?: string },
	): void {
		toast.errorWithRetry(message, retry, options);
	},
};
