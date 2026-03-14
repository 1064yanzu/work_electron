/**
 * 权限请求卡片 - 嵌入聊天流的内联版本
 *
 * 展示工具调用的权限请求，支持按工具类型展示可读化的摘要，
 * 同时提供允许 / 拒绝操作。可作为聊天流内的内联卡片使用。
 */
import {
	Code2,
	FileEdit,
	Globe,
	ShieldAlert,
	ShieldCheck,
	ShieldX,
	Terminal,
	Timer,
	X,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { SessionPermissionRequest } from "../../../lib/stores/codingSessionTypes";

interface PermissionRequestCardProps {
	request: SessionPermissionRequest;
	onResolve: (requestId: string, allow: boolean) => void;
	/** 是否以内联模式显示（无边距、无圆角，适合嵌入聊天流） */
	inline?: boolean;
}

// 按工具名映射图标
function getToolIcon(toolName: string) {
	const name = toolName.toLowerCase();
	if (name.includes("bash") || name.includes("cmd") || name.includes("exec")) {
		return Terminal;
	}
	if (
		name.includes("write") ||
		name.includes("edit") ||
		name.includes("patch") ||
		name.includes("create")
	) {
		return FileEdit;
	}
	if (
		name.includes("read") ||
		name.includes("view") ||
		name.includes("str_replace")
	) {
		return Code2;
	}
	if (
		name.includes("web") ||
		name.includes("fetch") ||
		name.includes("http") ||
		name.includes("url")
	) {
		return Globe;
	}
	return Zap;
}

// 生成工具可读摘要
function getToolSummary(
	toolName: string,
	toolInput: Record<string, unknown>,
): string | null {
	const name = toolName.toLowerCase();

	if (name === "bash" && typeof toolInput.command === "string") {
		return toolInput.command.slice(0, 120);
	}
	if (
		(name.includes("write") || name.includes("create")) &&
		typeof toolInput.path === "string"
	) {
		return toolInput.path;
	}
	if (name.includes("edit") && typeof toolInput.path === "string") {
		return toolInput.path;
	}
	if (name === "read" && typeof toolInput.path === "string") {
		return toolInput.path;
	}
	if (name.includes("glob") && typeof toolInput.pattern === "string") {
		return toolInput.pattern;
	}
	if (name.includes("grep") && typeof toolInput.pattern === "string") {
		return toolInput.pattern;
	}
	if (name.includes("web") || name.includes("fetch")) {
		if (typeof toolInput.url === "string") return toolInput.url.slice(0, 120);
	}
	return null;
}

export function PermissionRequestCard({
	request,
	onResolve,
	inline = false,
}: PermissionRequestCardProps) {
	const [timeRemaining, setTimeRemaining] = useState(() =>
		Math.max(0, Math.round((request.expiresAt - Date.now()) / 1000)),
	);
	const [resolved, setResolved] = useState<"allow" | "deny" | null>(null);

	// 倒计时
	useEffect(() => {
		if (resolved) return;
		const interval = setInterval(() => {
			const remaining = Math.max(
				0,
				Math.round((request.expiresAt - Date.now()) / 1000),
			);
			setTimeRemaining(remaining);
			if (remaining === 0) {
				clearInterval(interval);
				setResolved("deny");
			}
		}, 1000);
		return () => clearInterval(interval);
	}, [request.expiresAt, resolved]);

	const handleResolve = (allow: boolean) => {
		setResolved(allow ? "allow" : "deny");
		onResolve(request.requestId, allow);
	};

	const ToolIcon = getToolIcon(request.toolName);
	const summary = getToolSummary(request.toolName, request.toolInput);
	const isExpired = timeRemaining === 0 && !resolved;

	const wrapperClass = inline
		? "rounded-xl border overflow-hidden"
		: "mx-4 mb-3 rounded-xl border overflow-hidden shadow-sm";

	// 已解决状态
	if (resolved) {
		const isAllowed = resolved === "allow";
		return (
			<div
				className={`${wrapperClass} ${
					isAllowed
						? "border-emerald-200/60 bg-emerald-50/60 dark:border-emerald-700/30 dark:bg-emerald-900/10"
						: "border-zinc-200/60 bg-zinc-50/60 dark:border-zinc-700/30 dark:bg-zinc-800/20"
				}`}
			>
				<div className="flex items-center gap-2.5 px-4 py-2.5">
					{isAllowed ? (
						<ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
					) : (
						<ShieldX className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
					)}
					<span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
						{request.toolName}
					</span>
					{summary && (
						<span className="flex-1 truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
							{summary}
						</span>
					)}
					<span
						className={`text-[11px] font-medium ${
							isAllowed
								? "text-emerald-600 dark:text-emerald-400"
								: "text-zinc-400"
						}`}
					>
						{isAllowed ? "已允许" : "已拒绝"}
					</span>
				</div>
			</div>
		);
	}

	return (
		<div
			className={`${wrapperClass} ${
				isExpired
					? "border-zinc-200/60 dark:border-zinc-700/30"
					: "border-amber-300/60 dark:border-amber-500/30"
			} bg-amber-50/70 dark:bg-amber-900/10 animate-in slide-in-from-bottom-1 duration-200`}
		>
			{/* 头部 */}
			<div className="flex items-center gap-2.5 border-b border-amber-200/50 px-4 py-3 dark:border-amber-700/20">
				<ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
				<span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
					权限请求
				</span>
				<div className="flex items-center gap-1.5 rounded-md bg-amber-100/70 px-2 py-0.5 dark:bg-amber-900/30">
					<ToolIcon className="h-3 w-3 text-amber-700 dark:text-amber-400" />
					<code className="text-[11px] font-mono font-medium text-amber-800 dark:text-amber-300">
						{request.toolName}
					</code>
				</div>
				<div className="flex-1" />
				<div className="flex items-center gap-1 text-[11px] tabular-nums text-amber-500">
					<Timer className="h-3 w-3" />
					{timeRemaining}s
				</div>
			</div>

			{/* 内容 */}
			<div className="px-4 py-3 space-y-2">
				{/* 描述 */}
				{request.description && (
					<p className="text-xs text-zinc-600 dark:text-zinc-400">
						{request.description}
					</p>
				)}

				{/* 摘要（可读化） */}
				{summary && (
					<div className="rounded-lg bg-white/60 px-3 py-2 dark:bg-black/20">
						<pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
							{summary.length > 300 ? `${summary.slice(0, 300)}…` : summary}
						</pre>
					</div>
				)}

				{/* 完整输入（折叠） */}
				{!summary && Object.keys(request.toolInput).length > 0 && (
					<details className="group">
						<summary className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
							查看输入参数
						</summary>
						<pre className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/50 px-3 py-2 font-mono text-[11px] text-zinc-600 dark:bg-black/20 dark:text-zinc-400">
							{JSON.stringify(request.toolInput, null, 2).slice(0, 800)}
						</pre>
					</details>
				)}
			</div>

			{/* 按钮区 */}
			<div className="flex items-center gap-2 border-t border-amber-200/50 px-4 py-3 dark:border-amber-700/20">
				<button
					type="button"
					onClick={() => handleResolve(false)}
					className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
				>
					<X className="h-3 w-3" />
					拒绝
				</button>
				<button
					type="button"
					onClick={() => handleResolve(true)}
					className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-all hover:bg-emerald-700 active:scale-95"
				>
					<ShieldCheck className="h-3 w-3" />
					允许
				</button>
				<p className="ml-auto text-[10px] text-zinc-400">超时将自动拒绝</p>
			</div>
		</div>
	);
}
