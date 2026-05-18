/**
 * 设计模块 → Copilot 侧栏 的事件镜像桥（按 design session 锚定）。
 *
 * 设计工作区有自己的 SDK 通道（`createSdkClient` + 临时 skills / permission_mode
 * / allowed_tools），不能并入 `executor.executeCustomTask`。但右栏 CopilotSidebar
 * 监听的全局 `chatStore` / `agentStore` 不知道这次 run，默认显示空欢迎屏。
 *
 * 本模块解决两件事：
 * 1. 每个 design session 绑定一个 chat session（`chatSession.designSessionId`），
 *    打开 design 时把右栏 chat 切到对应那一个 —— 已生成的设计也能看见过往对话流。
 * 2. SDK 的 launch / 流式 / 终止事件实时镜像到 chat + agent store，让右栏可见
 *    Agent 的思考与动作。
 *
 * 模块级单例 mirrorState：draft 拦截、handleStartFromDraft、launchSdk 的 sdk_message
 * 回调都操作同一份，避免 useRef 在组件树外失效（参见 2026-05-17 复发修复）。
 */

import { agentStore } from "../agent/store";
import { chatStore } from "../chat/store";
import { createMessage } from "../chat/types";

interface MirrorState {
	chatSessionId: string;
	assistantMsgId: string;
}

let mirrorState: MirrorState | null = null;

/**
 * 把右栏 chat 切到指定 design session 对应的 chat session。
 *
 * - 找到 → setActiveSession 后返回 true
 * - 没找到 → 不动，返回 false（等首次 mirror 时再 create + 绑定）
 */
export function switchToDesignChat(designSessionId: string): boolean {
	const target = chatStore.findSessionByDesignId(designSessionId);
	if (!target) return false;
	chatStore.setActiveSession(target.id);
	return true;
}

/**
 * 在 design SDK 启动**之前**调用，把用户的简介/原话立刻写到对应 chat session。
 *
 * - 没有绑定过 → `createFreshSession` + 写回 designSessionId
 * - 已经绑定过 → 切到那个 chat session，继续在它末尾追加 user + streaming assistant
 * - chatStore.setStatus("streaming") 让 Copilot 输入框进入 streaming UI
 * - agentStore.startTask("custom", ...) 让 isAgentExecuting=true 激活 status bar
 *
 * 同一时刻只允许一个 mirror state；重复调用会**覆盖**前一个。
 */
export function beginCopilotMirror(
	userText: string,
	designSessionId: string,
	sessionTitle?: string,
): MirrorState | null {
	const trimmed = userText.trim() || "生成设计稿";
	let target = chatStore.findSessionByDesignId(designSessionId);
	if (!target) {
		target = chatStore.createFreshSession(
			sessionTitle ? `设计：${sessionTitle}` : "设计对话",
		);
		chatStore.setSessionDesignId(target.id, designSessionId);
	} else {
		chatStore.setActiveSession(target.id);
	}
	if (!target) return null;

	const userMsg = createMessage("user", trimmed);
	chatStore.addMessage(target.id, userMsg);
	const assistantMsg = createMessage("assistant", "", {
		isStreaming: true,
	});
	chatStore.addMessage(target.id, assistantMsg);
	chatStore.setStatus("streaming");
	agentStore.startTask("custom", trimmed, sessionTitle);

	mirrorState = {
		chatSessionId: target.id,
		assistantMsgId: assistantMsg.id,
	};
	return mirrorState;
}

/**
 * SDK 的 assistant text 流入时调用：把累计文本写到 streaming assistant 消息。
 * 没有进行中的 mirror 时静默。
 */
export function appendCopilotMirror(text: string): void {
	if (!mirrorState) return;
	chatStore.updateMessage(mirrorState.chatSessionId, mirrorState.assistantMsgId, {
		content: text,
		isStreaming: true,
	});
}

/**
 * 完成态：把 streaming 标志清掉、chatStore→idle、agentStore.completeTask。
 */
export function completeCopilotMirror(finalText: string): void {
	if (!mirrorState) return;
	const body = finalText.trim() || "设计已生成。";
	chatStore.updateMessage(mirrorState.chatSessionId, mirrorState.assistantMsgId, {
		content: body,
		isStreaming: false,
	});
	chatStore.setStatus("idle");
	agentStore.completeTask(body);
	mirrorState = null;
}

/**
 * 失败态：尾部追加错误说明、chatStore→error、agentStore.failTask。
 */
export function failCopilotMirror(message: string, partial: string): void {
	if (!mirrorState) return;
	const tail = partial.trim()
		? `${partial.trim()}\n\n⚠️ 生成失败：${message}`
		: `⚠️ 生成失败：${message}`;
	chatStore.updateMessage(mirrorState.chatSessionId, mirrorState.assistantMsgId, {
		content: tail,
		isStreaming: false,
	});
	chatStore.setStatus("error", message);
	agentStore.failTask(message);
	mirrorState = null;
}

/**
 * 中止态：尾部追加 "— 已中止 —"、chatStore→idle、agentStore.cancelTask。
 */
export function cancelCopilotMirror(partial: string): void {
	if (!mirrorState) return;
	const tail = partial.trim()
		? `${partial.trim()}\n\n— 已中止 —`
		: "— 已中止 —";
	chatStore.updateMessage(mirrorState.chatSessionId, mirrorState.assistantMsgId, {
		content: tail,
		isStreaming: false,
	});
	chatStore.setStatus("idle");
	agentStore.cancelTask();
	mirrorState = null;
}

/**
 * 当前是否有进行中的 design mirror。
 * 调用方用它判断"组件 unmount / 重新开始时是否需要 cancel"。
 */
export function hasCopilotMirror(): boolean {
	return mirrorState !== null;
}
