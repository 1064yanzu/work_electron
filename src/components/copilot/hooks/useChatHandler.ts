// Chat 模式消息处理 Hook

import { diffLines } from "diff";
import { invokeLlmWithCallback } from "../../../lib/chat/api";
import {
	filterThoughtBlocksForPersistence,
	StreamBlocksBuilder,
} from "../../../lib/chat/streamBlocksBuilder";
import { createMessage } from "../../../lib/chat/types";
import { EVENTS, events } from "../../../lib/events";
import { getChatSystemPrompt } from "../../../lib/prompts";
import { workspaceStore } from "../../../lib/workspaceStore";
import { parseWriteContent } from "../../../lib/chat/docProtocol";
import type { ChatStoreLike } from "../types";
import type { SlashCommand } from "../../chat/SlashCommand";

interface UseChatHandlerOptions {
	chatStore: ChatStoreLike;
	activeModel: string | null;
	debugLog: (...args: unknown[]) => void;
	onFirstUserMessage?: (
		sessionId: string,
		firstMessage: string,
		fallbackModel?: string,
	) => void;
	queueCreateProposal: (payload: {
		title: string;
		summary: string;
		content: string;
		prompt: string;
	}) => void;
	setAbortController: (controller: AbortController | null) => void;
}

export function useChatHandler({
	chatStore,
	activeModel,
	debugLog,
	onFirstUserMessage,
	queueCreateProposal,
	setAbortController,
}: UseChatHandlerOptions) {
	const handleChatModeMessage = async (
		content: string,
		session: NonNullable<ChatStoreLike["activeSession"]>,
		userTextForChat: string,
		command: SlashCommand | undefined,
		skipUserMessage: boolean | undefined,
	) => {
		// 构建系统提示词 - 使用可配置的提示词
		let systemPrompt = await getChatSystemPrompt(
			workspaceStore.getActiveDocContent() || "",
		);

		const isWriteMode = command?.category === "skill";
		if (isWriteMode) {
			systemPrompt += `\n\n用户请求你帮助写作或编辑内容，请优先考虑使用上述协议格式输出。`;
		}

		// 添加用户消息（只有在非重新生成时）
		const shouldGenerateTitle = !skipUserMessage && session.messages.length === 0;
		if (!skipUserMessage) {
			const userMessage = createMessage("user", userTextForChat);
			chatStore.addMessage(session.id, userMessage);
			if (shouldGenerateTitle) {
				onFirstUserMessage?.(
					session.id,
					content,
					session.model || activeModel || undefined,
				);
			}
		}

		const streamBuilder = new StreamBlocksBuilder({
			thoughtMaxChars: 64 * 1024,
		});

		// 创建 AI 消息
		const assistantMessage = createMessage("assistant", "", {
			isStreaming: true,
			model: activeModel ?? undefined,
			metadata: {
				blocks: streamBuilder.getBlocks(),
			},
		});
		chatStore.addMessage(session.id, assistantMessage);
		chatStore.setStatus("streaming");

		// 创建 abort controller
		const controller = new AbortController();
		setAbortController(controller);

		let accumulatedRawContent = "";
		let accumulatedContent = "";
		let isUpdatingDoc = false;
		let isCreatingDoc = false;
		let docContentBuffer = "";

		// 组装最近消息上下文（最多取最近 8 条用户/助手消息）
		const recentMessages = session.messages
			.filter((m) => m.role === "user" || m.role === "assistant")
			.slice(-8)
			.map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content}`)
			.filter(Boolean);

		const contextTexts = [
			...recentMessages,
			...workspaceStore.getContextPromptText(),
		];

		await invokeLlmWithCallback({
			model: activeModel ?? "",
			prompt: userTextForChat,
			systemPrompt,
			context: contextTexts,
			onChunk: (chunk: string) => {
				accumulatedRawContent += chunk;
				streamBuilder.appendTextChunk(chunk);
				accumulatedContent = streamBuilder.getText();

				// 检测 AI 协议标记
				if (!isUpdatingDoc && !isCreatingDoc) {
					if (accumulatedContent.includes(":::update-doc")) {
						isUpdatingDoc = true;
						events.emit(EVENTS.AI_DOC_UPDATE_START, {});
						debugLog("[CopilotSidebar] AI 开始修改文档");
					} else if (accumulatedContent.includes(":::create-doc")) {
						isCreatingDoc = true;
						events.emit(EVENTS.AI_DOC_CREATE_START, {});
						debugLog("[CopilotSidebar] AI 开始创建新文档");
					}
				}

				// 收集文档内容
				if (isUpdatingDoc || isCreatingDoc) {
					// 提取标记之间的内容
					const startMarker = isUpdatingDoc ? ":::update-doc" : ":::create-doc";
					const startIndex = accumulatedContent.indexOf(startMarker);
					if (startIndex !== -1) {
						const contentAfterMarker = accumulatedContent.slice(
							startIndex + startMarker.length,
						);
						const endIndex = contentAfterMarker.indexOf(":::");
						if (endIndex !== -1) {
							// 找到结束标记
							docContentBuffer = contentAfterMarker.slice(0, endIndex).trim();

							// 触发完成事件
							if (isUpdatingDoc) {
								// 计算 Diff 统计
								const originalContent =
									workspaceStore.getActiveDocContent() || "";
								const changes = diffLines(originalContent, docContentBuffer);
								let additions = 0;
								let deletions = 0;
								changes.forEach((part) => {
									if (part.added) additions += part.count || 0;
									if (part.removed) deletions += part.count || 0;
								});

								// 获取文档标题
								const state = workspaceStore.getState();
								const docTitle =
									(state.activeDocId &&
										state.docCache[state.activeDocId]?.title) ||
									"当前文档";

								// 更新消息 metadata
								chatStore.updateMessage(session.id, assistantMessage.id, {
									metadata: {
										fileUpdates: [
											{
												fileName: docTitle,
												type: "update",
												additions,
												deletions,
											},
										],
									},
								});

								events.emit(EVENTS.AI_DOC_UPDATE_END, {
									originalContent: workspaceStore.getActiveDocContent(),
									suggestedContent: docContentBuffer,
									prompt: command?.name || content.slice(0, 50),
								});
								debugLog("[CopilotSidebar] AI 完成文档修改");
							} else if (isCreatingDoc) {
								// 解析 create-doc 内容
								const lines = docContentBuffer.split("\n");
								let title = "新文档";
								let summary = "";
								let docContent = docContentBuffer;

								for (let i = 0; i < lines.length; i++) {
									const line = lines[i].trim();
									if (line.startsWith("标题:") || line.startsWith("标题：")) {
										title = line.replace(/^标题[:：]\s*/, "");
									} else if (
										line.startsWith("摘要:") ||
										line.startsWith("摘要：")
									) {
										summary = line.replace(/^摘要[:：]\s*/, "");
									} else if (
										line.startsWith("内容:") ||
										line.startsWith("内容：")
									) {
										docContent = lines
											.slice(i + 1)
											.join("\n")
											.trim();
										break;
									}
								}

								// 计算 Diff (全部新增)
								const changes = diffLines("", docContent);
								let additions = 0;
								changes.forEach((part) => {
									if (part.added) additions += part.count || 0;
								});

								// 更新消息 metadata
								chatStore.updateMessage(session.id, assistantMessage.id, {
									metadata: {
										fileUpdates: [
											{
												fileName: title,
												type: "create",
												additions,
												deletions: 0,
											},
										],
									},
								});

								queueCreateProposal({
									title,
									summary,
									content: docContent,
									prompt: command?.name || content.slice(0, 50),
								});
								debugLog("[CopilotSidebar] AI 完成新文档创建");
							}

							isUpdatingDoc = false;
							isCreatingDoc = false;
						} else {
							// 还没有结束标记，继续收集
							docContentBuffer = contentAfterMarker.trim();
							if (isUpdatingDoc) {
								events.emit(EVENTS.AI_DOC_UPDATE_STREAM, docContentBuffer);
							}
						}
					}
				}

				// 更新聊天消息（隐藏协议标记，使用特殊占位符）
				let displayContent = accumulatedContent;

				// 处理 update-doc 协议
				// 1. 如果正在更新，显示 PENDING
				if (isUpdatingDoc) {
					const startIdx = accumulatedContent.indexOf(":::update-doc");
					if (startIdx !== -1) {
						// 保留协议前的内容 + 正在修改的占位符
						displayContent =
							accumulatedContent.slice(0, startIdx) +
							"\n<<<AI_UPDATE_PENDING>>>";
					}
				}
				// 2. 如果正在创建，显示 PENDING
				else if (isCreatingDoc) {
					const startIdx = accumulatedContent.indexOf(":::create-doc");
					if (startIdx !== -1) {
						// 保留协议前的内容 + 正在创建的占位符
						displayContent =
							accumulatedContent.slice(0, startIdx) +
							"\n<<<AI_CREATE_PENDING>>>";
					}
				}
				// 3. 如果协议已完成，将协议块替换为 DONE 占位符（保留前后文本）
				else {
					displayContent = displayContent
						.replace(/:::update-doc[\s\S]*?:::/g, "\n<<<AI_UPDATE_DONE>>>\n")
						.replace(/:::create-doc[\s\S]*?:::/g, "\n<<<AI_CREATE_DONE>>>\n");

					// 清理可能的残留
					if (
						displayContent.includes(":::update-doc") ||
						displayContent.includes(":::create-doc")
					) {
						displayContent = displayContent
							.replace(/:::update-doc[\s\S]*/g, "\n<<<AI_UPDATE_PENDING>>>")
							.replace(/:::create-doc[\s\S]*/g, "\n<<<AI_CREATE_PENDING>>>");
					}
				}

				chatStore.updateMessage(session.id, assistantMessage.id, {
					content: displayContent,
					metadata: {
						blocks: streamBuilder.getBlocks(),
					},
				});
			},
			onThoughtChunk: (chunk, meta) => {
				streamBuilder.appendThoughtChunk(chunk, meta);
				accumulatedContent = streamBuilder.getText();
				chatStore.updateMessage(session.id, assistantMessage.id, {
					content: accumulatedContent,
					metadata: {
						blocks: streamBuilder.getBlocks(),
					},
				});
			},
			onComplete: () => {
				setAbortController(null);
				streamBuilder.flushParser();
				accumulatedContent = streamBuilder.getText();
				// 兜底处理：如果流结束时仍在修改/创建文档状态（例如结束标记不完整）
				if (isUpdatingDoc || isCreatingDoc) {
					debugLog(
						"[CopilotSidebar] 流结束但状态仍为 processing，执行兜底处理",
					);

					// 尝试提取内容
					const startMarker = isUpdatingDoc ? ":::update-doc" : ":::create-doc";
					const startIdx = accumulatedContent.indexOf(startMarker);

					if (startIdx !== -1) {
						// 截取从标记开始到末尾的内容
						let extractedContent = accumulatedContent.slice(
							startIdx + startMarker.length,
						);
						// 去除末尾可能的未完成标记 (如 ":" 或 "::")
						extractedContent = extractedContent.replace(/(:+)$/, "").trim();
						docContentBuffer = extractedContent;

						// 执行完成逻辑
						if (isUpdatingDoc) {
							const originalContent =
								workspaceStore.getActiveDocContent() || "";
							const changes = diffLines(originalContent, docContentBuffer);
							let additions = 0;
							let deletions = 0;
							changes.forEach((part) => {
								if (part.added) additions += part.count || 0;
								if (part.removed) deletions += part.count || 0;
							});

							const state = workspaceStore.getState();
							const docTitle =
								(state.activeDocId &&
									state.docCache[state.activeDocId]?.title) ||
								"当前文档";

							chatStore.updateMessage(session.id, assistantMessage.id, {
								metadata: {
									fileUpdates: [
										{
											fileName: docTitle,
											type: "update",
											additions,
											deletions,
										},
									],
								},
							});

							events.emit(EVENTS.AI_DOC_UPDATE_END, {
								originalContent: workspaceStore.getActiveDocContent(),
								suggestedContent: docContentBuffer,
								prompt: command?.name || content.slice(0, 50),
							});
						} else if (isCreatingDoc) {
							const lines = docContentBuffer.split("\n");
							let title = "新文档";
							let summary = "";
							let docContent = docContentBuffer;

							for (let i = 0; i < lines.length; i++) {
								const line = lines[i].trim();
								if (line.startsWith("标题:") || line.startsWith("标题：")) {
									title = line.replace(/^标题[:：]\s*/, "");
								} else if (
									line.startsWith("摘要:") ||
									line.startsWith("摘要：")
								) {
									summary = line.replace(/^摘要[:：]\s*/, "");
								} else if (
									line.startsWith("内容:") ||
									line.startsWith("内容：")
								) {
									docContent = lines
										.slice(i + 1)
										.join("\n")
										.trim();
									break;
								}
							}

							const changes = diffLines("", docContent);
							let additions = 0;
							changes.forEach((part) => {
								if (part.added) additions += part.count || 0;
							});

							chatStore.updateMessage(session.id, assistantMessage.id, {
								metadata: {
									fileUpdates: [
										{
											fileName: title,
											type: "create",
											additions,
											deletions: 0,
										},
									],
								},
							});

							queueCreateProposal({
								title,
								summary,
								content: docContent,
								prompt: command?.name || content.slice(0, 50),
							});
						}
					}
				}

				// 最终清理消息内容，替换所有协议内容为 DONE 占位符
				let finalContent = accumulatedContent;

				// 1. 将完整的协议块替换为 DONE 占位符
				finalContent = finalContent
					.replace(/:::update-doc[\s\S]*?:::?/g, "\n<<<AI_UPDATE_DONE>>>\n")
					.replace(/:::create-doc[\s\S]*?:::?/g, "\n<<<AI_CREATE_DONE>>>\n");

				// 2. 清理可能的未闭合残留（兜底）
				finalContent = finalContent
					.replace(/:::update-doc[\s\S]*/g, "\n<<<AI_UPDATE_DONE>>>\n")
					.replace(/:::create-doc[\s\S]*/g, "\n<<<AI_CREATE_DONE>>>\n");

				chatStore.updateMessage(session.id, assistantMessage.id, {
					content: finalContent,
					isStreaming: false,
					metadata: {
						blocks: filterThoughtBlocksForPersistence(
							[
								{ type: "text", text: finalContent },
								...streamBuilder
									.getBlocks()
									.filter((b) => b.type === "thought"),
							],
							true,
						),
					},
				});
				chatStore.setStatus("idle");

				// 调试：打印 AI 完整响应
				debugLog("[CopilotSidebar] AI 完整响应:", accumulatedRawContent);

				// 兼容旧的写入协议
				const { writeContent } = parseWriteContent(accumulatedContent);
				if (writeContent && !isUpdatingDoc && !isCreatingDoc) {
					const editorContent = workspaceStore.getActiveDocContent();
					events.emit(EVENTS.AI_WRITE_TO_OUTPUT, {
						content: editorContent
							? editorContent + "\n\n" + writeContent
							: writeContent,
						originalContent: editorContent,
						prompt: command?.name || "AI 写作",
						type: "diff",
					});
				}
			},
			onError: (error: string, detail) => {
				setAbortController(null);
				streamBuilder.flushParser();

				// 使用结构化错误信息构建友好的显示内容
				let errorContent: string;
				if (detail) {
					errorContent = `⚠️ **${detail.title}**\n\n${detail.message}\n\n> 💡 ${detail.suggestion}`;
				} else {
					errorContent = `⚠️ ${error}`;
				}

				chatStore.updateMessage(session.id, assistantMessage.id, {
					content: errorContent,
					isStreaming: false,
					metadata: {
						blocks: filterThoughtBlocksForPersistence(
							[
								{ type: "text", text: errorContent },
								...streamBuilder
									.getBlocks()
									.filter((b) => b.type === "thought"),
							],
							true,
						),
						errorDetail: detail
							? {
									code: detail.code,
									title: detail.title,
									httpStatus: detail.httpStatus,
								}
							: undefined,
					},
				});
				chatStore.setStatus(
					"error",
					detail ? detail.title : error,
				);
			},
			onUsage: (usage) => {
				// 将 token 使用数据保存到消息 metadata
				debugLog("[CopilotSidebar] 收到 token usage:", usage);
				chatStore.updateMessage(session.id, assistantMessage.id, {
					metadata: {
						tokenUsage: {
							promptTokens: usage.promptTokens,
							completionTokens: usage.completionTokens,
							totalTokens: usage.totalTokens,
							cacheReadInputTokens: usage.cacheReadInputTokens,
							cacheCreationInputTokens: usage.cacheCreationInputTokens,
						},
					},
				});
			},
		});
	};

	return { handleChatModeMessage };
}
