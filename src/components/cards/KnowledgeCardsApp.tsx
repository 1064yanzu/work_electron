import { useEffect } from "react";
import { createPortal } from "react-dom";

import {
	cardLibraryStoreApi,
	useCardLibraryStoreSelector,
} from "../../lib/stores/cardLibraryStore";

import { KnowledgeCardsView } from "./KnowledgeCardsView";

/**
 * 知识卡片库全屏 Overlay。同 ReaderApp 的容器模式：
 * 由 cardLibraryStore.open 控制可见，通过 Portal 挂在 body。
 */
export function KnowledgeCardsApp() {
	const open = useCardLibraryStoreSelector((s) => s.open);

	useEffect(() => {
		if (!open) return;
		document.body.classList.add("card-library-overlay-open");
		return () => {
			document.body.classList.remove("card-library-overlay-open");
		};
	}, [open]);

	if (!open) return null;

	const node = (
		<div
			className="card-library-overlay"
			role="dialog"
			aria-modal="true"
			aria-label="知识卡片库"
		>
			<KnowledgeCardsView onClose={() => cardLibraryStoreApi.close()} />
		</div>
	);

	return createPortal(node, document.body);
}

export function openKnowledgeCards() {
	cardLibraryStoreApi.open();
}
