/**
 * 权限审批浮窗 - 工具名、输入预览、Allow/Deny 按钮
 */
import { ShieldAlert, Check, X } from "lucide-react";
import type { SessionPermissionRequest } from "../../../lib/stores/codingSessionTypes";

interface PermissionDialogProps {
	request: SessionPermissionRequest;
	onResolve: (requestId: string, allow: boolean) => void;
}

export function PermissionDialog({
	request,
	onResolve,
}: PermissionDialogProps) {
	const inputPreview = JSON.stringify(request.toolInput, null, 2);
	const timeRemaining = Math.max(
		0,
		Math.round((request.expiresAt - Date.now()) / 1000),
	);

	return (
		<div className="mx-4 mb-4 rounded-xl border border-amber-300/50 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-900/20 backdrop-blur-sm shadow-lg overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
			{/* 头部 */}
			<div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200/50 dark:border-amber-700/30">
				<ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
				<span className="text-sm font-medium text-amber-800 dark:text-amber-300">
					权限请求
				</span>
				<div className="flex-1" />
				<span className="text-[10px] text-amber-500 tabular-nums">
					{timeRemaining}s
				</span>
			</div>

			{/* 内容 */}
			<div className="px-4 py-3 space-y-2">
				<div className="flex items-center gap-2">
					<span className="text-xs text-zinc-500">工具：</span>
					<code className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200">
						{request.toolName}
					</code>
				</div>

				{request.description && (
					<p className="text-xs text-zinc-600 dark:text-zinc-400">
						{request.description}
					</p>
				)}

				<pre className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 bg-white/50 dark:bg-black/20 rounded-lg px-3 py-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
					{inputPreview.slice(0, 1000)}
				</pre>
			</div>

			{/* 操作按钮 */}
			<div className="flex items-center gap-2 px-4 py-3 border-t border-amber-200/50 dark:border-amber-700/30">
				<button
					onClick={() => onResolve(request.requestId, false)}
					className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
				>
					<X className="w-3 h-3" />
					拒绝
				</button>
				<button
					onClick={() => onResolve(request.requestId, true)}
					className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all"
				>
					<Check className="w-3 h-3" />
					允许
				</button>
			</div>
		</div>
	);
}
