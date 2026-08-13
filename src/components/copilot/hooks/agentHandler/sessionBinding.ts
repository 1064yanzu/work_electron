import type { ChatStoreLike } from "@/components/copilot/types";
import { persistChatMessageToAgentSession } from "@/lib/agent/chatBridge";
import { ensurePersistentSession } from "@/lib/agent/persistence";
import { createMessage } from "@/lib/chat/types";

type ActiveSession = NonNullable<ChatStoreLike["activeSession"]>;
type SessionMessage = ActiveSession["messages"][number];

export async function bindAgentSession(input: {
	chatStore: ChatStoreLike;
	session: ActiveSession;
}): Promise<string | undefined> {
	const { chatStore, session } = input;
	// 绑定/创建后端 Agent Session（用于持久化与回放）
	let boundAgentSessionId: string | undefined = session.agentSessionId;
	try {
		const ensuredSession = await ensurePersistentSession({
			sessionId: boundAgentSessionId,
			title: session.title,
		});
		if (ensuredSession.sessionId !== boundAgentSessionId) {
			chatStore.setSessionAgentSessionId(session.id, ensuredSession.sessionId);
		}
		boundAgentSessionId = ensuredSession.sessionId;
	} catch (e) {
		// 后端不可用时自动降级（仍可跑前端内存态 Agent）
		console.warn(
			"[CopilotSidebar] Agent Session 持久化初始化失败，将降级为本地执行",
			e,
		);
	}
	return boundAgentSessionId;
}

export function prepareUserMessage(input: {
	chatStore: ChatStoreLike;
	session: ActiveSession;
	content: string;
	userTextForChat: string;
	skipUserMessage: boolean | undefined;
	activeModel: string | null;
	persistEnabled: boolean;
	boundAgentSessionId: string | undefined;
	onFirstUserMessage?: (
		sessionId: string,
		firstMessage: string,
		fallbackModel?: string,
	) => void;
}): SessionMessage | null {
	const {
		chatStore,
		session,
		content,
		userTextForChat,
		skipUserMessage,
		activeModel,
		persistEnabled,
		boundAgentSessionId,
		onFirstUserMessage,
	} = input;

	// 创建或获取用户消息
	let userMessage: SessionMessage;
	const shouldGenerateTitle = !skipUserMessage && session.messages.length === 0;
	if (!skipUserMessage) {
		// 正常情况：创建新的用户消息
		userMessage = createMessage("user", userTextForChat);
		chatStore.addMessage(session.id, userMessage);
		if (shouldGenerateTitle) {
			onFirstUserMessage?.(
				session.id,
				content,
				session.model || activeModel || undefined,
			);
		}
		if (
			persistEnabled &&
			boundAgentSessionId &&
			!boundAgentSessionId.startsWith("local-")
		) {
			void persistChatMessageToAgentSession(
				boundAgentSessionId,
				userMessage,
			).then((record) => {
				if (record?.id) {
					chatStore.updateMessage(session.id, userMessage.id, {
						metadata: { agentMessageId: record.id },
					});
				}
			});
		}
	} else {
		// 重新生成：使用现有的最后一条用户消息
		const existingUserMsg = session.messages
			.filter((m) => m.role === "user")
			.pop();
		if (!existingUserMsg) {
			console.error("[CopilotSidebar] 重新生成时找不到用户消息");
			return null;
		}
		userMessage = existingUserMsg;
	}
	return userMessage;
}
