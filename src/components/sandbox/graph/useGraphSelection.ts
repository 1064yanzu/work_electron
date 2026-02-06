import { useCallback, useState, type MouseEvent } from "react";
import type { ExecutionGraphNode } from "./types";
import { EVENTS, events } from "../../../lib/events";

interface UseGraphSelectionArgs {
	onOpenArtifact: (filePath: string) => void;
	isInspectorPinned: boolean;
}

export function useGraphSelection({
	onOpenArtifact,
	isInspectorPinned,
}: UseGraphSelectionArgs) {
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

	const onNodeClick = useCallback(
		(_: MouseEvent, node: ExecutionGraphNode) => {
			setSelectedNodeId(node.id);
			if (node.data.kind === "tool") {
				events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
					toolCallId: node.id,
					source: "graph",
				});
			}
			if (node.data.kind === "artifact" && node.data.url) {
				onOpenArtifact(node.data.url);
			}
		},
		[onOpenArtifact],
	);

	const onPaneClick = useCallback(() => {
		if (isInspectorPinned) return;
		setSelectedNodeId(null);
	}, [isInspectorPinned]);

	return {
		selectedNodeId,
		setSelectedNodeId,
		onNodeClick,
		onPaneClick,
	};
}
