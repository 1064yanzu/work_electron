// Shiki 语法高亮单例服务
// 延迟初始化 highlighter，支持双主题、大文件保护

import {
	type BundledLanguage,
	type BundledTheme,
	type HighlighterGeneric,
	type ThemedToken,
	createHighlighter,
} from "shiki";
import { mapLanguageId, mapLanguageFromPath } from "./languageMap";

// 预加载的常用语言
const PRELOAD_LANGS: BundledLanguage[] = [
	"typescript",
	"javascript",
	"tsx",
	"jsx",
	"python",
	"rust",
	"go",
	"java",
	"json",
	"css",
	"html",
	"markdown",
	"bash",
	"yaml",
	"sql",
	"c",
	"cpp",
	"vue",
	"svelte",
];

// 双主题
const THEMES: BundledTheme[] = ["github-dark", "github-light"];

// 大文件保护阈值
const MAX_LINES = 5000;
const HIGHLIGHT_LIMIT = 500;

type ShikiHighlighter = HighlighterGeneric<BundledLanguage, BundledTheme>;

let highlighterPromise: Promise<ShikiHighlighter> | null = null;
let highlighterInstance: ShikiHighlighter | null = null;

/**
 * 获取或初始化 highlighter 单例
 */
export async function getHighlighter(): Promise<ShikiHighlighter> {
	if (highlighterInstance) return highlighterInstance;

	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: THEMES,
			langs: PRELOAD_LANGS,
		}).then((hl) => {
			highlighterInstance = hl;
			return hl;
		});
	}

	return highlighterPromise;
}

/**
 * 确保指定语言已加载（延迟加载非预加载语言）
 */
async function ensureLanguage(
	hl: ShikiHighlighter,
	lang: BundledLanguage | "plaintext",
): Promise<BundledLanguage | "plaintext"> {
	if (lang === "plaintext") return "plaintext";
	try {
		const loaded = hl.getLoadedLanguages();
		if (!loaded.includes(lang)) {
			await hl.loadLanguage(lang);
		}
		return lang;
	} catch {
		// 语言加载失败则降级为纯文本
		return "plaintext";
	}
}

/**
 * 对代码进行高亮并返回 HTML 字符串
 */
export async function highlightCode(
	code: string,
	lang: string,
	theme: BundledTheme = "github-dark",
): Promise<string> {
	const hl = await getHighlighter();
	const resolvedLang = mapLanguageId(lang);
	const safeLang = await ensureLanguage(hl, resolvedLang);

	// 大文件保护
	const processedCode = applyLineLimitForCode(code);

	return hl.codeToHtml(processedCode, {
		lang: safeLang,
		theme,
	});
}

/**
 * 对代码高亮并返回结构化 token（用于逐行渲染）
 */
export async function highlightToTokens(
	code: string,
	lang: string,
	theme: BundledTheme = "github-dark",
): Promise<ThemedToken[][]> {
	const hl = await getHighlighter();
	const resolvedLang = mapLanguageId(lang);
	const safeLang = await ensureLanguage(hl, resolvedLang);

	// 大文件保护
	const processedCode = applyLineLimitForCode(code);

	const result = hl.codeToTokens(processedCode, {
		lang: safeLang,
		theme,
	});

	return result.tokens;
}

/**
 * 对单行代码高亮并返回 token（用于 diff 逐行渲染）
 */
export async function highlightLine(
	line: string,
	lang: string,
	theme: BundledTheme = "github-dark",
): Promise<ThemedToken[]> {
	const hl = await getHighlighter();
	const resolvedLang = mapLanguageId(lang);
	const safeLang = await ensureLanguage(hl, resolvedLang);

	const result = hl.codeToTokens(line, {
		lang: safeLang,
		theme,
	});

	// 返回第一行的 tokens
	return result.tokens[0] || [];
}

/**
 * 大文件保护：超过 MAX_LINES 行只保留前 HIGHLIGHT_LIMIT 行
 */
function applyLineLimitForCode(code: string): string {
	const lines = code.split("\n");
	if (lines.length <= MAX_LINES) return code;
	return lines.slice(0, HIGHLIGHT_LIMIT).join("\n");
}

// 重新导出语言映射工具
export { mapLanguageId, mapLanguageFromPath };
