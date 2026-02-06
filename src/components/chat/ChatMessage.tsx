// 单条聊天消息组件
import {
	Check,
	Code,
	Copy,
	Edit3,
	FileCode,
	FileText,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { ChatMessage as ChatMessageType } from "../../lib/chat/types";
import { EVENTS, events } from "../../lib/events";
import { workspaceStore } from "../../lib/workspaceStore";
import ToolCallInline from "../agent/ToolCallInline";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { AgentBlocksInline } from "./AgentBlocksInline";
import { AttachmentList } from "./AttachmentCard";
import { FileChangeCard as FileChangeCardComponent } from "./FileChangeCard";
import { ProcessingCard as ProcessingCardComponent } from "./ProcessingCard";
import { TokenDisplay } from "./TokenDisplay";
import { WebPreviewCard } from "./WebPreviewCard";

interface ChatMessageProps {
	message: ChatMessageType;
	preferBlocks?: boolean;
	onRegenerate?: (messageId: string) => void; // 重新生成回调
	onEdit?: (messageId: string) => void; // 编辑回调
	onDelete?: (messageId: string) => void; // 删除回调
}

// 处理中的状态卡片 - 极简高级风
const ProcessingCard = ProcessingCardComponent;

// 文件变更卡片组件 - 现代化卡片 (黑白灰高级感)
const FileChangeCard = FileChangeCardComponent;

// 提取代码块
function extractCodeBlocks(
	content: string,
): { language: string; code: string }[] {
	const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
	const blocks: { language: string; code: string }[] = [];
	let match;
	while ((match = codeBlockRegex.exec(content)) !== null) {
		blocks.push({
			language: match[1] || "text",
			code: match[2].trim(),
		});
	}
	return blocks;
}

function extractWebPreviewFromCodeBlocks(
	blocks: Array<{ language: string; code: string }>,
):
	| {
			kind: "html";
			html: string;
			css?: string;
			js?: string;
	  }
	| {
			kind: "react";
			jsx: string;
			css?: string;
	  }
	| null {
	let html = "";
	let jsx = "";
	let css = "";
	let js = "";

	for (const b of blocks) {
		const lang = String(b.language || "")
			.trim()
			.toLowerCase();
		const code = String(b.code || "");
		if (!html && (lang === "html" || lang === "htm")) html = code;
		else if (!jsx && (lang === "jsx" || lang === "tsx")) jsx = code;
		else if (!css && lang === "css") css = code;
		else if (
			!js &&
			(lang === "js" ||
				lang === "javascript" ||
				lang === "mjs" ||
				lang === "cjs")
		)
			js = code;
	}

	if (!html) {
		const fallback = blocks.find((b) =>
			/<\s*div[\s>]|<\s*html[\s>]|<!doctype/i.test(b.code),
		);
		if (fallback) {
			const looksLikeHtml = /<\s*html[\s>]|<!doctype/i.test(fallback.code);
			if (looksLikeHtml) html = fallback.code;
			else if (!jsx) jsx = fallback.code;
		}
	}

	if (html && html.trim()) {
		return {
			kind: "html",
			html,
			css: css.trim() ? css : undefined,
			js: js.trim() ? js : undefined,
		};
	}
	if (jsx && jsx.trim()) {
		return {
			kind: "react",
			jsx,
			css: css.trim() ? css : undefined,
		};
	}
	return null;
}

function ChatMessageImpl({
	message,
	preferBlocks = true,
	onRegenerate,
	onEdit,
	onDelete,
}: ChatMessageProps) {
	const [copied, setCopied] = useState(false);
	const [appliedBlocks, setAppliedBlocks] = useState<Set<number>>(new Set());
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const isUser = message.role === "user";
	const isStreaming = message.isStreaming;

	const hasBlocks =
		Array.isArray(message.metadata?.blocks) &&
		message.metadata.blocks.length > 0;
	const canRenderAssistantByBlocks =
		preferBlocks &&
		message.role === "assistant" &&
		hasBlocks &&
		!message.content.includes("<<<") &&
		message.metadata!.blocks!.some(
			(b) => b.type !== "text" || (b.type === "text" && !!b.text.trim()),
		);

	const renderableAgentBlocks =
		message.role === "trace" &&
		!message.metadata?.trace &&
		Array.isArray(message.metadata?.blocks) &&
		message.metadata.blocks.some(
			(b) =>
				b.type === "tool_call" ||
				b.type === "thought" ||
				b.type === "task_list" ||
				b.type === "file_update" ||
				b.type === "image",
		);

	if (renderableAgentBlocks) {
		return (
			<div className="group mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full">
				<AgentBlocksInline blocks={message.metadata!.blocks!} />
			</div>
		);
	}

	if (
		message.role === "trace" &&
		message.metadata?.trace?.type === "agent_task"
	) {
		// 不再显示“Agent 运行过程”面板；仅在存在 blocks 时渲染可读的卡片流。
		if (!Array.isArray(message.metadata?.blocks)) return null;

		return (
			<div className="group mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full">
				<AgentBlocksInline blocks={message.metadata.blocks} />
			</div>
		);
	}

	if (
		message.role === "trace" &&
		message.metadata?.trace?.type === "tool_call"
	) {
		return (
			<div className="group mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full">
				{Array.isArray(message.metadata?.blocks) ? (
					<AgentBlocksInline blocks={message.metadata.blocks} />
				) : (
					<ToolCallInline
						taskId={message.metadata.trace.taskId}
						toolCallId={message.metadata.trace.toolCallId}
					/>
				)}
			</div>
		);
	}

	// 提取代码块(流式和完成状态都提取)
	const codeBlocks = useMemo(
		() => extractCodeBlocks(message.content),
		[message.content],
	);

	// 流式状态的预览
	const streamingWebPreview = useMemo(
		() =>
			message.role === "assistant" && isStreaming && codeBlocks.length > 0
				? extractWebPreviewFromCodeBlocks(codeBlocks)
				: null,
		[message.role, isStreaming, codeBlocks],
	);

	// 完成状态的预览
	const handleCopy = async () => {
		await navigator.clipboard.writeText(message.content);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	// 应用整个消息内容
	const handleApply = () => {
		events.emit(EVENTS.AI_WRITE_TO_OUTPUT, {
			content: message.content,
			prompt: "AI 生成内容",
			type: "append",
		});
	};

	// 应用单个代码块（作为 diff）
	const handleApplyCodeBlock = (index: number) => {
		const block = codeBlocks[index];
		if (!block) return;

		// 获取当前编辑器内容作为原始内容
		const editorContent = workspaceStore.getState().editorContent || "";

		events.emit(EVENTS.AI_WRITE_TO_OUTPUT, {
			content: block.code,
			prompt: `应用 ${block.language} 代码`,
			type: "diff",
			originalContent: editorContent,
		});

		setAppliedBlocks((prev) => new Set(prev).add(index));
	};

	// 复制单个代码块
	const handleCopyCodeBlock = async (index: number) => {
		const block = codeBlocks[index];
		if (!block) return;
		await navigator.clipboard.writeText(block.code);
	};

	// 右键菜单处理
	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY });
	};

	// 复制为 Markdown
	const handleCopyAsMarkdown = async () => {
		const markdown = `**${isUser ? "User" : "Assistant"}:**\n\n${message.content}`;
		await navigator.clipboard.writeText(markdown);
	};

	// 构建右键菜单项
	const contextMenuItems: ContextMenuItem[] = useMemo(() => {
		const items: ContextMenuItem[] = [
			{
				label: "复制消息",
				icon: <Copy className="w-4 h-4" />,
				onClick: handleCopy,
			},
		];

		if (codeBlocks.length > 0) {
			items.push({
				label: "复制代码",
				icon: <Code className="w-4 h-4" />,
				onClick: () => handleCopyCodeBlock(0),
			});
		}

		items.push({
			label: "复制为 Markdown",
			icon: <FileCode className="w-4 h-4" />,
			onClick: handleCopyAsMarkdown,
		});

		items.push({ label: "", separator: true, onClick: () => {} });

		if (!isUser && onRegenerate) {
			items.push({
				label: "重新生成",
				icon: <RefreshCw className="w-4 h-4" />,
				onClick: () => onRegenerate(message.id),
			});
		}

		if (isUser && onEdit) {
			items.push({
				label: "编辑消息",
				icon: <Edit3 className="w-4 h-4" />,
				onClick: () => onEdit(message.id),
			});
		}

		if (onDelete) {
			items.push({
				label: "删除消息",
				icon: <Trash2 className="w-4 h-4" />,
				onClick: () => onDelete(message.id),
				danger: true,
			});
		}

		return items;
	}, [isUser, codeBlocks.length, onRegenerate, onEdit, onDelete, message.id]);

	return (
		<>
			<div
				className={`group mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full`}
				onContextMenu={handleContextMenu}
			>
				{/* 彻底移除头像，根据角色采用完全不同的布局策略 */}

				{isUser ? (
					/* 用户消息：右侧悬浮布局，附件显示在上方 */
					<div className="flex flex-col items-end pl-12 gap-2">
						{/* 附件卡片列表 */}
						{message.metadata?.attachedFiles &&
							message.metadata.attachedFiles.length > 0 && (
								<AttachmentList files={message.metadata.attachedFiles} />
							)}
						{/* 消息气泡 */}
						<div className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl rounded-tr-sm px-5 py-3 shadow-sm text-sm leading-6 selection:bg-zinc-700 dark:selection:bg-zinc-300 select-text">
							<div className="whitespace-pre-wrap break-words">
								{message.content}
							</div>
						</div>
					</div>
				) : (
					/* AI 消息：全宽文档流 (纯粹的内容感) */
					<div className="w-full pr-2">
						{/* 流式预览卡片 - 在内容之前显示 */}
						{streamingWebPreview && (
							<div className="mb-3">
								<WebPreviewCard
									kind={streamingWebPreview.kind}
									title={
										streamingWebPreview.kind === "react"
											? "React 预览"
											: "前端预览"
									}
									html={
										streamingWebPreview.kind === "html"
											? streamingWebPreview.html
											: undefined
									}
									jsx={
										streamingWebPreview.kind === "react"
											? streamingWebPreview.jsx
											: undefined
									}
									css={streamingWebPreview.css}
									js={
										streamingWebPreview.kind === "html"
											? streamingWebPreview.js
											: undefined
									}
									isStreaming={true}
								/>
							</div>
						)}

						{/* AI 内容渲染区 */}
						<div className="text-sm text-zinc-800 dark:text-zinc-200 leading-7 w-full overflow-hidden select-text">
							{canRenderAssistantByBlocks ? (
								<AgentBlocksInline blocks={message.metadata!.blocks!} />
							) : (
								<>
									{/* 渲染 Markdown 内容,代码块会被预览卡片替换 */}
									{message.content
										.split(
											/(<<<<AI_UPDATE_PENDING>>>>|<<<<AI_CREATE_PENDING>>>>|<<<<AI_UPDATE_DONE>>>>|<<<<AI_CREATE_DONE>>>>)/,
										)
										.map((part, idx) => {
											if (part === "<<<<AI_UPDATE_PENDING>>>>")
												return <ProcessingCard key={idx} type="update" />;
											if (part === "<<<<AI_CREATE_PENDING>>>>")
												return <ProcessingCard key={idx} type="create" />;
											if (part === "<<<<AI_UPDATE_DONE>>>>") {
												const update = message.metadata?.fileUpdates?.find(
													(u) => u.type === "update",
												);
												if (update)
													return <FileChangeCard key={idx} update={update} />;
												return null;
											}
											if (part === "<<<<AI_CREATE_DONE>>>>") {
												const update = message.metadata?.fileUpdates?.find(
													(u) => u.type === "create",
												);
												if (update)
													return <FileChangeCard key={idx} update={update} />;
												return null;
											}
											if (!part || !part.trim()) return null;
											return (
												<div
													key={idx}
													className="markdown-prose prose-sm dark:prose-invert max-w-none prose-p:leading-7 prose-headings:font-semibold prose-headings:tracking-tight prose-strong:font-medium prose-a:text-indigo-500 hover:prose-a:text-indigo-600 transition-colors my-1.5"
												>
													<MarkdownRenderer
														content={part}
														isStreaming={isStreaming}
														sandboxDir={
															typeof (message.metadata as any)?.sandboxDir ===
															"string"
																? (message.metadata as any).sandboxDir
																: undefined
														}
													/>
												</div>
											);
										})}
								</>
							)}

							{!canRenderAssistantByBlocks ? (
								<>
									{/* 兼容旧消息 */}
									{!message.content.includes("<<<<AI_UPDATE_DONE>>>>") &&
										!message.content.includes("<<<<AI_CREATE_DONE>>>>") &&
										message.metadata?.fileUpdates?.map((update, idx) => (
											<FileChangeCard key={`update-${idx}`} update={update} />
										))}

									{(!message.metadata?.fileUpdates ||
										message.metadata.fileUpdates.length === 0) &&
									Array.isArray(message.metadata?.blocks)
										? message.metadata.blocks.map((b, idx) =>
												b.type === "file_update" ? (
													<FileChangeCard
														key={`block-file-update-${idx}`}
														update={b.update}
													/>
												) : null,
											)
										: null}
								</>
							) : null}

							{isStreaming && !message.content.includes("<<<<") && (
								<span className="inline-block w-1.5 h-4 ml-1 bg-zinc-400 animate-pulse rounded-full align-middle" />
							)}
						</div>

						{/* Actions for assistant messages - 底部工具栏 */}
						{!isStreaming && message.content && (
							<div className="flex flex-col gap-2 mt-3">
								{/* 代码块操作 */}
								{codeBlocks.length > 0 && (
									<div className="flex flex-wrap gap-2">
										{codeBlocks.map((block, idx) => (
											<div
												key={idx}
												className="flex items-center gap-1 bg-white dark:bg-zinc-800 rounded-lg p-1 ring-1 ring-zinc-200 dark:ring-zinc-700"
											>
												<span className="text-[10px] text-zinc-500 px-1.5 font-mono font-medium uppercase">
													{block.language || "code"}
												</span>
												<div className="h-3 w-px bg-zinc-200 dark:bg-zinc-700" />
												<button
													onClick={() => handleCopyCodeBlock(idx)}
													className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 rounded transition-colors"
													title="复制代码"
												>
													<Copy className="w-3 h-3" />
												</button>
												<button
													onClick={() => handleApplyCodeBlock(idx)}
													disabled={appliedBlocks.has(idx)}
													className={`p-1.5 rounded transition-colors flex items-center gap-1 text-[10px] font-medium ${
														appliedBlocks.has(idx)
															? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20"
															: "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
													}`}
													title="应用代码到编辑器"
												>
													{appliedBlocks.has(idx) ? (
														<Check className="w-3 h-3" />
													) : (
														<Code className="w-3 h-3" />
													)}
												</button>
											</div>
										))}
									</div>
								)}

								{/* 通用操作 + Token 显示 */}
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
										<button
											onClick={handleCopy}
											className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
										>
											{copied ? (
												<Check className="w-3 h-3" />
											) : (
												<Copy className="w-3 h-3" />
											)}
											{copied ? "已复制" : "复制"}
										</button>
										<button
											onClick={handleApply}
											className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
										>
											<FileText className="w-3 h-3" />
											追加
										</button>
										{onRegenerate && (
											<button
												onClick={() => onRegenerate(message.id)}
												className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
												title="重新生成此回复"
											>
												<RefreshCw className="w-3 h-3" />
												重新生成
											</button>
										)}
									</div>

									{/* Token 消耗显示 - 右侧 */}
									{message.metadata?.tokenUsage && (
										<TokenDisplay
											promptTokens={message.metadata.tokenUsage.promptTokens}
											completionTokens={
												message.metadata.tokenUsage.completionTokens
											}
											totalTokens={message.metadata.tokenUsage.totalTokens}
										/>
									)}
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{/* 右键菜单 */}
			{contextMenu && (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={contextMenuItems}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</>
	);
}

export const ChatMessage = memo(ChatMessageImpl, (prev, next) => {
	return (
		prev.message === next.message &&
		prev.preferBlocks === next.preferBlocks &&
		prev.onRegenerate === next.onRegenerate &&
		prev.onEdit === next.onEdit &&
		prev.onDelete === next.onDelete
	);
});
