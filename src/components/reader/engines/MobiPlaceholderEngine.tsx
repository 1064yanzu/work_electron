import DOMPurify from "dompurify";
import { useMemo } from "react";

import type { ReaderEngineProps } from "./types";

/**
 * MOBI / AZW3 占位引擎：渲染主进程返回的格式说明 HTML。
 * 不可划词，不可朗读 — 引导用户转 EPUB。
 */
export default function MobiPlaceholderEngine({
	chapter,
	className,
}: ReaderEngineProps) {
	const html = useMemo(
		() =>
			DOMPurify.sanitize(chapter?.html || "", { USE_PROFILES: { html: true } }),
		[chapter?.html],
	);

	return (
		<div
			className={`reader-engine reader-engine--mobi ${className ?? ""}`}
			data-format="mobi"
		>
			<div
				className="reader-engine__mobi-card"
				/* biome-ignore lint/security/noDangerouslySetInnerHtml: 已经过 DOMPurify */
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		</div>
	);
}
