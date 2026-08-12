/**
 * DevServerStatusBadge - 开发服务器状态徽章
 * 显示模式（dev/static/single）+ 端口 + 状态点（ready/starting/error）
 * 仅在确实存在 previewServer 时渲染
 */

import { cn } from "@/lib/utils";
import type { PreviewServerEntry } from "@/lib/previewServerStore";

interface DevServerStatusBadgeProps {
	server?: PreviewServerEntry;
	className?: string;
}

const modeLabels: Record<string, string> = {
	dev: "dev",
	static: "static",
	single: "single",
};

export function DevServerStatusBadge({
	server,
	className,
}: DevServerStatusBadgeProps) {
	if (!server) return null;
	if (!server.running && !server.error && !server.ready) return null;

	const mode = server.mode ? modeLabels[server.mode] || server.mode : "preview";
	const status: "ready" | "starting" | "error" = server.error
		? "error"
		: server.ready
			? "ready"
			: "starting";

	const statusText =
		status === "ready" ? "就绪" : status === "starting" ? "启动中" : "错误";

	return (
		<div
			className={cn(
				"inline-flex items-center gap-1.5 px-2 py-1 rounded-full",
				"bg-cream-200/80 dark:bg-cream-800/80 border border-cream-400/60 dark:border-cream-700",
				"text-xs font-medium text-text-secondary",
				"transition-colors",
				className,
			)}
			title={
				server.error
					? `服务器错误: ${server.error}`
					: server.url
						? `服务器: ${server.url}`
						: undefined
			}
		>
			<span className="relative flex items-center">
				<span
					className={cn(
						"block w-1.5 h-1.5 rounded-full",
						status === "ready" && "bg-mint-500",
						status === "starting" && "bg-peach-500",
						status === "error" && "bg-error",
					)}
				/>
				{status === "starting" ? (
					<span className="absolute inset-0 flex items-center">
						<span className="block w-1.5 h-1.5 rounded-full bg-peach-500 animate-ping opacity-60" />
					</span>
				) : null}
				{status === "ready" ? (
					<span className="absolute inset-0 flex items-center">
						<span className="block w-1.5 h-1.5 rounded-full bg-mint-500 opacity-50 animate-pulse-slow" />
					</span>
				) : null}
			</span>
			<span className="font-mono tracking-tight">{mode}</span>
			{server.port ? (
				<>
					<span className="text-text-muted">:</span>
					<span className="font-mono tabular-nums text-text-primary">
						{server.port}
					</span>
				</>
			) : null}
			<span className="text-text-muted">·</span>
			<span>{statusText}</span>
		</div>
	);
}
