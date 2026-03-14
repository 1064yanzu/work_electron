// 会话标题自动生成 Hook

import { useCallback, useEffect, useRef } from "react";
import { invokeLlm } from "../../../lib/chat/api";
import { getConfig } from "../../../lib/config";
import { getTitleGenerationPrompt } from "../../../lib/prompts";
import type { ChatStoreLike } from "../types";

interface UseSessionTitleGenerationOptions {
	chatStore: ChatStoreLike;
	activeModel: string | null;
	enabledModels: Array<{ id: string; provider: string }>;
	debugLog: (...args: unknown[]) => void;
}

export function useSessionTitleGeneration({
	chatStore,
	activeModel,
	enabledModels,
	debugLog,
}: UseSessionTitleGenerationOptions) {
	const generatingRef = useRef<Set<string>>(new Set());

	const generateSessionTitle = useCallback(
		async (sessionId: string, firstMessage: string, fallbackModel?: string) => {
			if (generatingRef.current.has(sessionId)) return;

			try {
				generatingRef.current.add(sessionId);

				// 1. 获取配置的生成模型
				const configModel = await getConfig("title_generation_model");
				const modelToUse =
					configModel || fallbackModel || enabledModels[0]?.id || "gpt-4o-mini";

				debugLog(
					`[CopilotSidebar] 开始为会话 ${sessionId.slice(0, 6)}... 生成标题，使用模型: ${modelToUse}`,
				);

				// 2. 调用 LLM 生成标题（使用可配置的提示词）
				const prompt = await getTitleGenerationPrompt(firstMessage);

				// invokeLlm 返回 Promise<string>
				const content = await invokeLlm({
					model: modelToUse,
					prompt,
					temperature: 0.3,
				});

				let title = content?.trim();

				// 3. 校验结果
				if (title) {
					title = title.replace(/^["'《]|^标题[:：]\s*|["'》]$/g, "").trim();
					if (title.length > 20) {
						title = title.slice(0, 20);
					}

					debugLog(`[CopilotSidebar] 标题生成成功: "${title}"`);
					chatStore.updateSessionTitle(sessionId, title);
				} else {
					throw new Error("AI 返回内容为空");
				}
			} catch (error) {
				console.error("[CopilotSidebar] 生成会话标题失败:", error);
				const currentSession = chatStore.sessions.find(
					(s) => s.id === sessionId,
				);
				if (currentSession?.title === "新对话") {
					chatStore.updateSessionTitle(sessionId, firstMessage.slice(0, 15));
				}
			} finally {
				generatingRef.current.delete(sessionId);
			}
		},
		[chatStore, enabledModels, debugLog],
	);

	// 自动补全历史会话标题
	useEffect(() => {
		const backfillTitles = async () => {
			// 延迟执行
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const sessions = chatStore.sessions;
			for (const session of sessions) {
				if (session.messages.length > 0) {
					const firstMsg = session.messages[0].content;
					const defaultTruncated = firstMsg.slice(0, 15);

					const needsGeneration =
						!session.title ||
						session.title === "新对话" ||
						(session.title === defaultTruncated && firstMsg.length > 15) ||
						/^对话 \d{1,2}月\d{1,2}日/.test(session.title);

					if (needsGeneration) {
						await generateSessionTitle(
							session.id,
							firstMsg,
							session.model || activeModel || undefined,
						);
						await new Promise((resolve) => setTimeout(resolve, 500));
					}
				}
			}
		};

		backfillTitles();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [chatStore.sessions.length]);

	return { generateSessionTitle };
}
