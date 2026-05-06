import { ChevronLeft, ChevronRight } from "lucide-react";

interface ReaderPageNavProps {
	canPrev: boolean;
	canNext: boolean;
	onPrev: () => void;
	onNext: () => void;
}

/** 主阅读区两侧悬浮的「上一章 / 下一章」按钮：默认半透明，hover 时浮现。 */
export function ReaderPageNav({
	canPrev,
	canNext,
	onPrev,
	onNext,
}: ReaderPageNavProps) {
	return (
		<>
			<button
				type="button"
				className="reader-pagenav reader-pagenav--prev"
				onClick={onPrev}
				disabled={!canPrev}
				aria-label="上一章"
				title="上一章（← 或 PageUp）"
			>
				<ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
			</button>
			<button
				type="button"
				className="reader-pagenav reader-pagenav--next"
				onClick={onNext}
				disabled={!canNext}
				aria-label="下一章"
				title="下一章（→ / 空格 / PageDown）"
			>
				<ChevronRight className="w-5 h-5" strokeWidth={1.75} />
			</button>
		</>
	);
}
