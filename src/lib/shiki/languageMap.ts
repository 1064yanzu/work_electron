// Shiki 语言映射
// 从文件扩展名 / 别名映射到 shiki 内置语言 ID

import type { BundledLanguage } from "shiki";

/**
 * 扩展名 → shiki 语言 ID 映射表
 * 复用 diffUtils.inferLanguage 的映射并扩展到 shiki 支持的标识符
 */
const EXT_TO_LANG: Record<string, BundledLanguage> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	py: "python",
	rs: "rust",
	go: "go",
	java: "java",
	kt: "kotlin",
	rb: "ruby",
	css: "css",
	scss: "scss",
	less: "less",
	html: "html",
	htm: "html",
	json: "json",
	jsonc: "jsonc",
	yml: "yaml",
	yaml: "yaml",
	toml: "toml",
	xml: "xml",
	md: "markdown",
	mdx: "mdx",
	sql: "sql",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	c: "c",
	cc: "cpp",
	cpp: "cpp",
	h: "c",
	hpp: "cpp",
	swift: "swift",
	vue: "vue",
	svelte: "svelte",
	php: "php",
	lua: "lua",
	r: "r",
	dart: "dart",
	zig: "zig",
	dockerfile: "dockerfile",
	makefile: "makefile",
	graphql: "graphql",
	gql: "graphql",
	prisma: "prisma",
	proto: "proto",
	ini: "ini",
	env: "dotenv",
};

/**
 * 语言别名 → shiki 语言 ID
 * 用于 markdown 代码块的语言标注
 */
const ALIAS_TO_LANG: Record<string, BundledLanguage> = {
	typescript: "typescript",
	javascript: "javascript",
	python: "python",
	rust: "rust",
	golang: "go",
	csharp: "csharp",
	"c#": "csharp",
	"c++": "cpp",
	shell: "bash",
	zsh: "bash",
	sh: "bash",
	yml: "yaml",
	dockerfile: "dockerfile",
	text: "plaintext" as BundledLanguage,
	txt: "plaintext" as BundledLanguage,
	plain: "plaintext" as BundledLanguage,
	react: "tsx",
};

/**
 * 将文件扩展名或语言别名映射为 shiki 语言 ID
 */
export function mapLanguageId(extOrAlias: string): BundledLanguage | "plaintext" {
	const key = extOrAlias.toLowerCase().replace(/^\./, "");

	// 先查扩展名映射
	if (key in EXT_TO_LANG) return EXT_TO_LANG[key];

	// 再查别名映射
	if (key in ALIAS_TO_LANG) return ALIAS_TO_LANG[key];

	// 如果恰好是 shiki 直接支持的语言名就直接返回
	return "plaintext";
}

/**
 * 从文件路径提取扩展名并映射到 shiki 语言
 */
export function mapLanguageFromPath(filePath: string): BundledLanguage | "plaintext" {
	const parts = filePath.split(".");
	if (parts.length < 2) {
		// 无扩展名，检查文件名
		const filename = filePath.split(/[\\/]/).pop()?.toLowerCase() || "";
		if (filename === "dockerfile") return "dockerfile";
		if (filename === "makefile") return "makefile";
		return "plaintext";
	}
	return mapLanguageId(parts[parts.length - 1]);
}
