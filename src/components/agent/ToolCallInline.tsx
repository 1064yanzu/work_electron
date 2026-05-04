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
	Activity,
	ChevronDown,
	ChevronRight,
	Edit3,
	Eye,
	FileText,
	Globe,
	Loader2,
	MessageSquare,
	Search,
	Terminal,
	XCircle,
} from "lucide-react";
import React, { useState } from "react";
import { useAgentStore } from "../../lib/agent/store";
import type { ToolCall } from "../../lib/agent/types";
import { EVENTS, events } from "../../lib/events";
import { cn } from "../../lib/utils";
import { type ArtifactFileType } from "./ArtifactCard";
import ArtifactPreviewModal from "./ArtifactPreviewModal";
import TerminalBlock from "./TerminalBlock";
import { ToolCallDetailsPanel } from "./ToolCallDetailsPanel";
import { ThoughtInline } from "./ThoughtInline";
import { useDiffStoreSelector } from "../../lib/stores/diffStore";
import { FileDiffCard } from "../CodeView/FileDiffCard";
import { ToolOutputDisplay } from "./toolCall/ToolOutputDisplay";
import {
	getFileName,
	getFilePath,
	inferArtifactFileType,
	isBashToolCall,
	statFileSize,
} from "./toolCall/toolUtils";

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

	// 子代理调用（Task）
	if (toolCall.name === "Task" || name === "task") {
		const subagentType = String(
			(input as any)?.subagent_type ||
				(input as any)?.agent_type ||
				(input as any)?.subagentType ||
				(input as any)?.agentType ||
				"",
		).trim();
		return {
			icon: Activity,
			prefix: "子代理",
			suffix: subagentType || toolCall.description,
			detail: subagentType ? `subagent_type: ${subagentType}` : undefined,
		};
	}

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
			icon: Activity,
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
			icon: MessageSquare,
			prefix: "调用技能",
			suffix: skillName,
		};
	}

	// MCP 调用
	if (type === "mcp_call") {
		const mcpName = String(input?.name || input?.tool || toolCall.name || "");
		return {
			icon: MessageSquare,
			prefix: mcpName || "MCP 调用",
		};
	}

	// 默认
	return {
		icon: MessageSquare,
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
	const [previewFile, setPreviewFile] = useState<{
		fileName: string;
		filePath: string;
		fileType: ArtifactFileType;
		fileSize: number;
	} | null>(null);

	// 查找对应的 diff 数据
	const diffForToolCall = useDiffStoreSelector((s) => {
		const diffs = Object.values(s.diffs);
		return diffs.find((d) => d.toolCallId === toolCallId) || null;
	});

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

	const openFilePreview = async () => {
		const input = toolCall.input as Record<string, unknown> | undefined;
		const filePathFull = String(
			input?.file_path || input?.path || input?.file || "",
		).trim();
		if (!filePathFull) return;
		const fileType = inferArtifactFileType(filePathFull);
		const fileSize = await statFileSize(filePathFull);
		setPreviewFile({
			fileName: getFileName(filePathFull),
			filePath: filePathFull,
			fileType,
			fileSize,
		});
	};

	const canPreviewFile = (() => {
		const name = toolCall.name?.toLowerCase() || "";
		const type = toolCall.type;
		if (
			name.includes("write") ||
			name.includes("edit") ||
			name.includes("patch") ||
			type === "file_write" ||
			type === "doc_update" ||
			type === "doc_patch"
		) {
			const input = toolCall.input as Record<string, unknown> | undefined;
			return Boolean(input?.file_path || input?.path || input?.file);
		}
		return false;
	})();

	const isThinkToolCall = (toolCall.name || "").toLowerCase().includes("think");
	if (isThinkToolCall) {
		const outputText =
			typeof toolCall.output === "string"
				? toolCall.output
				: toolCall.output
					? JSON.stringify(toolCall.output, null, 2)
					: toolCall.error || "";
		if (outputText.trim()) {
			return (
				<div className="py-1" data-agent-tool-call-id={toolCallId}>
					<ThoughtInline
						title={prefix || "Thought"}
						content={outputText}
						source="tool"
					/>
				</div>
			);
		}
	}

	// 对于 Bash 工具调用，使用 Mac 风格终端显示
	if (isBashToolCall(toolCall)) {
		const input = toolCall.input as Record<string, unknown> | undefined;
		const command = String(input?.command || input?.cmd || input?.code || "");
		const description = String(input?.description || "Terminal");

		return (
			<div
				className="py-2"
				data-agent-tool-call-id={toolCallId}
				onClick={() =>
					events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
						toolCallId,
						source: "sidebar",
					})
				}
			>
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

	// 如果有 diff 数据，显示 FileDiffCard（文件写入/编辑完成后）
	if (diffForToolCall && toolCall.status === "completed") {
		return (
			<div className="py-1" data-agent-tool-call-id={toolCallId}>
				<FileDiffCard diff={diffForToolCall} />
			</div>
		);
	}

	return (
		<div className="py-1" data-agent-tool-call-id={toolCallId}>
			{/* 主行 */}
			<button
				type="button"
				onClick={() => {
					events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
						toolCallId,
						source: "sidebar",
					});
					if (hasDetails) setIsExpanded((v) => !v);
				}}
				disabled={!hasDetails}
				className={cn(
					"w-full flex items-center gap-2 text-left transition-colors",
					hasDetails
						? "cursor-pointer hover:bg-warm-50/80/40 -mx-2 px-2 py-1.5 rounded-lg"
						: "cursor-default py-0.5",
				)}
			>
				{/* 折叠箭头 */}
				{hasDetails ? (
					<span className="w-4 h-4 flex items-center justify-center text-text-light flex-shrink-0">
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
						<Loader2 className="w-3.5 h-3.5 text-text-light animate-spin" />
					) : isError ? (
						<XCircle className="w-3.5 h-3.5 text-error" />
					) : (
						<Icon className="w-3.5 h-3.5 text-text-light" />
					)}
				</span>

				{/* 描述文字 */}
				<span
					className={cn(
						"text-sm flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden",
						isError
							? "text-error dark:text-error"
							: "text-text-secondary dark:text-zinc-200",
					)}
				>
					<span className="font-medium flex-shrink-0 whitespace-nowrap">
						{prefix}
					</span>
					{fileName && (
						<button
							type="button"
							onClick={(e) => {
								if (!canPreviewFile) return;
								e.preventDefault();
								e.stopPropagation();
								void openFilePreview();
							}}
							className={cn(
								"inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warm-200 text-xs text-text-secondary max-w-[200px] min-w-0",
								canPreviewFile
									? "hover:bg-warm-300/70 dark:hover:bg-cream-700/60 cursor-pointer"
									: "cursor-default",
							)}
							title={canPreviewFile ? "点击预览" : fileName}
						>
							<Icon className="w-3 h-3 text-sky-500 flex-shrink-0" />
							<span className="truncate">{fileName}</span>
						</button>
					)}
					{suffix && !fileName && (
						<span className="text-text-muted truncate">{suffix}</span>
					)}
					{filePath && !fileName && (
						<span className="text-text-light text-xs truncate">{filePath}</span>
					)}
				</span>

				{/* 结果计数（如搜索结果） */}
				{detail && !isExpanded && (
					<span className="ml-auto text-xs text-text-light flex-shrink-0">
						{detail}
					</span>
				)}
			</button>

			{/* 展开的详情 */}
			{isExpanded && hasDetails && (
				<ToolCallDetailsPanel
					canPreviewFile={canPreviewFile}
					onPreviewFile={
						canPreviewFile
							? () => {
									void openFilePreview();
								}
							: undefined
					}
					input={toolCall.input as Record<string, unknown> | undefined}
					error={toolCall.error}
					outputNode={
						toolCall.output ? (
							<ToolOutputDisplay
								output={toolCall.output}
								toolCallId={toolCall.id}
							/>
						) : undefined
					}
				/>
			)}

			{previewFile && (
				<ArtifactPreviewModal
					isOpen={!!previewFile}
					onClose={() => setPreviewFile(null)}
					fileName={previewFile.fileName}
					filePath={previewFile.filePath}
					fileType={previewFile.fileType}
					fileSize={previewFile.fileSize}
				/>
			)}
		</div>
	);
}
