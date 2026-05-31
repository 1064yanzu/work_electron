// 单条聊天消息组件
import {
	Check,
	Code,
	Copy,
	Edit3,
	FileCode,
	RefreshCw,
	Trash2,
	Volume2,
} from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type { ChatMessage as ChatMessageType } from "../../lib/chat/types";
import { EVENTS, events } from "../../lib/events";
import {
	forgetSpokenMessage,
	requestAutoSpeak,
	sanitizeForSpeech,
	useTTS,
	useTtsStoreSelector,
} from "../../lib/tts";
import ToolCallInline from "../agent/ToolCallInline";
import { TTSToolbarButton } from "../tts/TTSToolbarButton";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { AgentBlocksInline } from "./AgentBlocksInline";
import { AttachmentList } from "./AttachmentCard";
import { ChatMessageAssistantContent } from "./ChatMessageAssistantContent";
import { InlineEditBubble } from "./InlineEditBubble";
import { TokenDisplay } from "./TokenDisplay";
import { extractCodeBlocks } from "./chatMessageDerivations";

interface ChatMessageProps {
	message: ChatMessageType;
	preferBlocks?: boolean;
	onRegenerate?: (messageId: string) => void; // 重新生成回调
	onEditSubmit?: (messageId: string, newContent: string) => void; // 编辑后重发
	onDelete?: (messageId: string) => void; // 删除回调
	/** 最后一条用户消息且会话处于 error 状态，显示重试 */
	isFailedUserMessage?: boolean;
}

function ChatMessageImpl({
	message,
	preferBlocks = true,
	onRegenerate,
	onEditSubmit,
	onDelete,
	isFailedUserMessage,
}: ChatMessageProps) {
	const [copied, setCopied] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [appliedBlocks, setAppliedBlocks] = useState<Set<number>>(new Set());
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const isUser = message.role === "user";
	const isStreaming = !!message.isStreaming;

	const tts = useTTS({ scope: "chat" });
	const chatAuto = useTtsStoreSelector(
		(s) => s.settings?.scene_chat_auto ?? false,
	);
	const chatEnabled = useTtsStoreSelector(
		(s) => s.settings?.scene_chat_enabled ?? false,
	);

	// 自动播报：助手消息。
	useEffect(() => {
		if (isUser) return;
		if (!chatAuto || !chatEnabled) return;
		if (!message.content) return;
		requestAutoSpeak({
			messageId: message.id,
			content: message.content,
			isStreaming,
			timestamp: message.timestamp,
		});
	}, [
		isUser,
		chatAuto,
		chatEnabled,
		message.id,
		message.content,
		message.timestamp,
		isStreaming,
	]);

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
	const messageTaskId =
		message.metadata?.taskId ||
		(message.metadata?.trace?.type === "agent_task"
			? message.metadata.trace.taskId
			: undefined);

	if (renderableAgentBlocks) {
		return (
			<div
				className="group mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full"
				style={{
					contentVisibility: "auto",
					containIntrinsicSize: "320px",
				}}
			>
				<AgentBlocksInline
					blocks={message.metadata!.blocks!}
					isStreaming={isStreaming}
					summaryTaskId={messageTaskId}
				/>
			</div>
		);
	}

	if (
		message.role === "trace" &&
		message.metadata?.trace?.type === "agent_task"
	) {
		if (!Array.isArray(message.metadata?.blocks)) return null;

		return (
			<div
				className="group mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full"
				style={{
					contentVisibility: "auto",
					containIntrinsicSize: "320px",
				}}
			>
				<AgentBlocksInline
					blocks={message.metadata.blocks}
					isStreaming={isStreaming}
					summaryTaskId={messageTaskId}
				/>
			</div>
		);
	}

	if (
		message.role === "trace" &&
		message.metadata?.trace?.type === "tool_call"
	) {
		return (
			<div
				className="group mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full"
				style={{
					contentVisibility: "auto",
					containIntrinsicSize: "320px",
				}}
			>
				{Array.isArray(message.metadata?.blocks) ? (
					<AgentBlocksInline
						blocks={message.metadata.blocks}
						isStreaming={isStreaming}
						summaryTaskId={messageTaskId}
					/>
				) : (
					<ToolCallInline
						taskId={message.metadata.trace.taskId}
						toolCallId={message.metadata.trace.toolCallId}
					/>
				)}
			</div>
		);
	}

	// 提取代码块
	const codeBlocks = useMemo(
		() =>
			message.content.includes("```") ? extractCodeBlocks(message.content) : [],
		[message.content],
	);

	const streamingWebPreview = null;

	const handleCopy = async () => {
		await navigator.clipboard.writeText(message.content);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleApplyCodeBlock = (index: number) => {
		const block = codeBlocks[index];
		if (!block) return;

		events.emit(EVENTS.AI_WRITE_TO_OUTPUT, {
			content: block.code,
			prompt: `应用 ${block.language} 代码`,
			type: "diff",
			originalContent: "",
		});

		setAppliedBlocks((prev) => new Set(prev).add(index));
	};

	const handleCopyCodeBlock = async (index: number) => {
		const block = codeBlocks[index];
		if (!block) return;
		await navigator.clipboard.writeText(block.code);
	};

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY });
	};

	const handleCopyAsMarkdown = async () => {
		const markdown = `**${isUser ? "User" : "Assistant"}:**\n\n${message.content}`;
		await navigator.clipboard.writeText(markdown);
	};

	const handleEditSubmit = (newContent: string) => {
		setIsEditing(false);
		onEditSubmit?.(message.id, newContent);
	};

	const handleRetry = () => {
		onEditSubmit?.(message.id, message.content);
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

		if (!isUser && message.content?.trim()) {
			items.push({
				label: "朗读",
				icon: <Volume2 className="w-4 h-4" />,
				onClick: () => {
					const clean = sanitizeForSpeech(message.content);
					if (!clean) return;
					void tts.speak(clean, { force: true });
				},
			});
		}

		if (!isUser && onRegenerate) {
			items.push({
				label: "重新生成",
				icon: <RefreshCw className="w-4 h-4" />,
				onClick: () => {
					forgetSpokenMessage(message.id);
					onRegenerate(message.id);
				},
			});
		}

		if (isUser && onEditSubmit) {
			items.push({
				label: "编辑消息",
				icon: <Edit3 className="w-4 h-4" />,
				onClick: () => setIsEditing(true),
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
	}, [
		isUser,
		codeBlocks.length,
		onRegenerate,
		onEditSubmit,
		onDelete,
		message.id,
		message.content,
		tts.speak,
	]);

	return (
		<>
			<div
				className={`group mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full`}
				onContextMenu={handleContextMenu}
				data-message-id={message.id}
				style={{
					contentVisibility: "auto",
					containIntrinsicSize: "320px",
				}}
			>
				{isUser ? (
					/* 用户消息：右侧悬浮布局，group/user 支持 hover 工具栏 */
					<div
						className="flex flex-col items-end pl-12 gap-2 group/user"
						data-user-message-id={message.id}
					>
						{/* 附件卡片列表 */}
						{message.metadata?.attachedFiles &&
							message.metadata.attachedFiles.length > 0 && (
								<AttachmentList files={message.metadata.attachedFiles} />
							)}

						{/* 编辑态 or 普通气泡 */}
						{isEditing ? (
							<InlineEditBubble
								initialValue={message.content}
								onSubmit={handleEditSubmit}
								onCancel={() => setIsEditing(false)}
							/>
						) : (
							<div className="bg-text-primary text-surface rounded-2xl rounded-tr-sm px-5 py-3 shadow-whisper text-sm leading-6 selection:bg-dark-surface dark:selection:bg-border select-text">
								<div className="whitespace-pre-wrap break-words">
									{message.content}
								</div>
							</div>
						)}

						{/* Hover 工具栏（仅非编辑态） */}
						{!isEditing && (
							<div className="flex items-center gap-3 opacity-0 translate-y-1 group-hover/user:opacity-100 group-hover/user:translate-y-0 transition-[opacity,transform] duration-200 ease-out">
								<button
									type="button"
									onClick={handleCopy}
									className="flex items-center gap-1.5 text-xs font-medium text-text-light hover:text-text-secondary transition-colors"
									title="复制消息"
								>
									{copied ? (
										<Check className="w-3 h-3" />
									) : (
										<Copy className="w-3 h-3" />
									)}
									{copied ? "已复制" : "复制"}
								</button>
								{onEditSubmit && (
									<button
										type="button"
										onClick={() => setIsEditing(true)}
										className="flex items-center gap-1.5 text-xs font-medium text-text-light hover:text-text-secondary transition-colors"
										title="编辑此消息"
									>
										<Edit3 className="w-3 h-3" />
										编辑
									</button>
								)}
								{onDelete && (
									<button
										type="button"
										onClick={() => onDelete(message.id)}
										className="flex items-center gap-1.5 text-xs font-medium text-text-light hover:text-red-400 transition-colors"
										title="删除此消息"
									>
										<Trash2 className="w-3 h-3" />
										删除
									</button>
								)}
							</div>
						)}

						{/* C.4 发送失败重试 */}
						{isFailedUserMessage && !isEditing && (
							<button
								type="button"
								onClick={handleRetry}
								className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-600 transition-colors"
							>
								<span>⚠</span>
								<span>发送失败 · 点击重试</span>
							</button>
						)}
					</div>
				) : (
					/* AI 消息：全宽文档流 */
					<div className="w-full pr-2">
						<ChatMessageAssistantContent
							message={message}
							canRenderAssistantByBlocks={canRenderAssistantByBlocks}
							isStreaming={isStreaming}
							streamingWebPreview={streamingWebPreview}
						/>

						{/* Actions for assistant messages - 底部工具栏 */}
						{!isStreaming && message.content && (
							<div className="flex flex-col gap-2 mt-3">
								{/* 代码块操作 */}
								{codeBlocks.length > 0 && (
									<div className="flex flex-wrap gap-2">
										{codeBlocks.map((block, idx) => (
											<div
												key={idx}
												className="flex items-center gap-1 bg-surface rounded-lg p-1 ring-1 ring-border dark:ring-dark-surface"
											>
												<span className="text-[10px] text-text-muted px-1.5 font-mono font-medium uppercase">
													{block.language || "code"}
												</span>
												<div className="h-3 w-px bg-warm-300" />
												<button
													onClick={() => handleCopyCodeBlock(idx)}
													className="p-1.5 text-text-muted hover:text-text-primary hover:bg-warm-200 rounded transition-colors"
													title="复制代码"
												>
													<Copy className="w-3 h-3" />
												</button>
												<button
													onClick={() => handleApplyCodeBlock(idx)}
													disabled={appliedBlocks.has(idx)}
													className={`p-1.5 rounded transition-colors flex items-center gap-1 text-[10px] font-medium ${
														appliedBlocks.has(idx)
															? "text-success bg-success/8 dark:bg-emerald-900/20"
															: "text-text-muted hover:text-text-primary hover:bg-warm-200"
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
											className="flex items-center gap-1.5 text-xs font-medium text-text-light hover:text-text-secondary dark:hover:text-text-light transition-colors"
										>
											{copied ? (
												<Check className="w-3 h-3" />
											) : (
												<Copy className="w-3 h-3" />
											)}
											{copied ? "已复制" : "复制"}
										</button>
										<TTSToolbarButton
											text={sanitizeForSpeech(message.content)}
											scope="chat"
											label="朗读"
										/>
										{onRegenerate && (
											<button
												onClick={() => {
													forgetSpokenMessage(message.id);
													onRegenerate(message.id);
												}}
												className="flex items-center gap-1.5 text-xs font-medium text-text-light hover:text-text-secondary dark:hover:text-text-light transition-colors"
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
											cacheReadInputTokens={
												message.metadata.tokenUsage.cacheReadInputTokens
											}
											cacheCreationInputTokens={
												message.metadata.tokenUsage.cacheCreationInputTokens
											}
											costUsd={message.metadata.tokenUsage.costUsd}
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
		prev.onEditSubmit === next.onEditSubmit &&
		prev.onDelete === next.onDelete &&
		prev.isFailedUserMessage === next.isFailedUserMessage
	);
});
