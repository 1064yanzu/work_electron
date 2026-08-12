// ErrorState — 统一错误态（风格对齐 EmptyState，全 token 化）
//
// sm 用于行内/卡片内嵌，md 用于面板级。配 PanelErrorBoundary 使用，
// 也可在各组件的 [error, setError] 分支中直接替换手写错误 UI。

import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "../../lib/utils";

export interface ErrorStateProps {
	title?: string;
	/** 错误详情：字符串或 Error（展示 message） */
	detail?: string | Error;
	onRetry?: () => void;
	retryLabel?: string;
	size?: "sm" | "md";
	className?: string;
}

const sizeStyles = {
	sm: {
		container: "py-6 gap-2",
		iconWrapper: "w-9 h-9 rounded-xl",
		icon: "w-[18px] h-[18px]",
		title: "text-[13px]",
		detail: "text-[11.5px] max-w-[320px]",
		button: "text-[12px] px-3 py-1.5",
	},
	md: {
		container: "py-12 gap-3",
		iconWrapper: "w-12 h-12 rounded-2xl",
		icon: "w-5 h-5",
		title: "text-[14.5px]",
		detail: "text-[12.5px] max-w-[400px]",
		button: "text-[12.5px] px-3.5 py-2",
	},
};

export function ErrorState({
	title = "出了点问题",
	detail,
	onRetry,
	retryLabel = "重试",
	size = "md",
	className,
}: ErrorStateProps) {
	const styles = sizeStyles[size];
	const detailText =
		detail instanceof Error ? detail.message : detail?.trim() || null;

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center text-center animate-in fade-in duration-150",
				styles.container,
				className,
			)}
			role="alert"
		>
			<div
				className={cn(
					"flex items-center justify-center bg-error-muted text-error shrink-0",
					styles.iconWrapper,
				)}
			>
				<AlertTriangle className={styles.icon} strokeWidth={1.5} />
			</div>
			<div className="space-y-1">
				<div className={cn("font-medium text-text-primary", styles.title)}>
					{title}
				</div>
				{detailText ? (
					<div
						className={cn(
							"text-text-muted leading-relaxed break-words",
							styles.detail,
						)}
					>
						{detailText}
					</div>
				) : null}
			</div>
			{onRetry ? (
				<button
					type="button"
					onClick={onRetry}
					className={cn(
						"inline-flex items-center gap-1.5 rounded-xl font-medium",
						"text-text-primary bg-warm-200 border border-border",
						"hover:bg-warm-300 transition-colors active:scale-[0.98]",
						styles.button,
					)}
				>
					<RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
					{retryLabel}
				</button>
			) : null}
		</div>
	);
}
