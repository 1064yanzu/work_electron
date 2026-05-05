import { useEffect } from "react";
import { createPortal } from "react-dom";

import {
	readerStoreApi,
	useReaderStoreSelector,
} from "../../lib/stores/readerStore";

import { ReaderShell } from "./ReaderShell";

interface ReaderAppProps {
	onOpenSettings?: () => void;
}

/** 阅读器全屏 Overlay 容器：以 Portal 挂在 body 末尾，由 readerStore.openedBookId 控制可见。 */
export function ReaderApp({ onOpenSettings }: ReaderAppProps) {
	const openedBookId = useReaderStoreSelector((s) => s.openedBookId);

	useEffect(() => {
		if (!openedBookId) return;
		document.body.classList.add("reader-overlay-open");
		return () => {
			document.body.classList.remove("reader-overlay-open");
		};
	}, [openedBookId]);

	if (!openedBookId) return null;

	const node = (
		<div
			className="reader-overlay"
			role="dialog"
			aria-modal="true"
			aria-label="阅读器"
		>
			<ReaderShell
				bookId={openedBookId}
				onRequestClose={() => readerStoreApi.setOpenedBook(null)}
				onOpenSettings={() => onOpenSettings?.()}
			/>
		</div>
	);

	return createPortal(node, document.body);
}

/** 给外部入口调用的便捷函数 */
export function openReader(bookId: string) {
	readerStoreApi.setOpenedBook(bookId);
}
