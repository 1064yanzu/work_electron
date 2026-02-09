import { useCallback } from "react";
import { confirmDialog } from "../ui/ConfirmDialog";
import { toast } from "../ui/Toast";

interface ChatSessionLite {
	id: string;
	title: string;
}

interface ChatStoreLike {
	sessions: ChatSessionLite[];
	createNewSession: () => void;
	deleteSessionWithUndo: (
		sessionId: string,
		undoWindowMs?: number,
	) => {
		sessionId: string;
		title: string;
		expiresAt: number;
		undoWindowMs: number;
	} | null;
	undoDeleteSession: (sessionId: string) => boolean;
}

interface UseCopilotActionsOptions {
	chatStore: ChatStoreLike;
	onCloseHistory?: () => void;
}

export function useCopilotActions({
	chatStore,
	onCloseHistory,
}: UseCopilotActionsOptions) {
	const handleNewSession = useCallback(() => {
		chatStore.createNewSession();
		onCloseHistory?.();
	}, [chatStore, onCloseHistory]);

	const handleDeleteSession = useCallback(
		async (sessionId: string) => {
			const targetSession = chatStore.sessions.find(
				(session) => session.id === sessionId,
			);
			if (!targetSession) return;

			const confirmed = await confirmDialog.show({
				title: "删除对话",
				message: `确定删除「${targetSession.title || "新对话"}」吗？你可以在 5 秒内撤销。`,
				type: "warning",
				confirmText: "删除",
				cancelText: "取消",
			});
			if (!confirmed) return;

			const snapshot = chatStore.deleteSessionWithUndo(sessionId, 5000);
			if (!snapshot) {
				toast.error("删除失败，请重试");
				return;
			}

			toast.show(`已删除「${targetSession.title || "新对话"}」`, {
				type: "warning",
				duration: 5000,
				actionLabel: "撤销",
				actionVariant: "primary",
				onAction: async () => {
					const restored = chatStore.undoDeleteSession(sessionId);
					if (!restored) {
						toast.warning("撤销已失效");
						return;
					}
					toast.success("已恢复对话");
				},
			});
		},
		[chatStore],
	);

	return {
		handleNewSession,
		handleDeleteSession,
	};
}
