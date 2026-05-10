/**
 * useCommittedValue — 设置字段的统一保存 / 回滚 / 反馈 hook
 *
 * 对应 design.md 第 8 节「保存反馈通用 Hook」与 Requirement R4。
 *
 * 两档模式：
 *   - `mode: "instant"`（开关 / 选择器 / Chip 组 / 滑块）：
 *       · `handleChange(next)` 立即触发 `onCommit`；
 *       · 失败 → UI 回滚到最近一次成功提交值 + `toast.error` + `console.error`；
 *       · 5 秒节流：同一字段连续多次修改只弹一次 toast（对齐 R4.4）。
 *   - `mode: "blur"`（文本 / 数字 / 多行文本）：
 *       · `handleChange(next)` 只更新本地 draft；
 *       · `handleBlur()` / Enter → 触发提交；
 *       · Esc → `reset()`，draft 回滚到最近一次成功提交值（对齐 R4.2）。
 *
 * 所有路径失败时都做：UI 回滚 + `toast.error` + `console.error`（R3.9 / R4.1）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { toast } from "../../ui/Toast";

export type CommitMode = "instant" | "blur";

export interface UseCommittedValueOptions<T> {
	/** 上游权威值（来自 store / getConfig 等）。外部变化时会同步到本地 draft。 */
	value: T;
	/**
	 * 提交函数。`next` 是用户尝试保存的新值；若返回 rejected promise，
	 * hook 会做 UI 回滚 + `toast.error`。
	 */
	onCommit: (next: T) => void | Promise<void>;
	mode: CommitMode;
	/**
	 * 失败 toast 文案，默认 "保存失败"。建议由调用方给一个更具体的中文描述。
	 */
	errorMessage?: string;
	/**
	 * 成功 toast（一般不需要；`instant` 模式下只做静默保存，失败才弹）。
	 * 给一个字符串 → `toast.success(...)`；不传则不弹成功提示。
	 */
	successMessage?: string;
	/**
	 * 5 秒节流窗口（ms）。同一字段在窗口内失败多次只弹一次错误 toast。
	 * 默认 5000。
	 */
	throttleMs?: number;
	/**
	 * 相等性比较。默认 `Object.is`；复杂对象可传自定义比较避免无谓提交。
	 */
	isEqual?: (a: T, b: T) => boolean;
	/** 额外错误回调（在 toast 之前执行，用于自定义上报）。 */
	onError?: (error: unknown) => void;
}

export interface UseCommittedValueReturn<T> {
	/** 当前显示值（instant 模式下等同 value；blur 模式下是本地 draft）。 */
	draft: T;
	/** 是否有未提交的本地修改（仅 blur 模式有意义）。 */
	isDirty: boolean;
	/** 是否有提交正在进行中。 */
	isCommitting: boolean;
	/** 强制触发一次提交（blur 模式下 Enter / 失焦内部会调它）。 */
	commit: () => Promise<void>;
	/** 丢弃本地 draft，恢复到上游值（Esc 对应的行为）。 */
	reset: () => void;
	/** 供表单控件 onChange 使用；instant → 立即 commit；blur → 只更新 draft。 */
	handleChange: (next: T) => void;
	/** 供 blur 模式的 `onBlur` 使用。 */
	handleBlur: () => void;
	/** 供 blur 模式的 `onKeyDown` 使用：Enter 提交 / Esc 回滚。 */
	handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

const DEFAULT_THROTTLE_MS = 5000;

/** 默认相等比较；Object.is 兼顾 NaN 与 +0/-0 边界。 */
function defaultIsEqual<T>(a: T, b: T): boolean {
	return Object.is(a, b);
}

export function useCommittedValue<T>(
	opts: UseCommittedValueOptions<T>,
): UseCommittedValueReturn<T> {
	const {
		value,
		onCommit,
		mode,
		errorMessage = "保存失败",
		successMessage,
		throttleMs = DEFAULT_THROTTLE_MS,
		isEqual = defaultIsEqual,
		onError,
	} = opts;

	const [draft, setDraft] = useState<T>(value);
	const [isCommitting, setIsCommitting] = useState(false);

	// 用 ref 保存最新的 onCommit / isEqual / errorMessage 以避免回调闭包陈旧
	const onCommitRef = useRef(onCommit);
	const isEqualRef = useRef(isEqual);
	const onErrorRef = useRef(onError);
	useEffect(() => {
		onCommitRef.current = onCommit;
	}, [onCommit]);
	useEffect(() => {
		isEqualRef.current = isEqual;
	}, [isEqual]);
	useEffect(() => {
		onErrorRef.current = onError;
	}, [onError]);

	// 上游 value 变化（例如 store 更新或另一个面板写入）→ 同步到本地 draft。
	// 仅当没有本地脏改动时才覆盖，避免打断用户正在输入。
	const dirtyRef = useRef(false);
	useEffect(() => {
		if (!dirtyRef.current) {
			setDraft(value);
		}
	}, [value]);

	// 5 秒节流窗口内的 toast 时间戳
	const lastToastAtRef = useRef<number>(0);

	const showErrorToast = useCallback(
		(msg: string) => {
			const now = Date.now();
			if (now - lastToastAtRef.current < throttleMs) return;
			lastToastAtRef.current = now;
			toast.error(msg);
		},
		[throttleMs],
	);

	const runCommit = useCallback(
		async (next: T) => {
			if (isEqualRef.current(next, value)) {
				// 没有真正变化，跳过。draft 已经由 handleChange 设置过了。
				dirtyRef.current = false;
				return;
			}
			setIsCommitting(true);
			try {
				await Promise.resolve(onCommitRef.current(next));
				// 成功：dirty 清除；draft 保持 next；上游 value 会在下次 effect 中同步。
				dirtyRef.current = false;
				if (successMessage) {
					toast.success(successMessage);
				}
			} catch (error) {
				// 失败：UI 回滚到上游 value + toast.error + console.error + 可选外部回调
				console.error("[useCommittedValue] commit failed:", error);
				onErrorRef.current?.(error);
				setDraft(value);
				dirtyRef.current = false;
				const detail = error instanceof Error ? error.message : String(error);
				showErrorToast(`${errorMessage}：${detail}`);
			} finally {
				setIsCommitting(false);
			}
		},
		[value, errorMessage, successMessage, showErrorToast],
	);

	const handleChange = useCallback(
		(next: T) => {
			setDraft(next);
			if (mode === "instant") {
				dirtyRef.current = true;
				void runCommit(next);
			} else {
				// blur 模式下只标记脏
				dirtyRef.current = !isEqualRef.current(next, value);
			}
		},
		[mode, runCommit, value],
	);

	const handleBlur = useCallback(() => {
		if (mode !== "blur") return;
		if (!dirtyRef.current) return;
		void runCommit(draft);
	}, [mode, draft, runCommit]);

	const reset = useCallback(() => {
		setDraft(value);
		dirtyRef.current = false;
	}, [value]);

	const handleKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLElement>) => {
			if (mode !== "blur") return;
			if (event.key === "Enter") {
				// textarea 下 Shift+Enter 作为换行；仅裸 Enter 触发提交
				const target = event.target as HTMLElement;
				const isTextarea =
					target instanceof HTMLTextAreaElement ||
					target.tagName === "TEXTAREA";
				if (isTextarea && event.shiftKey) return;
				event.preventDefault();
				if (dirtyRef.current) {
					void runCommit(draft);
				}
			} else if (event.key === "Escape") {
				event.preventDefault();
				reset();
			}
		},
		[mode, draft, runCommit, reset],
	);

	const commit = useCallback(async () => {
		await runCommit(draft);
	}, [draft, runCommit]);

	const isDirty = useMemo(
		() => dirtyRef.current || !isEqual(draft, value),
		[draft, value, isEqual],
	);

	return {
		draft,
		isDirty,
		isCommitting,
		commit,
		reset,
		handleChange,
		handleBlur,
		handleKeyDown,
	};
}
