// useDiffHighlight - 为 react-diff-viewer-continued 提供 Shiki renderContent 回调
// 异步加载高亮 tokens 并缓存，通过 renderContent 回调逐行着色

import { createElement, useCallback, useEffect, useRef, useState } from "react";
import type { BundledTheme, ThemedToken } from "shiki";
import { highlightToTokens, mapLanguageFromPath } from "../../lib/shiki";

interface DiffHighlightState {
	oldTokens: ThemedToken[][] | null;
	newTokens: ThemedToken[][] | null;
	loaded: boolean;
}

/**
 * 为 react-diff-viewer-continued 的 renderContent 提供 Shiki 高亮
 *
 * @returns renderContent 回调，直接传给 <ReactDiffViewer renderContent={...} />
 */
export function useDiffHighlight(
	oldContent: string,
	newContent: string,
	filePath: string,
	isDark: boolean,
) {
	const theme: BundledTheme = isDark ? "github-dark" : "github-light";
	const lang = mapLanguageFromPath(filePath);

	const [state, setState] = useState<DiffHighlightState>({
		oldTokens: null,
		newTokens: null,
		loaded: false,
	});

	const requestRef = useRef(0);

	useEffect(() => {
		if (lang === "plaintext") {
			setState({ oldTokens: null, newTokens: null, loaded: true });
			return;
		}

		const id = ++requestRef.current;

		Promise.all([
			highlightToTokens(oldContent, lang, theme),
			highlightToTokens(newContent, lang, theme),
		]).then(([oldTokens, newTokens]) => {
			if (id !== requestRef.current) return;
			setState({ oldTokens, newTokens, loaded: true });
		}).catch(() => {
			if (id !== requestRef.current) return;
			setState({ oldTokens: null, newTokens: null, loaded: true });
		});
	}, [oldContent, newContent, lang, theme]);

	/**
	 * renderContent 回调
	 * react-diff-viewer-continued 调用此函数来渲染每行的文本内容
	 * 参数: (source: string, _: unknown, __: unknown, lineNumber: number)
	 * lineNumber 是基于源文件的行号（从 1 开始）
	 */
	const renderContent = useCallback(
		(source: string) => {
			if (!state.loaded || (!state.oldTokens && !state.newTokens)) {
				// 降级：纯文本
				return createElement("span", null, source);
			}

			// 尝试在 old/new tokens 中查找匹配此行内容的 token 行
			const lineTokens = findTokensForLine(source, state.oldTokens, state.newTokens);

			if (!lineTokens) {
				return createElement("span", null, source);
			}

			return createElement(
				"span",
				null,
				lineTokens.map((token, i) =>
					createElement("span", { key: i, style: { color: token.color } }, token.content),
				),
			);
		},
		[state],
	);

	return { renderContent, loaded: state.loaded };
}

/**
 * 根据行内容在 tokens 数组中查找匹配的 token 行
 * 遍历 old 和 new tokens 找到内容匹配的行
 */
function findTokensForLine(
	lineContent: string,
	oldTokens: ThemedToken[][] | null,
	newTokens: ThemedToken[][] | null,
): ThemedToken[] | null {
	const trimmed = lineContent;

	for (const tokens of [oldTokens, newTokens]) {
		if (!tokens) continue;
		for (const lineTokens of tokens) {
			const reconstructed = lineTokens.map((t) => t.content).join("");
			if (reconstructed === trimmed) {
				return lineTokens;
			}
		}
	}

	return null;
}
