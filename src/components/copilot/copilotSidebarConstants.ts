import { lazy } from "react";
import { chatStore as chatStoreInstance } from "../../lib/chat/store";

/**
 * 把 chatStore 上的所有 action 方法 bind 到实例后导出，避免 CopilotSidebar 主组件
 * 反复声明 .bind(chatStoreInstance)。新增 chat action 时只在这里加一行。
 */
export const chatActions = {
	createNewSession: chatStoreInstance.createNewSession.bind(chatStoreInstance),
	setActiveSession: chatStoreInstance.setActiveSession.bind(chatStoreInstance),
	deleteSession: chatStoreInstance.deleteSession.bind(chatStoreInstance),
	deleteSessionWithUndo:
		chatStoreInstance.deleteSessionWithUndo.bind(chatStoreInstance),
	undoDeleteSession:
		chatStoreInstance.undoDeleteSession.bind(chatStoreInstance),
	addMessage: chatStoreInstance.addMessage.bind(chatStoreInstance),
	updateMessage: chatStoreInstance.updateMessage.bind(chatStoreInstance),
	replaceSessionMessages:
		chatStoreInstance.replaceSessionMessages.bind(chatStoreInstance),
	updateSessionTitle:
		chatStoreInstance.updateSessionTitle.bind(chatStoreInstance),
	setSessionAgentSessionId:
		chatStoreInstance.setSessionAgentSessionId.bind(chatStoreInstance),
	setSessionSdkSessionId:
		chatStoreInstance.setSessionSdkSessionId.bind(chatStoreInstance),
	setSessionCwd: chatStoreInstance.setSessionCwd.bind(chatStoreInstance),
	setStatus: chatStoreInstance.setStatus.bind(chatStoreInstance),
	deleteMessage: chatStoreInstance.deleteMessage.bind(chatStoreInstance),
};

/** 消息窗口虚拟化参数 — 一次渲染多少 / 触底再加载多少 */
export const MESSAGE_WINDOW_SIZE = 140;
export const MESSAGE_WINDOW_STEP = 120;

/** 提示词库 Modal — 懒加载 */
export const LazyPromptLibraryModal = lazy(async () => {
	const mod = await import("../PromptLibraryModal");
	return { default: mod.PromptLibraryModal };
});
