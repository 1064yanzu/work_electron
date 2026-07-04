/**
 * PreviewStatusOverlay - 预览状态覆盖层
 * 三种状态：empty（空）/ error（错误）/ loading-skeleton（骨架屏）
 * 用 SVG 插图替代裸 spinner，给"产品级"沉浸感
 */

import { Globe2, RefreshCw, ServerCrash } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewStatusOverlayProps {
	mode: "empty" | "error" | "skeleton";
	title?: string;
	description?: string;
	errorMessage?: string;
	onRetry?: () => void;
	className?: string;
}

export function PreviewStatusOverlay({
	mode,
	title,
	description,
	errorMessage,
	onRetry,
	className,
}: PreviewStatusOverlayProps) {
	if (mode === "skeleton") {
		return (
			<div
				className={cn(
					"absolute inset-0 z-10 overflow-hidden bg-surface",
					"animate-fade-in",
					className,
				)}
				aria-hidden="true"
			>
				{/* 模拟浏览器内容骨架：navbar + hero + 多列卡片 */}
				<div className="h-full w-full flex flex-col">
					{/* 模拟 navbar */}
					<div className="flex items-center justify-between px-8 py-4 border-b border-border/60">
						<div className="h-5 w-24 rounded skeleton" />
						<div className="flex items-center gap-3">
							<div className="h-3 w-12 rounded skeleton" />
							<div className="h-3 w-12 rounded skeleton" />
							<div className="h-7 w-20 rounded-full skeleton" />
						</div>
					</div>
					{/* 模拟 hero */}
					<div className="flex flex-col items-center justify-center px-8 py-12 gap-4">
						<div className="h-9 w-3/4 max-w-md rounded-lg skeleton" />
						<div className="h-4 w-1/2 max-w-sm rounded skeleton" />
						<div className="h-4 w-2/5 max-w-xs rounded skeleton" />
						<div className="mt-2 h-9 w-32 rounded-full skeleton" />
					</div>
					{/* 模拟卡片栅格 */}
					<div className="px-8 py-4 grid grid-cols-3 gap-4">
						{[0, 1, 2].map((i) => (
							<div
								key={`sk-card-${i}`}
								className="rounded-2xl border border-border/60 p-4 space-y-3 bg-cream-50/40"
							>
								<div className="h-20 rounded-lg skeleton" />
								<div className="h-3 w-2/3 rounded skeleton" />
								<div className="h-3 w-full rounded skeleton" />
								<div className="h-3 w-4/5 rounded skeleton" />
							</div>
						))}
					</div>
				</div>

				{/* 中央加载提示 */}
				<div className="absolute inset-0 flex items-center justify-center bg-surface/40 backdrop-blur-[1.5px]">
					<div className="flex items-center gap-2.5 rounded-full bg-surface/95 dark:bg-cream-900/95 border border-border px-4 py-2 shadow-[0_4px_12px_0_rgba(26,26,25,0.06)]">
						<svg
							className="w-3.5 h-3.5 text-terracotta"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
						>
							<title>加载指示</title>
							<circle
								cx="12"
								cy="12"
								r="9"
								stroke="currentColor"
								strokeWidth="2.4"
								strokeOpacity="0.18"
							/>
							<path
								d="M21 12a9 9 0 0 0-9-9"
								stroke="currentColor"
								strokeWidth="2.4"
								strokeLinecap="round"
								className="origin-center"
								style={{ animation: "spin 0.9s linear infinite" }}
							/>
						</svg>
						<span className="text-xs font-medium text-text-secondary">
							正在加载预览...
						</span>
					</div>
				</div>
			</div>
		);
	}

	if (mode === "error") {
		return (
			<div
				className={cn(
					"absolute inset-0 z-10 flex items-center justify-center",
					"bg-gradient-to-b from-surface to-cream-100/60 dark:from-cream-900 dark:to-cream-900/60",
					"animate-fade-in",
					className,
				)}
			>
				<div className="text-center max-w-sm px-8">
					<div className="mx-auto mb-5 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-error/8 border border-error/20 text-error">
						<ServerCrash className="w-7 h-7" strokeWidth={1.5} />
					</div>
					<h3 className="text-base font-semibold text-text-primary mb-1.5">
						{title || "预览加载失败"}
					</h3>
					<p className="text-xs text-text-secondary leading-relaxed mb-4">
						{description ||
							"无法连接到预览源。可能是开发服务器未启动、目标地址不可达，或当前内容存在错误。"}
					</p>
					{errorMessage ? (
						<div className="mt-3 mb-4 px-3 py-2 rounded-lg bg-cream-200/60 dark:bg-cream-800 border border-border text-[11px] font-mono text-text-secondary text-left break-all max-h-24 overflow-auto">
							{errorMessage}
						</div>
					) : null}
					{onRetry ? (
						<button
							type="button"
							onClick={onRetry}
							className={cn(
								"inline-flex items-center gap-1.5 px-4 py-2 rounded-full",
								"bg-primary text-primary-foreground text-xs font-medium",
								"hover:opacity-92 active:scale-[0.98] transition-all",
								"focus-ring",
							)}
						>
							<RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
							重试加载
						</button>
					) : null}
				</div>
			</div>
		);
	}

	// empty
	return (
		<div
			className={cn(
				"absolute inset-0 z-10 flex items-center justify-center",
				"bg-gradient-to-b from-surface to-cream-100/40 dark:from-cream-900 dark:to-cream-950",
				"animate-fade-in",
				className,
			)}
		>
			<div className="text-center max-w-sm px-8">
				<div className="mx-auto mb-5 relative w-16 h-16">
					<div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cream-200 to-cream-300 dark:from-cream-700 dark:to-cream-800 shadow-[inset_0_1px_2px_rgba(255,255,255,0.6),0_2px_8px_rgba(26,26,25,0.04)]" />
					<div className="absolute inset-0 flex items-center justify-center">
						<Globe2 className="w-7 h-7 text-text-muted" strokeWidth={1.5} />
					</div>
					{/* 装饰性光环 */}
					<div className="absolute -inset-2 rounded-full border border-cream-300/50 dark:border-cream-700/50" />
					<div className="absolute -inset-4 rounded-full border border-cream-300/30 dark:border-cream-700/30" />
				</div>
				<h3 className="text-base font-semibold text-text-primary mb-1.5">
					{title || "暂无可预览内容"}
				</h3>
				<p className="text-xs text-text-secondary leading-relaxed">
					{description ||
						"在地址栏输入 URL，或选择一个 HTML 文件，即可在沙盒内预览运行效果。"}
				</p>
			</div>
		</div>
	);
}
