// Shiki 语法高亮单例服务
// 延迟初始化 highlighter，按需加载主题/语言，大文件保护
//
// 包体裁剪：不再使用 `shiki` 主入口（全语言 bundle + oniguruma wasm），
// 改用 `shiki/core` + JS 正则引擎（createJavaScriptRegexEngine），
// 语言/主题通过细粒度动态 import（`shiki/langs/xx.mjs`）按需加载，
// Vite 会把每个语言拆成独立异步 chunk，首屏 bundle 不再包含全语言语法。

import {
	type HighlighterCore,
	type LanguageRegistration,
	type ThemeRegistrationRaw,
	type ThemedToken,
	createHighlighterCore,
} from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
// 仅类型导入（编译期擦除，不会引入全量 bundle 运行时）
import type { BundledLanguage, BundledTheme } from "shiki";
import { themeManager } from "../theme";
import { mapLanguageId, mapLanguageFromPath } from "./languageMap";

type LangModule = { default: LanguageRegistration[] };
type ThemeModule = { default: ThemeRegistrationRaw };

/**
 * 支持的语言 → 细粒度动态 import 映射
 *
 * 覆盖 languageMap.ts 中所有可能映射到的语言 ID；
 * 未在此表中的语言在 ensureLanguage 时降级为 plaintext（不抛错）。
 * 每一项都是独立的懒加载 chunk，不进首屏 bundle。
 */
const LANG_IMPORTS: Record<string, () => Promise<LangModule>> = {
	typescript: () => import("shiki/langs/typescript.mjs"),
	tsx: () => import("shiki/langs/tsx.mjs"),
	javascript: () => import("shiki/langs/javascript.mjs"),
	jsx: () => import("shiki/langs/jsx.mjs"),
	json: () => import("shiki/langs/json.mjs"),
	jsonc: () => import("shiki/langs/jsonc.mjs"),
	html: () => import("shiki/langs/html.mjs"),
	css: () => import("shiki/langs/css.mjs"),
	scss: () => import("shiki/langs/scss.mjs"),
	less: () => import("shiki/langs/less.mjs"),
	python: () => import("shiki/langs/python.mjs"),
	bash: () => import("shiki/langs/bash.mjs"),
	sql: () => import("shiki/langs/sql.mjs"),
	markdown: () => import("shiki/langs/markdown.mjs"),
	mdx: () => import("shiki/langs/mdx.mjs"),
	yaml: () => import("shiki/langs/yaml.mjs"),
	toml: () => import("shiki/langs/toml.mjs"),
	xml: () => import("shiki/langs/xml.mjs"),
	rust: () => import("shiki/langs/rust.mjs"),
	go: () => import("shiki/langs/go.mjs"),
	java: () => import("shiki/langs/java.mjs"),
	kotlin: () => import("shiki/langs/kotlin.mjs"),
	ruby: () => import("shiki/langs/ruby.mjs"),
	c: () => import("shiki/langs/c.mjs"),
	cpp: () => import("shiki/langs/cpp.mjs"),
	csharp: () => import("shiki/langs/csharp.mjs"),
	swift: () => import("shiki/langs/swift.mjs"),
	vue: () => import("shiki/langs/vue.mjs"),
	svelte: () => import("shiki/langs/svelte.mjs"),
	php: () => import("shiki/langs/php.mjs"),
	lua: () => import("shiki/langs/lua.mjs"),
	r: () => import("shiki/langs/r.mjs"),
	dart: () => import("shiki/langs/dart.mjs"),
	zig: () => import("shiki/langs/zig.mjs"),
	dockerfile: () => import("shiki/langs/dockerfile.mjs"),
	makefile: () => import("shiki/langs/makefile.mjs"),
	graphql: () => import("shiki/langs/graphql.mjs"),
	prisma: () => import("shiki/langs/prisma.mjs"),
	proto: () => import("shiki/langs/proto.mjs"),
	ini: () => import("shiki/langs/ini.mjs"),
	dotenv: () => import("shiki/langs/dotenv.mjs"),
	diff: () => import("shiki/langs/diff.mjs"),
};

// highlighter 初始化时预加载的常用语言（约 20 种；shell/sh/zsh 是 bash 的别名）
const PRELOAD_LANGS: string[] = [
	"typescript",
	"tsx",
	"javascript",
	"jsx",
	"json",
	"html",
	"css",
	"python",
	"bash",
	"sql",
	"markdown",
	"yaml",
	"rust",
	"go",
	"java",
	"c",
	"cpp",
	"diff",
	"xml",
];

// 支持的主题（实际只按需加载一套，另一套在用户切换主题时 lazy 加载）
const DARK_THEME: BundledTheme = "github-dark";
const LIGHT_THEME: BundledTheme = "github-light";

const THEME_IMPORTS: Record<string, () => Promise<ThemeModule>> = {
	"github-dark": () => import("shiki/themes/github-dark.mjs"),
	"github-light": () => import("shiki/themes/github-light.mjs"),
};

// 大文件保护阈值
const MAX_LINES = 5000;
const HIGHLIGHT_LIMIT = 500;

// tokens 结果内存 LRU 缓存：同一段代码（含语言/主题）在多次渲染或流式更新中
// 只需要真正高亮一次，避免重复调用 shiki 造成的 CPU 尖峰
const TOKENS_CACHE_LIMIT = 100;
const tokensCache = new Map<string, ThemedToken[][]>();

function buildTokensCacheKey(
	code: string,
	lang: string,
	theme: BundledTheme,
): string {
	return `${theme}::${lang}::${code}`;
}

function getCachedTokens(key: string): ThemedToken[][] | undefined {
	const cached = tokensCache.get(key);
	if (cached) {
		// 命中时刷新 LRU 顺序（Map 按插入顺序迭代，重新 set 即可移到最新）
		tokensCache.delete(key);
		tokensCache.set(key, cached);
	}
	return cached;
}

function setCachedTokens(key: string, value: ThemedToken[][]): void {
	if (tokensCache.has(key)) tokensCache.delete(key);
	tokensCache.set(key, value);
	if (tokensCache.size > TOKENS_CACHE_LIMIT) {
		const oldestKey = tokensCache.keys().next().value;
		if (oldestKey !== undefined) tokensCache.delete(oldestKey);
	}
}

type ShikiHighlighter = HighlighterCore;

let highlighterPromise: Promise<ShikiHighlighter> | null = null;
let highlighterInstance: ShikiHighlighter | null = null;

function pickInitialTheme(): BundledTheme {
	// 默认按当前主题决定首批加载的 Shiki theme，减少初始内存占用
	try {
		return themeManager.isDark() ? DARK_THEME : LIGHT_THEME;
	} catch {
		return DARK_THEME;
	}
}

/**
 * 获取或初始化 highlighter 单例
 */
export async function getHighlighter(): Promise<ShikiHighlighter> {
	if (highlighterInstance) return highlighterInstance;

	if (!highlighterPromise) {
		const initialTheme = pickInitialTheme();
		highlighterPromise = createHighlighterCore({
			themes: [THEME_IMPORTS[initialTheme]()],
			langs: PRELOAD_LANGS.map((lang) => LANG_IMPORTS[lang]()),
			engine: createJavaScriptRegexEngine({ forgiving: true }),
		}).then((hl) => {
			highlighterInstance = hl;
			return hl;
		});
	}

	return highlighterPromise;
}

/**
 * 确保指定主题已加载（用户切换主题或首次请求另一套主题时延迟加载）
 */
async function ensureTheme(
	hl: ShikiHighlighter,
	theme: BundledTheme,
): Promise<BundledTheme> {
	try {
		const loaded = hl.getLoadedThemes();
		if (!loaded.includes(theme)) {
			const importer = THEME_IMPORTS[theme];
			if (!importer) {
				// 未预置的主题：回退到任意一个已加载主题，不抛错
				return (loaded[0] as BundledTheme) ?? DARK_THEME;
			}
			await hl.loadTheme(await importer());
		}
		return theme;
	} catch {
		// 加载失败时退回到任意一个已加载主题，避免抛错阻塞代码块渲染
		const loaded = hl.getLoadedThemes();
		return (loaded[0] as BundledTheme) ?? DARK_THEME;
	}
}

/**
 * 确保指定语言已加载（未预置的语言动态 import；不在支持表中则降级 plaintext）
 */
async function ensureLanguage(
	hl: ShikiHighlighter,
	lang: BundledLanguage | "plaintext",
): Promise<BundledLanguage | "plaintext"> {
	if (lang === "plaintext") return "plaintext";
	try {
		const loaded = hl.getLoadedLanguages();
		if (!loaded.includes(lang)) {
			const importer = LANG_IMPORTS[lang];
			if (!importer) return "plaintext";
			await hl.loadLanguage(await importer());
		}
		return lang;
	} catch {
		// 语言加载失败则降级为纯文本
		return "plaintext";
	}
}

/**
 * 对代码高亮并返回结构化 token（用于逐行渲染）
 */
export async function highlightToTokens(
	code: string,
	lang: string,
	theme: BundledTheme = DARK_THEME,
): Promise<ThemedToken[][]> {
	const cacheKey = buildTokensCacheKey(code, lang, theme);
	const cached = getCachedTokens(cacheKey);
	if (cached) return cached;

	const hl = await getHighlighter();
	const safeTheme = await ensureTheme(hl, theme);
	const resolvedLang = mapLanguageId(lang);
	const safeLang = await ensureLanguage(hl, resolvedLang);

	// 大文件保护
	const processedCode = applyLineLimitForCode(code);

	const result = hl.codeToTokens(processedCode, {
		lang: safeLang,
		theme: safeTheme,
	});

	setCachedTokens(cacheKey, result.tokens);
	return result.tokens;
}

/**
 * 对单行代码高亮并返回 token（用于 diff 逐行渲染）
 */
export async function highlightLine(
	line: string,
	lang: string,
	theme: BundledTheme = DARK_THEME,
): Promise<ThemedToken[]> {
	const hl = await getHighlighter();
	const safeTheme = await ensureTheme(hl, theme);
	const resolvedLang = mapLanguageId(lang);
	const safeLang = await ensureLanguage(hl, resolvedLang);

	const result = hl.codeToTokens(line, {
		lang: safeLang,
		theme: safeTheme,
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
