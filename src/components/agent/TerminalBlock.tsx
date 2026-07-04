/**
 * TerminalBlock - Mac 风格终端组件
 *
 * 用于展示 Bash/Shell 命令执行，采用 macOS 终端风格:
 * - 标题栏带红黄绿按钮
 * - 深色背景，等宽字体
 * - 命令 + 输出/错误展示
 */

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";

interface TerminalBlockProps {
	command: string;
	output?: string;
	error?: string;
	status: "pending" | "running" | "completed" | "error" | "cancelled";
	description?: string;
	className?: string;
}

export default function TerminalBlock({
	command,
	output,
	error,
	status,
	description,
	className,
}: TerminalBlockProps) {
	const isRunning = status === "running";
	const isError = status === "error";
	const isCompleted = status === "completed";

	return (
		<div
			className={cn(
				"rounded-lg overflow-hidden shadow-lg border border-dark-border/50",
				"bg-console dark:bg-console-deep",
				className,
			)}
		>
			{/* Mac 风格标题栏 */}
			<div className="flex items-center gap-2 px-3 py-2 bg-console-bar dark:bg-console-bar-deep border-b border-dark-border/50">
				{/* 红黄绿按钮 */}
				<div className="flex items-center gap-1.5">
					<span className="w-3 h-3 rounded-full bg-traffic-red shadow-inner" />
					<span className="w-3 h-3 rounded-full bg-traffic-yellow shadow-inner" />
					<span className="w-3 h-3 rounded-full bg-traffic-green shadow-inner" />
				</div>

				{/* 标题 */}
				<div className="flex-1 text-center">
					<span className="text-xs text-text-light font-medium">
						{description || "Terminal"}
					</span>
				</div>

				{/* 状态指示器 */}
				<div className="w-4 h-4 flex items-center justify-center">
					{isRunning && (
						<Loader2 className="w-3.5 h-3.5 text-focus animate-spin" />
					)}
					{isCompleted && (
						<CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
					)}
					{isError && <XCircle className="w-3.5 h-3.5 text-error" />}
				</div>
			</div>

			{/* 终端内容区 */}
			<div className="p-3 font-mono text-sm">
				{/* 命令行 */}
				<div className="flex items-start gap-2">
					<span className="text-green-400 select-none flex-shrink-0">$</span>
					<span className="text-surface break-all">{command}</span>
				</div>

				{/* 输出 */}
				{output && (
					<div className="mt-2 text-text-light text-xs leading-relaxed whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
						{output.length > 1000 ? output.slice(0, 1000) + "\n..." : output}
					</div>
				)}

				{/* 错误输出 */}
				{error && (
					<div className="mt-2 text-error text-xs leading-relaxed whitespace-pre-wrap break-all max-h-[150px] overflow-y-auto">
						{error}
					</div>
				)}

				{/* 运行中提示 */}
				{isRunning && !output && !error && (
					<div className="mt-2 flex items-center gap-2 text-text-muted text-xs">
						<span className="inline-block w-2 h-2 bg-warm-500 rounded-full animate-pulse" />
						<span>执行中...</span>
					</div>
				)}
			</div>
		</div>
	);
}
