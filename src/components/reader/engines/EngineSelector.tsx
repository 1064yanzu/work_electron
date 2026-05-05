import { Suspense, lazy } from "react";

import type { ReaderEngineProps } from "./types";

const TextEngine = lazy(() => import("./TextEngine"));
const PdfEngine = lazy(() => import("./PdfEngine"));
const ComicEngine = lazy(() => import("./ComicEngine"));
const MobiPlaceholderEngine = lazy(() => import("./MobiPlaceholderEngine"));

export default function EngineSelector(props: ReaderEngineProps) {
	const { book } = props;
	const engine = (() => {
		switch (book.format) {
			case "pdf":
				return <PdfEngine {...props} />;
			case "cbz":
				return <ComicEngine {...props} />;
			case "mobi":
			case "azw3":
				return <MobiPlaceholderEngine {...props} />;
			case "epub":
			case "txt":
			case "md":
			case "html":
			case "docx":
				return <TextEngine {...props} />;
			default:
				return <TextEngine {...props} />;
		}
	})();

	return (
		<Suspense
			fallback={
				<div className="reader-engine reader-engine--loading">
					<div className="reader-engine__loading-pulse" />
				</div>
			}
		>
			{engine}
		</Suspense>
	);
}
