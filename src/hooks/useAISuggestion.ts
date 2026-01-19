import { useCallback, useState } from "react";

export type SuggestionType = "append" | "replace" | "diff";

export interface AISuggestion {
	id: string;
	content: string;
	originalContent?: string; // 用于 diff 模式
	prompt: string;
	type: SuggestionType;
	timestamp: number;
}

/**
 * AI 建议管理 Hook
 * 处理 AI 返回内容的临时存储和用户确认
 * 支持三种模式：append（追加）、replace（替换）、diff（差异对比）
 */
export function useAISuggestion() {
	const [pendingSuggestion, setPendingSuggestion] =
		useState<AISuggestion | null>(null);

	const addSuggestion = useCallback(
		(
			content: string,
			prompt: string,
			type: SuggestionType = "append",
			originalContent?: string,
		) => {
			const suggestion: AISuggestion = {
				id: Date.now().toString(),
				content,
				originalContent,
				prompt,
				type,
				timestamp: Date.now(),
			};
			console.log("[useAISuggestion] 新建议:", suggestion.type, suggestion);
			setPendingSuggestion(suggestion);
		},
		[],
	);

	const acceptSuggestion = useCallback(() => {
		console.log("[useAISuggestion] 接受建议");
		const accepted = pendingSuggestion;
		setPendingSuggestion(null);
		return accepted;
	}, [pendingSuggestion]);

	const rejectSuggestion = useCallback(() => {
		console.log("[useAISuggestion] 拒绝建议");
		setPendingSuggestion(null);
	}, []);

	const clearSuggestion = useCallback(() => {
		setPendingSuggestion(null);
	}, []);

	return {
		pendingSuggestion,
		hasPendingSuggestion: pendingSuggestion !== null,
		addSuggestion,
		acceptSuggestion,
		rejectSuggestion,
		clearSuggestion,
	};
}
