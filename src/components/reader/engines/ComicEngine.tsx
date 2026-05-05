import { useEffect, useRef } from "react";

import type { ReaderEngineProps } from "./types";

/** CBZ 漫画引擎：把已经在主进程转好的 base64 图片序列展示出来。 */
export default function ComicEngine({
	book,
	chapter,
	onPositionChange,
	onUserActivity,
	className,
}: ReaderEngineProps) {
	const rootRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		root.scrollTo({ top: 0, behavior: "instant" });
	}, [chapter?.id]);

	useEffect(() => {
		const root = rootRef.current;
		if (!root || !chapter) return;
		let raf = 0;
		const onScroll = () => {
			if (raf) cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				const max = Math.max(1, root.scrollHeight - root.clientHeight);
				const pct = Math.max(0, Math.min(1, root.scrollTop / max));
				onPositionChange?.(`comic:${chapter.id}:scroll:${pct.toFixed(3)}`, pct);
				onUserActivity?.();
			});
		};
		root.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			root.removeEventListener("scroll", onScroll);
			if (raf) cancelAnimationFrame(raf);
		};
	}, [chapter, onPositionChange, onUserActivity]);

	const images = chapter?.images ?? [];

	return (
		<div
			ref={rootRef}
			className={`reader-engine reader-engine--comic ${className ?? ""}`}
			data-format={book.format}
		>
			<div className="reader-engine__comic-pages">
				{images.length === 0 ? (
					<div className="reader-engine__comic-empty">
						本章节没有图片可显示。
					</div>
				) : (
					images.map((img, i) => (
						<figure
							key={img.name}
							className="reader-engine__comic-page"
							data-page={i + 1}
						>
							<img src={img.data_url} alt={`Page ${i + 1}`} loading="lazy" />
						</figure>
					))
				)}
			</div>
		</div>
	);
}
