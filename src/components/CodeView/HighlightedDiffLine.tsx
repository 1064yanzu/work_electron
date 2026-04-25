// HighlightedDiffLine - Shiki 高亮的 Diff 行组件
// 用于 FileDiffCard 中的逐行语法着色

import { memo, useEffect, useRef, useState } from "react";
import type { BundledTheme, ThemedToken } from "shiki";
import { highlightLine } from "../../lib/shiki";
import { cn } from "../../lib/utils";

interface HighlightedDiffLineProps {
	content: string;
	language: string;
	lineType: "added" | "removed" | "unchanged";
	theme?: "github-dark" | "github-light";
}

function HighlightedDiffLineInner({
	content,
	language,
	lineType,
	theme = "github-dark",
}: HighlightedDiffLineProps) {
	const [tokens, setTokens] = useState<ThemedToken[] | null>(null);
	const requestRef = useRef(0);

	useEffect(() => {
		if (!content || language === "text" || language === "plaintext") {
			setTokens(null);
			return;
		}

		const id = ++requestRef.current;

		highlightLine(content, language, theme as BundledTheme)
			.then((result) => {
				if (id !== requestRef.current) return;
				setTokens(result);
			})
			.catch(() => {
				if (id !== requestRef.current) return;
				setTokens(null);
			});
	}, [content, language, theme]);

	// 纯文本降级
	if (!tokens) {
		return (
			<span
				className={cn(
					"flex-1 px-2 whitespace-pre-wrap break-all",
					lineType === "added" && "text-emerald-800 dark:text-emerald-300",
					lineType === "removed" && "text-red-700 dark:text-red-300",
					lineType === "unchanged" && "text-text-secondary",
				)}
			>
				{content || " "}
			</span>
		);
	}

	return (
		<span className="flex-1 px-2 whitespace-pre-wrap break-all">
			{tokens.map((token, i) => (
				<span key={i} style={{ color: token.color }}>
					{token.content}
				</span>
			))}
			{tokens.length === 0 && " "}
		</span>
	);
}

export const HighlightedDiffLine = memo(HighlightedDiffLineInner);
