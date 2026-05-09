// 极窄边栏的卡片中心视图：在「知识卡片」与「分享卡片」之间切换

import { useCallback } from "react";
import { Brain, Image as ImageIcon } from "lucide-react";

import { KnowledgeCardsEmbedded } from "../cards/KnowledgeCardsView";
import { cardLibraryStoreApi } from "../../lib/stores/cardLibraryStore";
import {
	layoutStore,
	useLayoutStoreSelector,
} from "../../lib/stores/layoutStore";

import { SharedCardsEmbedded } from "./CardsView";

export function CardsHubView() {
	const activeTab = useLayoutStoreSelector((state) => state.cardsActiveTab);

	const handleSelectKnowledge = useCallback(() => {
		layoutStore.setCardsActiveTab("knowledge");
	}, []);
	const handleSelectShared = useCallback(() => {
		layoutStore.setCardsActiveTab("shared");
	}, []);
	const handleExpandKnowledge = useCallback(() => {
		cardLibraryStoreApi.open();
	}, []);

	return (
		<div className="flex flex-col h-full min-w-0">
			<div
				role="tablist"
				aria-label="卡片视图切换"
				className="flex items-center gap-1.5 px-3 py-2.5 border-b border-border shrink-0"
			>
				<TabPill
					active={activeTab === "knowledge"}
					icon={<Brain className="w-3.5 h-3.5" strokeWidth={1.5} />}
					label="知识卡片"
					onClick={handleSelectKnowledge}
				/>
				<TabPill
					active={activeTab === "shared"}
					icon={<ImageIcon className="w-3.5 h-3.5" strokeWidth={1.5} />}
					label="分享卡片"
					onClick={handleSelectShared}
				/>
			</div>

			<div className="flex-1 min-h-0 overflow-hidden">
				{activeTab === "knowledge" ? (
					<KnowledgeCardsEmbedded onExpand={handleExpandKnowledge} />
				) : (
					<SharedCardsEmbedded />
				)}
			</div>
		</div>
	);
}

interface TabPillProps {
	active: boolean;
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
}

function TabPill({ active, icon, label, onClick }: TabPillProps) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			onClick={onClick}
			className={[
				"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-[background-color,color] duration-150",
				active
					? "bg-warm-200 text-text-primary"
					: "text-text-muted hover:text-text-primary hover:bg-warm-200/60",
			].join(" ")}
		>
			{icon}
			<span>{label}</span>
		</button>
	);
}
