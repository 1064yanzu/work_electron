/**
 * usePetQuickReplyBridge — 主窗口接收宠物窗口快捷回复
 *
 * 监听主进程 pet-quick-reply 事件，
 * 将文本注入当前活跃会话并唤起主窗口。
 */

import { useEffect } from "react";
import { chatStore } from "./chat/store";
import { createMessage } from "./chat/types";
import { listen } from "./tauriEventCompat";

interface PetQuickReplyPayload {
	text: string;
}

/**
 * 在 App 根组件中调用，保证主窗口可接收宠物快捷回复。
 * 需要在 CopilotSidebar 可见的上下文中才能完整触发 Agent 发送，
 * 此处仅做消息注入 + 会话创建；Agent 发送由 CopilotSidebar 的
 * 活跃会话机制自动接管。
 */
export function usePetQuickReplyBridge(): void {
	useEffect(() => {
		let disposed = false;
		let unlistenFn: (() => void) | null = null;

		const setup = async () => {
			unlistenFn = await listen<PetQuickReplyPayload>(
				"pet-quick-reply",
				(event) => {
					if (disposed) return;
					const { text } = event.payload;
					if (!text?.trim()) return;

					// 确保有活跃会话
					const state = chatStore.getState();
					let sessionId = state.activeSessionId;

					if (!sessionId) {
						// 没有活跃会话时自动创建
						const newSession = chatStore.createFreshSession("桌面宠物快捷回复");
						sessionId = newSession.id;
						chatStore.setActiveSession(sessionId);
					}

					// 注入用户消息
					const userMessage = createMessage("user", text.trim(), {
						metadata: {
							attachedFiles: [],
						},
					});
					chatStore.addMessage(sessionId, userMessage);
				},
			);
		};

		void setup();

		return () => {
			disposed = true;
			unlistenFn?.();
		};
	}, []);
}
