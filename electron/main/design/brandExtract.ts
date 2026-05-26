/**
 * Brand Extraction Pipeline（M2.1）
 *
 * 从一个站点 URL 抽取品牌资产（hex 调色板 / 主字体 / logo），
 * 生成 `<work_dir>/brand-spec.md`，并在 system prompt 中以最高优先级注入。
 *
 * - 不依赖 puppeteer / playwright；用 fetch + 正则做轻量提取（够覆盖 90% 的站点）
 * - 同源 css `<link rel="stylesheet">` 会跟随抓 1 次
 * - 不抓 favicon 的 svg（避免 SVG 反序列化坑），只保留 URL 供 LLM 后续引用
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface BrandSpec {
	url: string;
	site_name?: string;
	colors: string[];
	logo_url?: string;
	favicon_url?: string;
	fonts: string[];
	notes?: string;
}

const HEX_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}\n]+)/gi;

function toAbsolute(base: string, ref: string | undefined): string | undefined {
	if (!ref) return undefined;
	try {
		return new URL(ref, base).toString();
	} catch {
		return undefined;
	}
}

function uniq<T>(arr: T[]): T[] {
	const seen = new Set<T>();
	const out: T[] = [];
	for (const x of arr) {
		if (!seen.has(x)) {
			seen.add(x);
			out.push(x);
		}
	}
	return out;
}

function normalizeHex(c: string): string {
	if (c.length === 4) {
		// #abc → #aabbcc
		const a = c[1];
		const b = c[2];
		const d = c[3];
		return `#${a}${a}${b}${b}${d}${d}`.toUpperCase();
	}
	return c.toUpperCase();
}

function extractColors(text: string, limit = 8): string[] {
	const colors: string[] = [];
	for (const m of text.matchAll(HEX_RE)) {
		colors.push(normalizeHex(`#${m[1]}`));
	}
	// 过滤纯黑/纯白/灰阶（出现频率高但通常不是品牌色）
	const counts = new Map<string, number>();
	for (const c of colors) counts.set(c, (counts.get(c) ?? 0) + 1);
	const sorted = Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([c]) => c);
	const drop = new Set(["#000000", "#FFFFFF", "#FFF", "#000"]);
	const picked = sorted.filter((c) => !drop.has(c));
	return picked.slice(0, limit);
}

function extractFonts(text: string): string[] {
	const fonts: string[] = [];
	for (const m of text.matchAll(FONT_FAMILY_RE)) {
		const raw = m[1].trim();
		// 去掉 !important / 备选字体；只取第一个字体名
		const first = raw
			.split(",")[0]
			.replace(/['"!]+/g, "")
			.replace(/important/i, "")
			.trim();
		if (
			first &&
			first.length < 60 &&
			!/^(sans-serif|serif|monospace|system-ui)$/i.test(first)
		) {
			fonts.push(first);
		}
	}
	return uniq(fonts).slice(0, 4);
}

function extractTitle(html: string): string | undefined {
	const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
	return m ? m[1].trim() : undefined;
}

function extractLogo(html: string, baseUrl: string): string | undefined {
	// 优先：alt 包含 logo 的 img；其次：header 内首个 img
	const imgRe =
		/<img\b[^>]*?(?:alt=["'][^"']*logo[^"']*["'])?[^>]*?src=["']([^"']+)["'][^>]*>/gi;
	for (const m of html.matchAll(imgRe)) {
		const src = m[1];
		if (/logo/i.test(m[0]) || /logo/i.test(src)) {
			return toAbsolute(baseUrl, src);
		}
	}
	const firstImg = html.match(/<img\b[^>]*?src=["']([^"']+)["']/i);
	return toAbsolute(baseUrl, firstImg?.[1]);
}

function extractFavicon(html: string, baseUrl: string): string | undefined {
	const linkRe =
		/<link\b[^>]*rel=["']([^"']*icon[^"']*)["'][^>]*href=["']([^"']+)["']/gi;
	for (const m of html.matchAll(linkRe)) {
		return toAbsolute(baseUrl, m[2]);
	}
	return toAbsolute(baseUrl, "/favicon.ico");
}

function extractCssLinks(html: string, baseUrl: string, limit = 3): string[] {
	const linkRe =
		/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
	const urls: string[] = [];
	for (const m of html.matchAll(linkRe)) {
		const u = toAbsolute(baseUrl, m[1]);
		if (u) urls.push(u);
		if (urls.length >= limit) break;
	}
	return urls;
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
	const controller = new AbortController();
	const t = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			redirect: "follow",
			headers: {
				"user-agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
			},
			signal: controller.signal,
		});
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const text = await res.text();
		return text;
	} finally {
		clearTimeout(t);
	}
}

export async function extractBrand(url: string): Promise<BrandSpec> {
	const baseUrl = url.endsWith("/") ? url : `${url}/`;
	const html = await fetchText(url);
	const inlineStyles = Array.from(
		html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi),
	)
		.map((m) => m[1])
		.join("\n");

	const cssLinks = extractCssLinks(html, baseUrl, 3);
	const externalCss = await Promise.all(
		cssLinks.map(async (u) => {
			try {
				return await fetchText(u);
			} catch {
				return "";
			}
		}),
	);
	const allCss = [inlineStyles, ...externalCss].join("\n");

	const colors = extractColors(`${html}\n${allCss}`);
	const fonts = extractFonts(allCss);

	return {
		url,
		site_name: extractTitle(html),
		colors,
		logo_url: extractLogo(html, baseUrl),
		favicon_url: extractFavicon(html, baseUrl),
		fonts,
	};
}

export function brandSpecToMarkdown(spec: BrandSpec): string {
	const lines: string[] = [];
	lines.push(`# Brand Spec`);
	if (spec.site_name) lines.push(`> Source: ${spec.site_name}（${spec.url}）`);
	else lines.push(`> Source: ${spec.url}`);
	lines.push("");

	lines.push("## Palette");
	if (spec.colors.length === 0) {
		lines.push("- （未提取到品牌色，请手动指定）");
	} else {
		const [primary, secondary, accent, ...rest] = spec.colors;
		if (primary) lines.push(`- **--brand-primary**: \`${primary}\``);
		if (secondary) lines.push(`- **--brand-secondary**: \`${secondary}\``);
		if (accent) lines.push(`- **--brand-accent**: \`${accent}\``);
		rest.forEach((c, i) => {
			lines.push(`- **--brand-extra-${i + 1}**: \`${c}\``);
		});
	}
	lines.push("");

	lines.push("## Typography");
	if (spec.fonts.length === 0) {
		lines.push("- （未提取到品牌字体；使用 system font stack）");
	} else {
		const [display, body] = spec.fonts;
		if (display) lines.push(`- **--brand-font-display**: \`${display}\``);
		if (body) lines.push(`- **--brand-font-body**: \`${body}\``);
	}
	lines.push("");

	if (spec.logo_url || spec.favicon_url) {
		lines.push("## Assets");
		if (spec.logo_url) lines.push(`- Logo: ${spec.logo_url}`);
		if (spec.favicon_url) lines.push(`- Favicon: ${spec.favicon_url}`);
		lines.push("");
	}

	lines.push("## CSS 起手");
	lines.push("```css");
	lines.push(":root {");
	spec.colors.slice(0, 3).forEach((c, i) => {
		const name = ["--brand-primary", "--brand-secondary", "--brand-accent"][i];
		lines.push(`  ${name}: ${c};`);
	});
	if (spec.fonts[0]) lines.push(`  --brand-font-display: "${spec.fonts[0]}";`);
	if (spec.fonts[1]) lines.push(`  --brand-font-body: "${spec.fonts[1]}";`);
	lines.push("}");
	lines.push("```");
	lines.push("");
	lines.push("> 在 HTML 设计稿中必须使用上面 :root 定义的 brand-* 变量。");

	return lines.join("\n");
}

export async function writeBrandSpec(
	workDir: string,
	spec: BrandSpec,
): Promise<string> {
	const md = brandSpecToMarkdown(spec);
	const dst = path.join(workDir, "brand-spec.md");
	await fs.writeFile(dst, md, "utf-8");
	return dst;
}
