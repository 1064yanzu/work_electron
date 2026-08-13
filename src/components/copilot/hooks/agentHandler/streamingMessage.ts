import { AGENT_STREAM_UPDATE_INTERVAL_MS } from "@/components/copilot/constants";
import type { ChatStoreLike } from "@/components/copilot/types";
import type { ChatMessageBlock } from "@/lib/chat/types";
import { createMessage } from "@/lib/chat/types";

export interface StreamingMessageController {
	ensureStreamingMessage: () => void;
	updateStreamingMessage: () => void;
	scheduleStreamingUpdate: () => void;
	getStreamingMsgId: () => string | null;
}

export function createStreamingMessageController(deps: {
	chatStore: ChatStoreLike;
	sessionId: string;
	activeModel: string | null;
	getStreamText: () => string;
	buildSkillBlocks: () => ChatMessageBlock[];
}): StreamingMessageController {
	const { chatStore, sessionId, activeModel, getStreamText, buildSkillBlocks } =
		deps;

	let streamingMsgId: string | null = null;
	let lastUpdateTime = 0;
	let pendingUpdate = false;

	const ensureStreamingMessage = () => {
		if (streamingMsgId) return;
		const streamingMsg = createMessage("assistant", "", {
			isStreaming: true,
			model: activeModel ?? undefined,
			metadata: {
				blocks: buildSkillBlocks(),
			},
		});
		streamingMsgId = streamingMsg.id;
		chatStore.addMessage(sessionId, streamingMsg);
		lastUpdateTime = Date.now();
	};

	const updateStreamingMessage = () => {
		if (streamingMsgId) {
			chatStore.updateMessage(sessionId, streamingMsgId, {
				content: getStreamText(),
				metadata: {
					blocks: buildSkillBlocks(),
				},
			});
		}
		pendingUpdate = false;
	};

	const scheduleStreamingUpdate = () => {
		const now = Date.now();
		if (now - lastUpdateTime >= AGENT_STREAM_UPDATE_INTERVAL_MS) {
			updateStreamingMessage();
			lastUpdateTime = now;
			return;
		}
		if (!pendingUpdate) {
			pendingUpdate = true;
			setTimeout(
				() => {
					if (pendingUpdate) {
						updateStreamingMessage();
						lastUpdateTime = Date.now();
					}
				},
				AGENT_STREAM_UPDATE_INTERVAL_MS - (now - lastUpdateTime),
			);
		}
	};

	return {
		ensureStreamingMessage,
		updateStreamingMessage,
		scheduleStreamingUpdate,
		getStreamingMsgId: () => streamingMsgId,
	};
}
