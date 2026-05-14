/**
 * 设计系统库扫描器
 *
 * - 启动时（按需）扫描 `library/systems/*.DESIGN.md`
 * - 用极简 frontmatter 解析（title / category / swatches / summary）
 * - 不依赖任何 markdown / yaml 第三方库；frontmatter 块用文本切片
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getDesignLibraryRoot } from "./directions";

export interface DesignSystemSummary {
	id: string;
	title: string;
	category: string;
	group: "product" | "style";
	summary: string;
	swatches: string[];
	source?: string;
	license?: string;
}

/**
 * 分组规则：和 categoryConfig 一致 —— 鲜明的视觉/抽象哲学走 "style"，
 * 具体产品 / SaaS 走 "product"。读 frontmatter 的 category 字段做正则。
 */
const STYLE_CATEGORY_RE =
	/(style|editorial|morphism|brutal|retro|vintage|paper|dither|aesthetic|expressive|claym|neumor|glassm|hud|bold|cosmic|fantasy|dramatic|elegant)/i;

const STYLE_ID_HINTS = new Set([
	"kami",
	"atelier-zero",
	"brutalism",
	"claymorphism",
	"neumorphism",
	"glassmorphism",
	"retro",
	"editorial",
	"paper",
	"dithered",
]);

const cache = new Map<string, DesignSystemSummary>();
let scanned = false;

async function parseFrontmatter(filePath: string): Promise<{
	title?: string;
	category?: string;
	summary?: string;
	swatches?: string[];
	source?: string;
	license?: string;
}> {
	const content = await fs.readFile(filePath, "utf-8");
	if (!content.startsWith("---")) return {};
	const end = content.indexOf("\n---", 3);
	if (end === -1) return {};
	const block = content.slice(3, end).trim();

	const fields: Record<string, unknown> = {};
	for (const rawLine of block.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		let value = line.slice(idx + 1).trim();
		// 解析数组
		if (value.startsWith("[") && value.endsWith("]")) {
			value = value.slice(1, -1);
			const parts = value
				.split(",")
				.map((p) => p.trim().replace(/^["']|["']$/g, ""))
				.filter(Boolean);
			fields[key] = parts;
			continue;
		}
		fields[key] = value.replace(/^["']|["']$/g, "");
	}
	return fields as {
		title?: string;
		category?: string;
		summary?: string;
		swatches?: string[];
		source?: string;
		license?: string;
	};
}

function inferGroup(id: string, category: string): "product" | "style" {
	if (STYLE_ID_HINTS.has(id)) return "style";
	if (STYLE_CATEGORY_RE.test(category)) return "style";
	return "product";
}

function deriveTitleFromMarkdown(content: string, fallbackId: string): string {
	const m = content.match(/^#\s+(.+)$/m);
	if (m) {
		return m[1]
			.replace(/^Design System (Inspired by|for|–|-)\s*/i, "")
			.replace(/\s*\([^)]+\)\s*$/, "")
			.trim();
	}
	return fallbackId;
}

function deriveSwatchesFromMarkdown(content: string, max = 5): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const m of content.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
		const c = `#${m[1].toUpperCase()}`;
		if (!seen.has(c)) {
			seen.add(c);
			out.push(c);
			if (out.length >= max) break;
		}
	}
	return out;
}

export async function scanDesignSystems(forceRefresh = false): Promise<
	DesignSystemSummary[]
> {
	if (scanned && !forceRefresh) {
		return Array.from(cache.values());
	}
	cache.clear();

	const root = path.join(getDesignLibraryRoot(), "systems");
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(root, { withFileTypes: true });
	} catch {
		scanned = true;
		return [];
	}

	for (const ent of entries) {
		if (!ent.isDirectory()) continue;
		const id = ent.name;
		const designFile = path.join(root, id, "DESIGN.md");
		try {
			let content = "";
			try {
				content = await fs.readFile(designFile, "utf-8");
			} catch {
				continue;
			}
			const fm = await parseFrontmatter(designFile);
			const title = fm.title || deriveTitleFromMarkdown(content, id);
			const category = fm.category || "Other";
			const summary = fm.summary || "";
			const swatches =
				Array.isArray(fm.swatches) && fm.swatches.length > 0
					? fm.swatches
					: deriveSwatchesFromMarkdown(content);
			const summaryRecord: DesignSystemSummary = {
				id,
				title,
				category,
				group: inferGroup(id, category),
				summary,
				swatches,
				source: fm.source,
				license: fm.license,
			};
			cache.set(id, summaryRecord);
		} catch {
			// 文件不存在或解析失败 → 跳过
		}
	}

	scanned = true;
	return Array.from(cache.values());
}

export function getDesignSystem(id: string): DesignSystemSummary | undefined {
	return cache.get(id);
}
