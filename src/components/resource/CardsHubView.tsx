// 「知识 › 卡片」下的二级视图：在「复习卡」（reader_cards，SRS 间隔重复）
// 与「分享卡」（cards 表，视觉海报）之间切换。
//
// 层级约定：上方「知识」一级 tab 用 pill（块），这里的二级 tab 用文字 + 下划线（线）。
// 两条 tab 上下叠放时，块与线的差别让层级一眼可读，不会互相打架。

import { useCallback, useRef } from "react";

import { KnowledgeCardsEmbedded } from "../cards/KnowledgeCardsView";
import { cardLibraryStoreApi } from "../../lib/stores/cardLibraryStore";
import {
	layoutStore,
	useLayoutStoreSelector,
} from "../../lib/stores/layoutStore";

import { SharedCardsEmbedded } from "./CardsView";

export function CardsHubView() {
	const activeTab = useLayoutStoreSelector((state) => state.cardsActiveTab);
	const bodyRef = useRef<HTMLDivElement>(null);

	const handleSelectKnowledge = useCallback(() => {
		layoutStore.setCardsActiveTab("knowledge");
	}, []);
	const handleSelectShared = useCallback(() => {
		layoutStore.setCardsActiveTab("shared");
	}, []);
	// 把这块面板的矩形一并交给 overlay：全屏视图会从这里"长出来"，
	// 而不是凭空盖住整屏（见 KnowledgeCardsApp）。
	const handleExpandKnowledge = useCallback(() => {
		cardLibraryStoreApi.openFrom(bodyRef.current);
	}, []);

	return (
		<div className="flex flex-col h-full min-w-0">
			<div
				role="tablist"
				aria-label="卡片视图切换"
				className="flex shrink-0 items-center gap-4 border-b border-border px-3"
			>
				<TabUnderline
					active={activeTab === "knowledge"}
					label="复习卡"
					onClick={handleSelectKnowledge}
				/>
				<TabUnderline
					active={activeTab === "shared"}
					label="分享卡"
					onClick={handleSelectShared}
				/>
			</div>

			<div ref={bodyRef} className="flex-1 min-h-0 overflow-hidden">
				{activeTab === "knowledge" ? (
					<KnowledgeCardsEmbedded onExpand={handleExpandKnowledge} />
				) : (
					<SharedCardsEmbedded />
				)}
			</div>
		</div>
	);
}

interface TabUnderlineProps {
	active: boolean;
	label: string;
	onClick: () => void;
}

function TabUnderline({ active, label, onClick }: TabUnderlineProps) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			onClick={onClick}
			className={[
				// -mb-px 让下划线压在容器的 border-b 上，两条线合成一条
				"relative -mb-px py-2 text-xs font-medium transition-colors duration-150",
				active
					? "text-text-primary"
					: "text-text-muted hover:text-text-secondary",
			].join(" ")}
		>
			{label}
			{active ? (
				<span
					aria-hidden="true"
					className="absolute inset-x-0 bottom-0 h-[1.5px] rounded-full bg-text-primary"
				/>
			) : null}
		</button>
	);
}
