import type { StreamBlocksBuilder } from "@/lib/chat/streamBlocksBuilder";
import { EVENTS, events } from "@/lib/events";

export function createAgentChunkHandler(deps: {
	streamBuilder: StreamBlocksBuilder;
	getStreamText: () => string;
	touchActivity: () => void;
	scheduleStreamingUpdate: () => void;
}): (chunk: string) => void {
	const {
		streamBuilder,
		getStreamText,
		touchActivity,
		scheduleStreamingUpdate,
	} = deps;

	let docProtocolMode: "none" | "create" | "update" = "none";

	return (chunk: string) => {
		touchActivity();
		streamBuilder.appendVisibleTextChunk(chunk);
		const snapshot = getStreamText();
		if (docProtocolMode === "none") {
			if (snapshot.includes(":::update-doc")) {
				docProtocolMode = "update";
				events.emit(EVENTS.AI_DOC_UPDATE_START, {});
			} else if (snapshot.includes(":::create-doc")) {
				docProtocolMode = "create";
				events.emit(EVENTS.AI_DOC_CREATE_START, {});
			}
		}
		if (docProtocolMode === "update") {
			const startIdx = snapshot.indexOf(":::update-doc");
			if (startIdx >= 0) {
				const after = snapshot.slice(startIdx + ":::update-doc".length);
				const endRel = after.indexOf(":::");
				const partial = (endRel >= 0 ? after.slice(0, endRel) : after).trim();
				events.emit(EVENTS.AI_DOC_UPDATE_STREAM, partial);
			}
		}
		scheduleStreamingUpdate();
	};
}
