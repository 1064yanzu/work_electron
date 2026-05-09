// 文档提案管理 Hook

import { useCallback, useMemo, useState } from "react";
import { createOutputAsset } from "../../../lib/api";
import { OutputType } from "../../../types";
import type { CreateProposal } from "../types";

export function useCopilotProposals() {
	const [pendingCreateProposals, setPendingCreateProposals] = useState<
		CreateProposal[]
	>([]);
	const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
	const [isProposalMenuOpen, setIsProposalMenuOpen] = useState(false);

	const queueCreateProposal = useCallback(
		(payload: {
			title: string;
			summary: string;
			content: string;
			prompt: string;
		}) => {
			const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
			const item: CreateProposal = {
				id,
				title: payload.title || "新文档",
				summary: payload.summary || "",
				content: payload.content || "",
				prompt: payload.prompt || "",
				createdAt: Date.now(),
			};
			setPendingCreateProposals((prev) => [item, ...prev]);
			setActiveProposalId((prev) => prev || id);
		},
		[],
	);

	const removeCreateProposal = useCallback((id: string) => {
		setPendingCreateProposals((prev) => {
			const next = prev.filter((p) => p.id !== id);
			setActiveProposalId((current) => {
				if (current !== id) return current;
				return next[0]?.id || null;
			});
			return next;
		});
	}, []);

	const activeCreateProposal = useMemo(() => {
		if (!activeProposalId) return null;
		return (
			pendingCreateProposals.find((p) => p.id === activeProposalId) || null
		);
	}, [pendingCreateProposals, activeProposalId]);

	const acceptActiveCreateProposal = useCallback(async () => {
		const p = activeCreateProposal;
		if (!p) return;
		try {
			await createOutputAsset({
				title: p.title || "新文档",
				content: p.content || "",
				output_type: OutputType.Article,
				related_notes: [],
			});
			removeCreateProposal(p.id);
		} catch (e) {
			console.error("[CopilotSidebar] 创建文档失败:", e);
		}
	}, [activeCreateProposal, removeCreateProposal]);

	return {
		pendingCreateProposals,
		activeProposalId,
		setActiveProposalId,
		isProposalMenuOpen,
		setIsProposalMenuOpen,
		queueCreateProposal,
		removeCreateProposal,
		activeCreateProposal,
		acceptActiveCreateProposal,
	};
}
