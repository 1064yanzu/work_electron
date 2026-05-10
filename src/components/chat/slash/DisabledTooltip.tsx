/**
 * Claude Code 风格斜杠命令 —— 禁用态 Tooltip（T7.4）。
 *
 * 职责：
 * - 在命令条目 hover / focus 300ms 后展示 `disabled.reason`；
 * - 移出立即消失（避免残留）；
 * - 不使用原生 `title`（与菜单的键盘导航冲突）。
 *
 * 设计约束：
 * - 渲染为兄弟节点的 absolute 小气泡，位于被包裹元素的正上方偏右。
 * - 不引入额外依赖，仅使用 Tailwind 类。
 */

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

interface DisabledTooltipProps {
	reason: string;
	children: ReactNode;
}

const SHOW_DELAY_MS = 300;
const MAX_REASON_LENGTH = 120;

export function DisabledTooltip({ reason, children }: DisabledTooltipProps) {
	const [visible, setVisible] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const scheduleShow = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			setVisible(true);
		}, SHOW_DELAY_MS);
	}, []);

	const hide = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setVisible(false);
	}, []);

	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[],
	);

	// 对超长原因做二次兜底裁剪（Registry 已告警，但防御性处理保证视觉不破坏）
	const safeReason =
		reason.length > MAX_REASON_LENGTH
			? `${reason.slice(0, MAX_REASON_LENGTH - 1)}…`
			: reason;

	return (
		<div
			className="relative"
			onMouseEnter={scheduleShow}
			onMouseLeave={hide}
			onFocus={scheduleShow}
			onBlur={hide}
		>
			{children}
			{visible && (
				<div
					role="tooltip"
					className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-[60] whitespace-pre-wrap max-w-[240px] px-2.5 py-1.5 rounded-md bg-[#1f1f1f] dark:bg-[#111] text-[11px] leading-snug text-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
				>
					{safeReason}
				</div>
			)}
		</div>
	);
}
