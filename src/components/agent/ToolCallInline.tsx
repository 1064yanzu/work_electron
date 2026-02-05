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
import React, { useState, useEffect } from "react";
import { useAgentStore } from "../../lib/agent/store";
import type { ToolCall } from "../../lib/agent/types";
import { EVENTS, events } from "../../lib/events";
import { cn } from "../../lib/utils";
import { type ArtifactFileType } from "./ArtifactCard";
import ArtifactPreviewModal from "./ArtifactPreviewModal";
import TerminalBlock from "./TerminalBlock";
import { InlineImage } from "../ui/InlineImage";
import { agentStore } from "../../lib/agent/store";

// 工具输出显示组件 - 处理 persisted-output 和 base64 图片
function ToolOutputDisplay({ output, toolCallId }: { output: unknown; toolCallId?: string }) {
	const [imagePath, setImagePath] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const outputStr = typeof output === "string"
		? output
		: JSON.stringify(output, null, 2);

	// 检测 persisted-output 标签
	const persistedMatch = outputStr.match(/<persisted-output>[\s\S]*?Full output saved to:\s*([^\n<]+)/);
	const persistedFilePath = persistedMatch?.[1]?.trim();

	// 检测预览中的 base64 图片标记（不完整的，需要读取文件）
	const hasPartialBase64 = /data:image\/[a-z]+;base64,/.test(outputStr) && persistedFilePath;

	useEffect(() => {
		if (!persistedFilePath || !hasPartialBase64) return;

		let cancelled = false;
		setLoading(true);
		setError(null);

		(async () => {
			try {
				// 读取持久化文件
				const fileContent = await (window as any).electronAPI?.invoke("read_file_utf8", {
					path: persistedFilePath,
				});
				if (cancelled) return;

				if (!fileContent) {
					setError("无法读取文件");
					return;
				}

				// 解析 JSON 并提取 base64 图片
				let parsed: any;
				try {
					parsed = JSON.parse(fileContent);
				} catch {
					setError("文件格式错误");
					return;
				}

				// 查找 base64 图片
				let base64Data: string | null = null;
				const findBase64 = (obj: any): string | null => {
					if (typeof obj === "string") {
						const match = obj.match(/(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+)/);
						if (match) return match[1];
						// 也检查 markdown 格式
						const mdMatch = obj.match(/!\[[^\]]*\]\((data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+)\)/);
						if (mdMatch) return mdMatch[1];
					}
					if (Array.isArray(obj)) {
						for (const item of obj) {
							const found = findBase64(item);
							if (found) return found;
						}
					}
					if (obj && typeof obj === "object") {
						for (const key of Object.keys(obj)) {
							const found = findBase64(obj[key]);
							if (found) return found;
						}
					}
					return null;
				};

				base64Data = findBase64(parsed);
				if (!base64Data) {
					setError("未找到图片数据");
					return;
				}

				// 保存 base64 为文件
				const fileName = `subagent-image-${Date.now()}.jpg`;
				const savedPath = await (window as any).electronAPI?.invoke("save_base64_image", {
					base64Data,
					fileName,
				});
				if (cancelled) return;

				if (savedPath) {
					setImagePath(savedPath);

					// 添加到 artifacts 列表
					agentStore.addArtifact({
						id: `artifact-image-${Date.now()}`,
						type: "image",
						title: "生成的图片",
						url: savedPath,
						metadata: { toolCallId, source: "subagent" },
					});
				} else {
					setError("保存图片失败");
				}
			} catch (err) {
				if (cancelled) return;
				setError(String(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => { cancelled = true; };
	}, [persistedFilePath, hasPartialBase64, toolCallId]);

	// 渲染图片
	if (imagePath) {
		return (
			<div className="bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded border border-zinc-100 dark:border-zinc-800/50">
				<InlineImage path={imagePath} title="生成的图片" className="max-w-full" />
			</div>
		);
	}

	// 加载中
	if (loading) {
		return (
			<div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded border border-zinc-100 dark:border-zinc-800/50 flex items-center gap-3">
				<Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
				<span className="text-sm text-zinc-500">正在处理图片...</span>
			</div>
		);
	}

	// 错误
	if (error && hasPartialBase64) {
		return (
			<div className="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800/50">
				<span className="text-sm text-red-600 dark:text-red-400">{error}</span>
			</div>
		);
	}

	// 默认：显示截断的文本
	return (
		<div className="bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded border border-zinc-100 dark:border-zinc-800/50">
			<pre className="whitespace-pre-wrap break-all text-zinc-600 dark:text-zinc-300 text-[11px] max-h-[200px] overflow-y-auto">
				{outputStr.slice(0, 500) + (outputStr.length > 500 ? "..." : "")}
			</pre>
		</div>
	);
}

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

function inferArtifactFileType(filePath: string): ArtifactFileType {
	const lower = filePath.toLowerCase();
	const ext = lower.includes(".") ? lower.split(".").pop() || "" : "";
	if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
		return "image";
	if (["htm", "html"].includes(ext)) return "html";
	if (["pdf"].includes(ext)) return "pdf";
	if (
		[
			"js",
			"jsx",
			"ts",
			"tsx",
			"css",
			"scss",
			"less",
			"json",
			"md",
			"yml",
			"yaml",
			"toml",
			"xml",
			"sql",
			"sh",
			"bash",
			"py",
			"java",
			"kt",
			"go",
			"rs",
			"c",
			"cc",
			"cpp",
			"h",
			"hpp",
		].includes(ext)
	) {
		return "code";
	}
	if (ext) return "text";
	return "other";
}

async function statFileSize(filePath: string): Promise<number> {
	try {
		const entries = await (window as any).electronAPI?.invoke(
			"list_files_safe",
			{
				path: filePath,
				recursive: false,
			},
		);
		const first = Array.isArray(entries) ? entries[0] : null;
		const size = first && typeof first.size === "number" ? first.size : 0;
		return Number.isFinite(size) ? size : 0;
	} catch {
		return 0;
	}
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
			icon: Brain,
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
		} catch { }
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
	const [previewFile, setPreviewFile] = useState<{
		fileName: string;
		filePath: string;
		fileType: ArtifactFileType;
		fileSize: number;
	} | null>(null);

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
						"text-sm flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden",
						isError
							? "text-red-600 dark:text-red-400"
							: "text-zinc-600 dark:text-zinc-300",
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
								"inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 max-w-[200px] min-w-0",
								canPreviewFile
									? "hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60 cursor-pointer"
									: "cursor-default",
							)}
							title={canPreviewFile ? "点击预览" : fileName}
						>
							<Icon className="w-3 h-3 text-sky-500 flex-shrink-0" />
							<span className="truncate">{fileName}</span>
						</button>
					)}
					{suffix && !fileName && (
						<span className="text-zinc-500 dark:text-zinc-400 truncate">
							{suffix}
						</span>
					)}
					{filePath && !fileName && (
						<span className="text-zinc-400 dark:text-zinc-500 text-xs truncate">
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
					{canPreviewFile && (
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									void openFilePreview();
								}}
								className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60"
							>
								<Eye className="w-3.5 h-3.5" />
								预览文件
							</button>
						</div>
					)}

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
					{toolCall.output && <ToolOutputDisplay output={toolCall.output} toolCallId={toolCall.id} />}
				</div>
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
