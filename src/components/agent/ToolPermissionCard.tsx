/**
 * Tool Permission Card Component
 *
 * 工具权限审批卡片,显示工具调用详情并提供允许/拒绝操作。
 * 采用简洁的设计风格,与 SkillCard 保持一致。
 */

import { ChevronDown, ChevronRight, Shield } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
	type ToolPermissionRequest,
	toolPermissionStore,
} from "../../lib/agent/toolPermissionStore";
import { cn } from "../../lib/utils";

interface ToolPermissionCardProps {
	request: ToolPermissionRequest;
	onAllow: (id: string) => void;
	onDeny: (id: string) => void;
}

/**
 * 格式化工具输入显示
 */
function formatToolInput(input: Record<string, unknown>): string {
	try {
		const str = JSON.stringify(input, null, 2);
		// 限制显示长度
		if (str.length > 500) {
			return str.slice(0, 500) + "\n... (truncated)";
		}
		return str;
	} catch {
		return String(input);
	}
}

/**
 * 获取工具描述
 */
function getToolDescription(toolName: string): string {
	const descriptions: Record<string, string> = {
		Read: "读取文件内容",
		Write: "创建新文件",
		Edit: "修改现有文件",
		Bash: "执行终端命令",
		Glob: "搜索文件",
		Grep: "搜索文件内容",
		WebSearch: "网络搜索",
		WebFetch: "获取网页内容",
		Skill: "调用技能",
	};
	return descriptions[toolName] || "执行工具";
}

/**
 * 工具权限卡片
 */
export const ToolPermissionCard: React.FC<ToolPermissionCardProps> = ({
	request,
	onAllow,
	onDeny,
}) => {
	const [expanded, setExpanded] = useState(false);
	const [remainingTime, setRemainingTime] = useState(30);

	// 倒计时
	useEffect(() => {
		const interval = setInterval(() => {
			const remaining = Math.max(
				0,
				Math.ceil((request.expiresAt - Date.now()) / 1000),
			);
			setRemainingTime(remaining);
			if (remaining === 0) {
				clearInterval(interval);
			}
		}, 1000);
		return () => clearInterval(interval);
	}, [request.expiresAt]);

	const inputPreview = useMemo(
		() => formatToolInput(request.toolInput),
		[request.toolInput],
	);
	const isSubmitting =
		request.status === "submitting-allow" ||
		request.status === "submitting-deny";

	const isUrgent = remainingTime <= 10;

	return (
		<div
			className={cn(
				"rounded-xl overflow-hidden transition-all duration-300 shadow-sm",
				"bg-white/80 dark:bg-zinc-900/60",
				isUrgent
					? "ring-2 ring-amber-200/50 dark:ring-amber-800/30"
					: "ring-2 ring-blue-200/50 dark:ring-blue-800/30",
			)}
		>
			{/* 头部 */}
			<div className="flex items-center justify-between px-3 py-2.5">
				<div className="flex items-center gap-2.5 min-w-0 flex-1">
					<div
						className={cn(
							"p-1.5 rounded-lg transition-all duration-200",
							isUrgent
								? "bg-amber-50 dark:bg-amber-900/20"
								: "bg-blue-50 dark:bg-blue-900/20",
						)}
					>
						<Shield
							className={cn(
								"w-4 h-4 transition-colors",
								isUrgent
									? "text-amber-600 dark:text-amber-400"
									: "text-blue-600 dark:text-blue-400",
							)}
						/>
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
								{request.toolName}
							</span>
							<span className="text-[11px] text-zinc-400">
								{getToolDescription(request.toolName)}
							</span>
						</div>
					</div>
				</div>
				<div
					className={cn(
						"text-sm font-medium tabular-nums",
						isUrgent ? "text-amber-600 dark:text-amber-400" : "text-zinc-500",
					)}
				>
					{remainingTime}s
				</div>
			</div>

			{/* 参数预览 */}
			<div className="px-3 pb-2">
				<button
					onClick={() => setExpanded(!expanded)}
					className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
				>
					{expanded ? (
						<ChevronDown className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
					) : (
						<ChevronRight className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
					)}
					<span className="text-xs text-zinc-500 dark:text-zinc-400">
						参数预览
					</span>
				</button>
				{expanded && (
					<pre className="mt-2 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 text-[11px] text-zinc-600 dark:text-zinc-400 overflow-x-auto max-h-60 overflow-y-auto border border-zinc-200/50 dark:border-zinc-700/50">
						{inputPreview}
					</pre>
				)}
			</div>

			{/* 操作按钮 */}
			<div className="flex gap-2 px-3 pb-3 border-t border-zinc-200/30 dark:border-zinc-700/30 pt-2">
				<button
					onClick={() => onDeny(request.id)}
					disabled={isSubmitting}
					className={cn(
						"flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
						"bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
						"hover:bg-zinc-200 dark:hover:bg-zinc-700",
						"disabled:opacity-50 disabled:cursor-not-allowed",
					)}
				>
					{request.status === "submitting-deny" ? "拒绝中..." : "拒绝"}
				</button>
				<button
					onClick={() => onAllow(request.id)}
					disabled={isSubmitting}
					className={cn(
						"flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
						"bg-blue-500 hover:bg-blue-600 text-white",
						"disabled:opacity-50 disabled:cursor-not-allowed",
					)}
				>
					{request.status === "submitting-allow" ? "允许中..." : "允许"}
				</button>
			</div>
		</div>
	);
};

/**
 * 工具权限请求列表
 */
export const ToolPermissionList: React.FC = () => {
	const [requests, setRequests] = useState<ToolPermissionRequest[]>([]);

	useEffect(() => {
		const unsubscribe = toolPermissionStore.subscribe(() => {
			setRequests(toolPermissionStore.getPendingRequests());
		});
		setRequests(toolPermissionStore.getPendingRequests());
		return unsubscribe;
	}, []);

	if (requests.length === 0) {
		return null;
	}

	const handleAllow = (id: string) => {
		toolPermissionStore.allowRequest(id);
	};

	const handleDeny = (id: string) => {
		toolPermissionStore.denyRequest(id);
	};

	return (
		<div className="space-y-2">
			{requests.map((request) => (
				<ToolPermissionCard
					key={request.id}
					request={request}
					onAllow={handleAllow}
					onDeny={handleDeny}
				/>
			))}
		</div>
	);
};

export default ToolPermissionCard;
