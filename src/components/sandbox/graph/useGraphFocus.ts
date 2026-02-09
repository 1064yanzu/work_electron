import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import type { ToolCall } from "../../../lib/agent/types";
import { EVENTS, events } from "../../../lib/events";
import type { ExecutionGraphNode } from "./types";
import { getNodeSearchText } from "./utils";

interface UseGraphFocusArgs {
	nodes: ExecutionGraphNode[];
	defaultFocusIds: string[];
	toolCallById: Map<string, ToolCall>;
	onSelectNode: (nodeId: string | null) => void;
	searchQuery: string;
	follow: boolean;
}

export function useGraphFocus({
	nodes,
	defaultFocusIds,
	toolCallById,
	onSelectNode,
	searchQuery,
	follow,
}: UseGraphFocusArgs) {
	const { fitView } = useReactFlow();
	const [searchIndex, setSearchIndex] = useState(0);
	const lastFocusKeyRef = useRef<string>("");

	const searchMatchedNodeIds = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return [];
		return nodes
			.filter((node) => getNodeSearchText(node).includes(q))
			.map((node) => node.id);
	}, [nodes, searchQuery]);

	const focusIds =
		searchMatchedNodeIds.length > 0 ? searchMatchedNodeIds : defaultFocusIds;

	useEffect(() => {
		setSearchIndex(0);
	}, [searchQuery, searchMatchedNodeIds.length]);

	const focusByIds = useCallback(
		(ids: string[], duration = 800) => {
			if (ids.length === 0) return;
			try {
				fitView({
					nodes: ids.map((id) => ({ id })),
					padding: 0.35,
					duration,
					minZoom: 0.15,
					maxZoom: 1.05,
				});
			} catch {
				// noop
			}
		},
		[fitView],
	);

	useEffect(() => {
		if (!follow) return;
		if (focusIds.length === 0) return;

		const key = focusIds.join("|");
		if (key === lastFocusKeyRef.current) return;
		lastFocusKeyRef.current = key;

		const t = setTimeout(() => {
			focusByIds(focusIds, 800);
		}, 200);

		return () => clearTimeout(t);
	}, [focusByIds, focusIds, follow]);

	useEffect(() => {
		return events.on(EVENTS.AGENT_FOCUS_TOOL_CALL, (payload) => {
			const toolCallId =
				typeof payload?.toolCallId === "string" ? payload.toolCallId : "";
			if (!toolCallId) return;
			if (!toolCallById.has(toolCallId)) return;
			onSelectNode(toolCallId);
			focusByIds([toolCallId], 600);
		});
	}, [toolCallById, onSelectNode, focusByIds]);

	const focusFirstSearchMatch = useCallback(() => {
		if (searchMatchedNodeIds.length === 0) return;
		const first = searchMatchedNodeIds[0]!;
		onSelectNode(first);
		focusByIds([first], 450);
		setSearchIndex(0);
	}, [focusByIds, onSelectNode, searchMatchedNodeIds]);

	const focusNextSearchMatch = useCallback(
		(step: 1 | -1 = 1) => {
			if (searchMatchedNodeIds.length === 0) return;
			const next =
				(searchIndex + step + searchMatchedNodeIds.length) %
				searchMatchedNodeIds.length;
			const target = searchMatchedNodeIds[next];
			if (!target) return;
			setSearchIndex(next);
			onSelectNode(target);
			focusByIds([target], 350);
		},
		[focusByIds, onSelectNode, searchIndex, searchMatchedNodeIds],
	);

	return {
		searchMatchedNodeIds,
		searchIndex,
		focusFirstSearchMatch,
		focusNextSearchMatch,
	};
}
