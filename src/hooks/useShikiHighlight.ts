// useShikiHighlight - Shiki 语法高亮 React Hook
// 支持暗/亮主题自动跟随，loading 期间降级为纯文本

import { useEffect, useMemo, useRef, useState } from "react";
import type { BundledTheme, ThemedToken } from "shiki";
import { highlightCode, highlightToTokens } from "../lib/shiki";

type ShikiTheme = "github-dark" | "github-light";

function usePrefersDark(): boolean {
	const [dark, setDark] = useState(() => {
		if (typeof window === "undefined") return true;
		// 优先检查 document.documentElement.classList 中是否有 dark（Tailwind 暗色模式）
		if (document.documentElement.classList.contains("dark")) return true;
		return window.matchMedia("(prefers-color-scheme: dark)").matches;
	});

	useEffect(() => {
		// 监听 Tailwind 暗色模式的 class 变化
		const observer = new MutationObserver(() => {
			setDark(document.documentElement.classList.contains("dark"));
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		// 同时监听系统 prefers-color-scheme
		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = (e: MediaQueryListEvent) => {
			// 只在没有 tailwind dark class 时才跟随系统
			if (!document.documentElement.classList.contains("dark")) {
				setDark(e.matches);
			}
		};
		mql.addEventListener("change", handler);

		return () => {
			observer.disconnect();
			mql.removeEventListener("change", handler);
		};
	}, []);

	return dark;
}

interface ShikiHighlightResult {
	/** 高亮后的 HTML（用于 dangerouslySetInnerHTML） */
	html: string;
	/** 结构化 token 数据（用于逐行自定义渲染） */
	tokens: ThemedToken[][] | null;
	/** 是否正在加载 */
	loading: boolean;
	/** 当前使用的主题 */
	theme: ShikiTheme;
}

/**
 * 对代码进行 Shiki 语法高亮的 Hook
 *
 * @param code 代码文本
 * @param language 语言标识（扩展名或别名）
 * @returns { html, tokens, loading, theme }
 */
export function useShikiHighlight(
	code: string,
	language: string,
): ShikiHighlightResult {
	const isDark = usePrefersDark();
	const theme: ShikiTheme = isDark ? "github-dark" : "github-light";

	const [html, setHtml] = useState("");
	const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
	const [loading, setLoading] = useState(true);

	// 用 ref 追踪最新请求，避免竞态
	const requestIdRef = useRef(0);

	useEffect(() => {
		if (!code) {
			setHtml("");
			setTokens(null);
			setLoading(false);
			return;
		}

		const requestId = ++requestIdRef.current;
		setLoading(true);

		Promise.all([
			highlightCode(code, language, theme as BundledTheme),
			highlightToTokens(code, language, theme as BundledTheme),
		])
			.then(([htmlResult, tokensResult]) => {
				// 只接受最新请求的结果
				if (requestId !== requestIdRef.current) return;
				setHtml(htmlResult);
				setTokens(tokensResult);
				setLoading(false);
			})
			.catch(() => {
				if (requestId !== requestIdRef.current) return;
				setHtml("");
				setTokens(null);
				setLoading(false);
			});
	}, [code, language, theme]);

	return useMemo(
		() => ({ html, tokens, loading, theme }),
		[html, tokens, loading, theme],
	);
}

/**
 * 仅获取 tokens 的轻量版 hook（适用于逐行渲染场景）
 */
export function useShikiTokens(
	code: string,
	language: string,
): { tokens: ThemedToken[][] | null; loading: boolean; theme: ShikiTheme } {
	const isDark = usePrefersDark();
	const theme: ShikiTheme = isDark ? "github-dark" : "github-light";

	const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
	const [loading, setLoading] = useState(true);

	const requestIdRef = useRef(0);

	useEffect(() => {
		if (!code) {
			setTokens(null);
			setLoading(false);
			return;
		}

		const requestId = ++requestIdRef.current;
		setLoading(true);

		highlightToTokens(code, language, theme as BundledTheme)
			.then((result) => {
				if (requestId !== requestIdRef.current) return;
				setTokens(result);
				setLoading(false);
			})
			.catch(() => {
				if (requestId !== requestIdRef.current) return;
				setTokens(null);
				setLoading(false);
			});
	}, [code, language, theme]);

	return useMemo(() => ({ tokens, loading, theme }), [tokens, loading, theme]);
}
