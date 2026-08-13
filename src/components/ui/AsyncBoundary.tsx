// AsyncBoundary — loading / error / empty 三态的统一渲染
//
// 背景：项目里几十个组件各写各的 `{loading ? <Spinner/> : error ? <div
// className="text-red-500">{error}</div> : ...}`，样式、文案、重试按钮有无
// 全不一致，且大多数错误分支是裸文本，既不走 token 也没有重试入口。
//
// 这里把三态收敛成一个组件，形状与 react-query 的返回值对齐，
// 迁移时基本是把 `useQuery(...)` 的结果直接摊进 props。
//
// 与 PanelErrorBoundary 的分工：
//   - PanelErrorBoundary 接的是**渲染期抛出的异常**（React error boundary）；
//   - AsyncBoundary 处理的是**数据请求的状态**（loading/error/empty 这三个值）。
//   两者互补，通常 AsyncBoundary 套在 PanelErrorBoundary 里面。

import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { Skeleton } from "./Skeleton";

export interface AsyncBoundaryProps {
	isLoading?: boolean;
	/** 字符串或 Error 均可；null/undefined 表示无错误 */
	error?: string | Error | null;
	/** 为 true 时渲染空态（仅在非 loading、无 error 时生效） */
	isEmpty?: boolean;
	onRetry?: () => void;

	/** 自定义 loading 态；默认三行骨架屏 */
	loadingFallback?: ReactNode;
	/** 自定义空态；给了 emptyTitle 时用默认 EmptyState */
	emptyFallback?: ReactNode;
	emptyTitle?: string;
	emptyDescription?: string;

	errorTitle?: string;
	/** sm 用于行内/卡片内嵌，md 用于面板级 */
	size?: "sm" | "md";

	children: ReactNode;
}

const DEFAULT_LOADING = (
	<div className="space-y-2 p-4">
		<Skeleton className="h-4 w-2/3 rounded-lg" />
		<Skeleton className="h-4 w-full rounded-lg" />
		<Skeleton className="h-4 w-1/2 rounded-lg" />
	</div>
);

export function AsyncBoundary({
	isLoading,
	error,
	isEmpty,
	onRetry,
	loadingFallback,
	emptyFallback,
	emptyTitle,
	emptyDescription,
	errorTitle,
	size = "md",
	children,
}: AsyncBoundaryProps) {
	// 顺序很重要：error 优先于 loading。react-query 在后台重取失败时会同时给出
	// isLoading=true 和 error，先判 loading 会把错误吞掉变成永久转圈。
	if (error) {
		return (
			<ErrorState
				title={errorTitle}
				detail={error}
				onRetry={onRetry}
				size={size}
			/>
		);
	}

	if (isLoading) return <>{loadingFallback ?? DEFAULT_LOADING}</>;

	if (isEmpty) {
		if (emptyFallback) return <>{emptyFallback}</>;
		if (emptyTitle) {
			return (
				<EmptyState
					title={emptyTitle}
					description={emptyDescription}
					size={size}
				/>
			);
		}
	}

	return <>{children}</>;
}
