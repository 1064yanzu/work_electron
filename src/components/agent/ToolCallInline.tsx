/**
 * ToolCallInline - Claude 风格思维链展示
 * 
 * 设计原则(参考Claude官方客户端):
 * 1. 显示有意义的中文描述,如"已读取设置页面"而非"Read"
 * 2. 每个步骤就是简洁的一行
 * 3. 可折叠展开详情
 * 4. 简洁的图标系统
 */

import {
	Brain,
	ChevronDown,
	ChevronRight,
	Edit3,
	FileText,
	Globe,
	Loader2,
	Search,
	Sparkles,
	Terminal,
	XCircle,
} from "lucide-react";
import React, { useState } from "react";
import { useAgentStore } from "../../lib/agent/store";
import type { ToolCall } from "../../lib/agent/types";
import { cn } from "../../lib/utils";

// 从工具调用中提取有意义的描述
function getReadableDescription(toolCall: ToolCall): { icon: React.ElementType; text: string; detail?: string } {
	const input = toolCall.input as any;
	const name = toolCall.name?.toLowerCase() || "";
	const type = toolCall.type;

	// 读取文件
	if (name.includes("read") || type === "file_read") {
		const filePath = input?.file_path || input?.path || input?.file || "";
		const fileName = filePath.split("/").pop() || "文件";
		return {
			icon: FileText,
			text: `Read ${fileName}`,
			detail: filePath,
		};
	}

	// 写入/创建文件
	if (name.includes("write") || type === "file_write") {
		const filePath = input?.file_path || input?.path || input?.file || "";
		const fileName = filePath.split("/").pop() || "文件";
		return {
			icon: FileText,
			text: `已创建 ${fileName}`,
			detail: filePath,
		};
	}

	// 编辑文件
	if (name.includes("edit") || name.includes("patch") || type === "doc_update" || type === "doc_patch") {
		const filePath = input?.file_path || input?.path || input?.file || "";
		const fileName = filePath.split("/").pop() || "文件";
		return {
			icon: Edit3,
			text: `已修改 ${fileName}`,
			detail: filePath,
		};
	}

	// 网络搜索
	if (name.includes("search") || type === "web_search") {
		const query = input?.query || input?.q || "";
		return {
			icon: Search,
			text: query ? `搜索: ${query}` : "网络搜索",
			detail: query,
		};
	}

	// 资料库检索
	if (type === "kb_search_chunks" || name.includes("knowledge")) {
		const query = input?.query || "";
		return {
			icon: Search,
			text: query ? `检索资料: ${query}` : "资料库检索",
			detail: query,
		};
	}

	// 获取网页
	if (name.includes("fetch") || type === "fetch_url" || name.includes("browse")) {
		const url = input?.url || "";
		try {
			const hostname = new URL(url).hostname;
			return {
				icon: Globe,
				text: `获取 ${hostname}`,
				detail: url,
			};
		} catch {
			return {
				icon: Globe,
				text: "获取网页",
				detail: url,
			};
		}
	}

	// 执行命令
	if (name === "bash" || name.includes("terminal") || name.includes("shell") || type === "code_execute") {
		const cmd = input?.command || input?.cmd || input?.code || "";
		const shortCmd = cmd.length > 40 ? cmd.slice(0, 40) + "..." : cmd;
		return {
			icon: Terminal,
			text: shortCmd || "执行命令",
			detail: cmd,
		};
	}

	// 技能调用
	if (name.includes("skill") || type === "skill_call" || type === "skill_invoke") {
		const skillName = input?.skill || input?.skillName || input?.name || "";
		return {
			icon: Sparkles,
			text: skillName ? `调用技能: ${skillName}` : "技能调用",
			detail: skillName,
		};
	}

	// LLM 调用
	if (type === "llm_call" || name.includes("llm") || name.includes("ai")) {
		return {
			icon: Brain,
			text: "AI 分析",
		};
	}

	// MCP 调用
	if (type === "mcp_call") {
		const mcpName = input?.name || input?.tool || toolCall.name || "";
		return {
			icon: Sparkles,
			text: mcpName ? `${mcpName}` : "MCP 调用",
			detail: JSON.stringify(input, null, 2),
		};
	}

	// 默认:使用工具名
	return {
		icon: Sparkles,
		text: toolCall.name || "工具调用",
		detail: JSON.stringify(input, null, 2),
	};
}

/**
 * 思维链行组件 - Claude 风格
 */
export default function ToolCallInline({
	taskId,
	toolCallId,
	initialData,
}: {
	taskId: string;
	toolCallId: string;
	initialData?: ToolCall;
	density?: "default" | "compact";
}) {
	const { currentTask, taskHistory } = useAgentStore();
	const [isExpanded, setIsExpanded] = useState(false);

	const storeTask =
		currentTask?.id === taskId
			? currentTask
			: taskHistory.find((t) => t.id === taskId);
	const storeToolCall = storeTask?.toolCalls.find((tc) => tc.id === toolCallId);
	const toolCall = storeToolCall || initialData;

	// 自动展开错误状态
	React.useEffect(() => {
		if (toolCall?.status === "error") {
			setIsExpanded(true);
		}
	}, [toolCall?.status]);

	if (!toolCall) return null;

	const { icon: Icon, text, detail } = getReadableDescription(toolCall);
	const isRunning = toolCall.status === "running";
	const isCompleted = toolCall.status === "completed";
	const isError = toolCall.status === "error";
	const hasDetails = !!(toolCall.output || toolCall.error || detail);
	const isTerminal =
		toolCall.type === "code_execute" || toolCall.name?.toLowerCase() === "bash";

	return (
		<div className="group">
			{/* 主行 - Claude 风格 */}
			<button
				onClick={() => hasDetails && setIsExpanded((v) => !v)}
				disabled={!hasDetails}
				className={cn(
					"w-full flex items-center gap-2 py-1 text-left transition-colors rounded",
					hasDetails && "hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer",
					!hasDetails && "cursor-default",
				)}
			>
				{/* 折叠箭头 */}
				<div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
					{hasDetails ? (
						isExpanded ? (
							<ChevronDown className="w-3 h-3 text-zinc-400" />
						) : (
							<ChevronRight className="w-3 h-3 text-zinc-400" />
						)
					) : null}
				</div>

				{/* 状态图标 */}
				<div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
					{isRunning ? (
						<Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
					) : isError ? (
						<XCircle className="w-3.5 h-3.5 text-red-500" />
					) : isCompleted ? (
						<Icon className="w-3.5 h-3.5 text-zinc-400" />
					) : (
						<Icon className="w-3.5 h-3.5 text-zinc-400" />
					)}
				</div>

				{/* 描述文字 */}
				<span
					className={cn(
						"text-sm truncate",
						isTerminal &&
							"font-mono bg-zinc-100/70 dark:bg-zinc-800/60 px-1.5 py-0.5 rounded",
						isError
							? "text-red-600 dark:text-red-400"
							: isRunning
								? "text-zinc-700 dark:text-zinc-300"
								: "text-zinc-500 dark:text-zinc-400",
					)}
				>
					{isTerminal ? `$ ${text}` : text}
				</span>
			</button>

			{/* 展开的详情 - 简洁风格 */}
			{isExpanded && hasDetails && (
				<div className="ml-8 mt-1 mb-2 pl-3 border-l border-zinc-200 dark:border-zinc-700 text-xs">
					{/* 详细路径/参数 */}
					{detail && !toolCall.output && !toolCall.error && (
						<div className="text-zinc-400 dark:text-zinc-500 truncate py-1">
							{detail}
						</div>
					)}

					{/* 输出 */}
					{toolCall.output && (
						<pre className="text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap text-[11px] my-1">
							{typeof toolCall.output === "string"
								? toolCall.output.slice(0, 500) + (toolCall.output.length > 500 ? "..." : "")
								: JSON.stringify(toolCall.output, null, 2).slice(0, 500)}
						</pre>
					)}

					{/* 错误 */}
					{toolCall.error && (
						<div className="text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2 my-1">
							{toolCall.error}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
