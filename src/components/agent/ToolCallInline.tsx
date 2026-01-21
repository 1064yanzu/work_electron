/**
 * ToolCallInline - Claude 官方风格思维链展示
 *
 * 像素级复刻 Claude 客户端设计:
 * 1. 极简行式布局，无卡片边框
 * 2. 图标 + 描述文字，文件名用 pill 标签
 * 3. 可折叠展开详情
 * 4. 灰色调，简洁配色
 */

import {
	Brain,
	ChevronDown,
	ChevronRight,
	Edit3,
	Eye,
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
import TerminalBlock from "./TerminalBlock";

// 提取文件名
function getFileName(filePath: string): string {
	if (!filePath) return "";
	return filePath.split("/").pop() || filePath;
}

// 提取文件夹路径（用于显示）
function getFilePath(filePath: string): string {
	if (!filePath) return "";
	const parts = filePath.split("/");
	if (parts.length <= 2) return filePath;
	return parts.slice(-2).join("/");
}

// 检查是否为终端/Bash 工具调用
function isBashToolCall(toolCall: ToolCall): boolean {
	const name = toolCall.name?.toLowerCase() || "";
	const type = toolCall.type;
	return (
		name === "bash" ||
		name.includes("terminal") ||
		name.includes("shell") ||
		type === "code_execute"
	);
}

// 从工具调用中提取描述信息
function getReadableDescription(toolCall: ToolCall): {
	icon: React.ElementType;
	prefix: string;
	fileName?: string;
	filePath?: string;
	suffix?: string;
	detail?: string;
} {
	const input = toolCall.input as Record<string, unknown> | undefined;
	const name = toolCall.name?.toLowerCase() || "";
	const type = toolCall.type;

	// 读取文件
	if (name.includes("read") || type === "file_read") {
		const filePath = String(
			input?.file_path || input?.path || input?.file || "",
		);
		return {
			icon: Search,
			prefix: "Read",
			fileName: getFileName(filePath),
			filePath: getFilePath(filePath),
			detail: filePath,
		};
	}

	// 文件查看
	if (name.includes("view")) {
		const filePath = String(
			input?.file_path || input?.path || input?.file || "",
		);
		const startLine = input?.start_line || input?.startLine;
		const endLine = input?.end_line || input?.endLine;
		const lineRange = startLine && endLine ? `L${startLine}-${endLine}` : "";
		return {
			icon: Eye,
			prefix: "文件查看",
			suffix: lineRange,
			filePath: getFilePath(filePath),
			detail: filePath,
		};
	}

	// 写入/创建文件
	if (name.includes("write") || type === "file_write") {
		const filePath = String(
			input?.file_path || input?.path || input?.file || "",
		);
		return {
			icon: FileText,
			prefix: "已创建",
			fileName: getFileName(filePath),
			filePath: getFilePath(filePath),
			detail: filePath,
		};
	}

	// 编辑文件
	if (
		name.includes("edit") ||
		name.includes("patch") ||
		type === "doc_update" ||
		type === "doc_patch"
	) {
		const filePath = String(
			input?.file_path || input?.path || input?.file || "",
		);
		return {
			icon: Edit3,
			prefix: "已修改",
			fileName: getFileName(filePath),
			filePath: getFilePath(filePath),
			detail: filePath,
		};
	}

	// 搜索 (Grep/Glob)
	if (
		name.includes("grep") ||
		name.includes("glob") ||
		name.includes("search") ||
		type === "web_search"
	) {
		const query = String(input?.query || input?.q || input?.pattern || "");
		const results = toolCall.output;
		let resultCount = "";
		if (Array.isArray(results)) {
			resultCount = `${results.length} results`;
		} else if (typeof results === "string" && results.includes("result")) {
			const match = results.match(/(\d+)\s*results?/i);
			if (match) resultCount = `${match[1]} results`;
		}
		return {
			icon: Search,
			prefix: "Searched",
			suffix: query,
			detail: resultCount || undefined,
		};
	}

	// 资料库检索
	if (type === "kb_search_chunks" || name.includes("knowledge")) {
		const query = String(input?.query || "");
		return {
			icon: Search,
			prefix: "检索资料",
			suffix: query,
		};
	}

	// 获取网页
	if (
		name.includes("fetch") ||
		type === "fetch_url" ||
		name.includes("browse")
	) {
		const url = String(input?.url || "");
		let hostname = "";
		try {
			hostname = new URL(url).hostname;
		} catch {}
		return {
			icon: Globe,
			prefix: "获取",
			suffix: hostname || url,
			detail: url,
		};
	}

	// 执行命令
	if (
		name === "bash" ||
		name.includes("terminal") ||
		name.includes("shell") ||
		type === "code_execute"
	) {
		const cmd = String(input?.command || input?.cmd || input?.code || "");
		const shortCmd = cmd.length > 50 ? cmd.slice(0, 50) + "..." : cmd;
		return {
			icon: Terminal,
			prefix: "$",
			suffix: shortCmd,
			detail: cmd,
		};
	}

	// 思考
	if (name.includes("think")) {
		return {
			icon: Brain,
			prefix: "Thought for",
			suffix: "1s",
		};
	}

	// 技能调用
	if (
		name.includes("skill") ||
		type === "skill_call" ||
		type === "skill_invoke"
	) {
		const skillName = String(
			input?.skill || input?.skillName || input?.name || toolCall.name || "",
		);
		return {
			icon: Sparkles,
			prefix: "调用技能",
			suffix: skillName,
		};
	}

	// MCP 调用
	if (type === "mcp_call") {
		const mcpName = String(input?.name || input?.tool || toolCall.name || "");
		return {
			icon: Sparkles,
			prefix: mcpName || "MCP 调用",
		};
	}

	// 默认
	return {
		icon: Sparkles,
		prefix: toolCall.name || "工具调用",
	};
}

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

	const {
		icon: Icon,
		prefix,
		fileName,
		filePath,
		suffix,
		detail,
	} = getReadableDescription(toolCall);
	const isRunning = toolCall.status === "running";
	const isError = toolCall.status === "error";
	const hasDetails = !!(
		toolCall.output ||
		toolCall.error ||
		detail ||
		(toolCall.input && Object.keys(toolCall.input).length > 0)
	);

	// 对于 Bash 工具调用，使用 Mac 风格终端显示
	if (isBashToolCall(toolCall)) {
		const input = toolCall.input as Record<string, unknown> | undefined;
		const command = String(input?.command || input?.cmd || input?.code || "");
		const description = String(input?.description || "Terminal");

		return (
			<div className="py-2">
				<TerminalBlock
					command={command}
					output={
						typeof toolCall.output === "string" ? toolCall.output : undefined
					}
					error={toolCall.error}
					status={toolCall.status}
					description={description}
				/>
			</div>
		);
	}

	return (
		<div className="py-1">
			{/* 主行 */}
			<button
				type="button"
				onClick={() => hasDetails && setIsExpanded((v) => !v)}
				disabled={!hasDetails}
				className={cn(
					"w-full flex items-center gap-2 text-left transition-colors",
					hasDetails
						? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30 -mx-2 px-2 py-1 rounded"
						: "cursor-default py-0.5",
				)}
			>
				{/* 折叠箭头 */}
				{hasDetails ? (
					<span className="w-4 h-4 flex items-center justify-center text-zinc-400 flex-shrink-0">
						{isExpanded ? (
							<ChevronDown className="w-3.5 h-3.5" />
						) : (
							<ChevronRight className="w-3.5 h-3.5" />
						)}
					</span>
				) : (
					<span className="w-4 h-4 flex-shrink-0" />
				)}

				{/* 状态/类型图标 */}
				<span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
					{isRunning ? (
						<Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />
					) : isError ? (
						<XCircle className="w-3.5 h-3.5 text-red-500" />
					) : (
						<Icon className="w-3.5 h-3.5 text-zinc-400" />
					)}
				</span>

				{/* 描述文字 */}
				<span
					className={cn(
						"text-sm flex items-center gap-1.5 flex-wrap",
						isError
							? "text-red-600 dark:text-red-400"
							: "text-zinc-600 dark:text-zinc-300",
					)}
				>
					<span className="font-medium">{prefix}</span>
					{fileName && (
						<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300">
							<Icon className="w-3 h-3 text-sky-500" />
							{fileName}
						</span>
					)}
					{suffix && !fileName && (
						<span className="text-zinc-500 dark:text-zinc-400">{suffix}</span>
					)}
					{filePath && !fileName && (
						<span className="text-zinc-400 dark:text-zinc-500 text-xs truncate max-w-[200px]">
							{filePath}
						</span>
					)}
				</span>

				{/* 结果计数（如搜索结果） */}
				{detail && !isExpanded && (
					<span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0">
						{detail}
					</span>
				)}
			</button>

			{/* 展开的详情 */}
			{isExpanded && hasDetails && (
				<div className="ml-8 mt-1 text-xs text-zinc-500 dark:text-zinc-400 space-y-2">
					{/* 输入参数 */}
					{toolCall.input && Object.keys(toolCall.input).length > 0 && (
						<div className="space-y-1">
							{Object.entries(toolCall.input).map(([key, value]) => (
								<div key={key}>
									<span className="text-zinc-400">{key}:</span>
									<div className="mt-0.5 pl-2 border-l border-zinc-200 dark:border-zinc-700">
										{typeof value === "string" && value.length > 100 ? (
											<pre className="whitespace-pre-wrap break-all text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded text-[11px]">
												{value}
											</pre>
										) : (
											<span className="text-zinc-600 dark:text-zinc-300">
												{typeof value === "object"
													? JSON.stringify(value)
													: String(value)}
											</span>
										)}
									</div>
								</div>
							))}
						</div>
					)}

					{/* 错误 */}
					{toolCall.error && (
						<div className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-2 rounded border border-red-100 dark:border-red-900/20 whitespace-pre-wrap">
							{toolCall.error}
						</div>
					)}

					{/* 输出 */}
					{toolCall.output && (
						<div className="bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded border border-zinc-100 dark:border-zinc-800/50">
							<pre className="whitespace-pre-wrap break-all text-zinc-600 dark:text-zinc-300 text-[11px] max-h-[200px] overflow-y-auto">
								{typeof toolCall.output === "string"
									? toolCall.output.slice(0, 500) +
										(toolCall.output.length > 500 ? "..." : "")
									: JSON.stringify(toolCall.output, null, 2).slice(0, 500)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
