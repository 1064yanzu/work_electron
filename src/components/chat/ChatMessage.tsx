// 单条聊天消息组件
import {
	AlertTriangle,
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
import { TTSToolbarButton } from "../tts/TTSToolbarButton";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { Tooltip } from "../ui/Tooltip";
import { AttachmentList } from "./AttachmentCard";
import { ChatMessageAssistantContent } from "./ChatMessageAssistantContent";
import { ChatTraceMessage, shouldRenderAsTrace } from "./ChatTraceMessage";
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
	/**
	 * 关闭 `content-visibility: auto` 离屏优化。
	 *
	 * 虚拟化列表必须传 true：@tanstack/react-virtual 的 `measureElement` 靠真实
	 * 布局高度回填测量缓存，而 `content-visibility: auto` 会让离屏子树跳过布局、
	 * 只汇报 `contain-intrinsic-size` 的占位高度（320px）。两者同时开启会把假高度
	 * 写进虚拟化的测量缓存，`getTotalSize()` 失真、上滚出现跳动。
	 * 非虚拟化路径（全量渲染）没有 measureElement，保留该优化。
	 */
	disableContentVisibility?: boolean;
}

function ChatStandardMessageImpl({
	message,
	preferBlocks = true,
	onRegenerate,
	onEditSubmit,
	onDelete,
	isFailedUserMessage,
	disableContentVisibility,
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
				className={`group animate-in fade-in slide-in-from-bottom-2 duration-250 w-full`}
				onContextMenu={handleContextMenu}
				data-message-id={message.id}
				style={
					disableContentVisibility
						? undefined
						: {
								contentVisibility: "auto",
								// auto 前缀让浏览器记住真实渲染高度（消除快速滚动时
								// 滚动条抖动）；后面的长度只是首渲染前的估值，按消息
								// 类型差异化：用户消息通常一两行，助手回复偏长
								containIntrinsicSize: isUser ? "auto 96px" : "auto 480px",
							}
				}
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
							<div className="bg-text-primary text-surface rounded-2xl rounded-tr-sm px-5 py-3 shadow-whisper text-sm leading-6 select-text">
								<div className="whitespace-pre-wrap break-words">
									{message.content}
								</div>
							</div>
						)}

						{/* Hover 工具栏（仅非编辑态） */}
						{!isEditing && (
							<div className="flex items-center gap-3 opacity-0 translate-y-1 group-hover/user:opacity-100 group-hover/user:translate-y-0 transition-[opacity,transform] duration-150 ease-out">
								<button
									type="button"
									onClick={handleCopy}
									className="flex items-center gap-1.5 text-xs font-medium text-text-light hover:text-text-secondary transition-colors"
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
									>
										<Edit3 className="w-3 h-3" />
										编辑
									</button>
								)}
								{onDelete && (
									<button
										type="button"
										onClick={() => onDelete(message.id)}
										className="flex items-center gap-1.5 text-xs font-medium text-text-light hover:text-error transition-colors"
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
								className="flex items-center gap-1 px-2 py-1 -mx-2 rounded-lg text-xs text-warning hover:text-warning/80 hover:bg-warning-muted transition-colors"
							>
								<AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
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
												<span className="text-2xs text-text-muted px-1.5 font-mono font-medium uppercase">
													{block.language || "code"}
												</span>
												<div className="h-3 w-px bg-warm-300" />
												<Tooltip content="复制代码" placement="top">
													<button
														onClick={() => handleCopyCodeBlock(idx)}
														className="p-1.5 text-text-muted hover:text-text-primary hover:bg-warm-200 rounded transition-colors"
													>
														<Copy className="w-3 h-3" />
													</button>
												</Tooltip>
												<Tooltip content="应用代码到编辑器" placement="top">
													<button
														onClick={() => handleApplyCodeBlock(idx)}
														disabled={appliedBlocks.has(idx)}
														className={`p-1.5 rounded transition-colors flex items-center gap-1 text-2xs font-medium ${
															appliedBlocks.has(idx)
																? "text-success bg-success/8"
																: "text-text-muted hover:text-text-primary hover:bg-warm-200"
														}`}
													>
														{appliedBlocks.has(idx) ? (
															<Check className="w-3 h-3" />
														) : (
															<Code className="w-3 h-3" />
														)}
													</button>
												</Tooltip>
											</div>
										))}
									</div>
								)}

								{/* 通用操作 + Token 显示 */}
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
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

const ChatStandardMessage = memo(ChatStandardMessageImpl);

/**
 * 单条聊天消息。
 *
 * 这是一个**不含任何 Hook** 的分派器：trace 消息交给 `ChatTraceMessage`，
 * 其余走 `ChatStandardMessage`。两个子组件各自的 Hook 数量恒定，因此流式期间
 * 往 `metadata.blocks` 追加块导致分支翻转时，React 只会卸载/挂载不同类型的组件，
 * 不会出现 Hook 数量错位（原实现在 Hook 之间做条件 early return，会抛
 * "Rendered fewer hooks than expected"）。
 */
export const ChatMessage = memo(function ChatMessage(props: ChatMessageProps) {
	if (shouldRenderAsTrace(props.message)) {
		return (
			<ChatTraceMessage
				message={props.message}
				disableContentVisibility={props.disableContentVisibility}
			/>
		);
	}
	return <ChatStandardMessage {...props} />;
});
