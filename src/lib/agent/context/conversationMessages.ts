import type { ChatMessage } from "../../chat/types";

export function buildConversationMessagesForAgentRun(input: {
	sessionMessages: ChatMessage[];
	currentUserMessage: ChatMessage;
	skipUserMessage?: boolean;
}): ChatMessage[] {
	if (!input.skipUserMessage) {
		return [...input.sessionMessages, input.currentUserMessage];
	}

	return input.sessionMessages.filter(
		(message) => message.id !== input.currentUserMessage.id,
	);
}
