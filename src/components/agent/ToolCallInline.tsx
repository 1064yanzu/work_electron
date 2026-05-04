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
import React, { useState, useEffect } from "react";
import { useAgentStore } from "../../lib/agent/store";
import type { ToolCall } from "../../lib/agent/types";
import { EVENTS, events } from "../../lib/events";
import { cn } from "../../lib/utils";
import { type ArtifactFileType } from "./ArtifactCard";
import ArtifactPreviewModal from "./ArtifactPreviewModal";
import TerminalBlock from "./TerminalBlock";
import { InlineImage } from "../ui/InlineImage";
import { ToolCallDetailsPanel } from "./ToolCallDetailsPanel";
import { ThoughtInline } from "./ThoughtInline";
import { useDiffStoreSelector } from "../../lib/stores/diffStore";
import { FileDiffCard } from "../CodeView/FileDiffCard";

// 工具输出显示组件 - 处理 persisted-output 和 base64 图片
function ToolOutputDisplay({
	output,
	toolCallId,
}: {
	output: unknown;
	toolCallId?: string;
}) {
	const [imagePath, setImagePath] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const agentStore = useAgentStore();

	const outputStr =
		typeof output === "string" ? output : JSON.stringify(output, null, 2);

	// 检测 persisted-output 标签
	const persistedMatch = outputStr.match(
		/<persisted-output>[\s\S]*?Full output saved to:\s*([^\n<]+)/,
	);
	const persistedFilePath = persistedMatch?.[1]?.trim();

	// 检测预览中的 base64 图片标记（不完整的，需要读取文件）
	const hasPartialBase64 =
		/data:image\/[a-z]+;base64,/.test(outputStr) && persistedFilePath;

	useEffect(() => {
		if (!persistedFilePath || !hasPartialBase64) return;

		let cancelled = false;
		setLoading(true);
		setError(null);

		(async () => {
			try {
				// 读取持久化文件
				const fileContent = await (window as any).electronAPI?.invoke(
					"read_file_utf8",
					{
						path: persistedFilePath,
					},
				);
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

				// 查找图片（优先查找文件路径，避免重复保存）
				let imageData: string | null = null;
				const extractImagePathFromText = (text: string): string | null => {
					const value = String(text || "").trim();
					if (!value) return null;
					if (
						value.startsWith("/") &&
						/\.(png|jpg|jpeg|gif|webp|svg)\b/i.test(value)
					) {
						return value;
					}
					const absPathMatch = value.match(
						/(\/Users\/[^,\n)]+?\.(?:png|jpg|jpeg|gif|webp|svg))/i,
					);
					if (absPathMatch?.[1]) return absPathMatch[1].trim();
					return null;
				};
				const findImage = (obj: any): string | null => {
					if (typeof obj === "string") {
						// 检查是否是文件路径
						const pathCandidate = extractImagePathFromText(obj);
						if (pathCandidate) {
							return pathCandidate;
						}
						// 如果是 base64，也返回（备用方案）
						const match = obj.match(
							/(data:image\/[a-z]+;base64,[A-Za-z0-9+\/=]+)/,
						);
						if (match) return match[1];
						// 也检查 markdown 格式
						const mdMatch = obj.match(
							/!\[[^\]]*\]\((data:image\/[a-z]+;base64,[A-Za-z0-9+\/=]+)\)/,
						);
						if (mdMatch) return mdMatch[1];
					}
					if (Array.isArray(obj)) {
						for (const item of obj) {
							const found = findImage(item);
							if (found) return found;
						}
					}
					if (obj && typeof obj === "object") {
						for (const key of Object.keys(obj)) {
							const found = findImage(obj[key]);
							if (found) return found;
						}
					}
					return null;
				};

				imageData = findImage(parsed);
				if (!imageData) {
					setError("未找到图片");
					return;
				}

				// 如果是文件路径，直接使用；如果是 base64，需要保存
				let finalPath = imageData;
				if (imageData.startsWith("data:image/")) {
					// base64 格式：优先保存到当前任务 sandbox（中间栏可直接复用），否则回退全局目录
					const sandboxDir = (agentStore.currentTask?.metadata as any)
						?.sandboxDir as string | undefined;
					const fileName = `subagent-image-${Date.now()}.jpg`;
					let savedPath: string | null = null;
					if (sandboxDir) {
						const match = imageData.match(
							/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i,
						);
						if (match?.[1]) {
							const candidate = `${sandboxDir.replace(/[\\/]+$/, "")}/images/${fileName}`;
							try {
								await (window as any).electronAPI?.invoke("write_file_safe", {
									payload: {
										path: candidate,
										content: match[1],
										encoding: "base64",
										create_dirs: true,
									},
								});
								savedPath = candidate;
							} catch {
								savedPath = null;
							}
						}
					}
					if (!savedPath) {
						savedPath = await (window as any).electronAPI?.invoke(
							"save_base64_image",
							{
								base64Data: imageData,
								fileName,
							},
						);
					}
					if (cancelled) return;

					if (!savedPath) {
						setError("保存图片失败");
						return;
					}
					finalPath = savedPath;
				}

				if (cancelled) return;
				setImagePath(finalPath);
				const fileName =
					finalPath.split("/").pop() || `image-${Date.now()}.jpg`;
				console.log("[ToolOutputDisplay] Image path:", finalPath);

				// 添加到产物列表
				console.log("[ToolOutputDisplay] Adding artifact to task:", {
					finalPath,
					fileName,
					toolCallId,
				});
				const exists = (agentStore.currentTask?.artifacts || []).some(
					(a) => a.type === "image" && String(a.url || "").trim() === finalPath,
				);
				if (!exists) {
					agentStore.addArtifact({
						id: `artifact-image-${Date.now()}`,
						type: "image",
						title: fileName,
						url: finalPath,
						metadata: { toolCallId, source: "subagent" },
					});
					console.log("[ToolOutputDisplay] Artifact added successfully");
				}

				// 触发中间栏预览
				setTimeout(() => {
					events.emit("AGENT_FOCUS_TOOL_CALL", {
						toolCallId,
						artifactUrl: finalPath,
						autoPreview: true,
					});
				}, 300);
			} catch (err) {
				if (cancelled) return;
				setError(String(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [persistedFilePath, hasPartialBase64, toolCallId]);

	// 渲染图片（已添加到产物列表，会在中间栏自动预览）
	if (imagePath) {
		return (
			<div className="bg-warm-50/50 p-2 rounded border border-border/50">
				<InlineImage
					path={imagePath}
					title="生成的图片（已添加到产物列表）"
					className="max-w-full"
				/>
			</div>
		);
	}

	// 加载中
	if (loading) {
		return (
			<div className="bg-warm-50/50 p-4 rounded border border-border/50 flex items-center gap-3">
				<Loader2 className="w-5 h-5 animate-spin text-text-light" />
				<span className="text-sm text-text-muted">正在处理图片...</span>
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
		<div className="bg-warm-50/50 p-2 rounded border border-border/50">
			<pre className="whitespace-pre-wrap break-all text-text-secondary text-[11px] max-h-[200px] overflow-y-auto">
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
						<XCircle className="w-3.5 h-3.5 text-red-500" />
					) : (
						<Icon className="w-3.5 h-3.5 text-text-light" />
					)}
				</span>

				{/* 描述文字 */}
				<span
					className={cn(
						"text-sm flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden",
						isError
							? "text-red-600 dark:text-red-400"
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
