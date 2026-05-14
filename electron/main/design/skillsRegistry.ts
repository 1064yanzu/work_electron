/**
 * Design Skill Registry
 *
 * 扫描 `electron/main/design/builtin-skills/<id>/`，解析新结构：
 *   - SKILL.md（含 frontmatter，可能带 `od:` 扩展元数据，e.g. od.tweaks）
 *   - assets/template.html
 *   - references/{checklist,layouts,components,themes}.md
 *   - example.html
 *
 * 提供：
 *   - listSkillSummaries(): 给 IPC design_list_builtin_skills 用
 *   - getSkillResourceMap(id): 给 systemPromptBuilder + design_get_template 用
 *
 * 设计原则：
 *   - frontmatter 解析尽量宽松（不依赖第三方 yaml 库），失败回 fallback
 *   - 不缓存（资源量极小，scan + read 不到 5ms）
 *   - 对旧 SKILL.md（没有 assets/references）保持只读 fallback：缺什么 just skip
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
	getDesignBuiltinSkillsRoot,
	getDesignFramesRoot,
} from "./resourcePaths";

export interface DesignSkillTweak {
	name: string;
	type: "select" | "number";
	values?: string[];
	min?: number;
	max?: number;
	step?: number;
	default?: string | number;
}

export interface DesignSkillSummary {
	name: string;
	description: string;
	version: string;
	triggers: string[];
	group?: string;
	default_frame?: string;
	tweaks?: DesignSkillTweak[];
}

export interface DesignSkillResourceMap {
	id: string;
	skill_md: string;
	template_html?: string;
	checklist_md?: string;
	layouts_md?: string;
	components_md?: string;
	themes_md?: string;
	example_html?: string;
	frontmatter: DesignSkillSummary;
}

async function readFileOptional(p: string): Promise<string | undefined> {
	try {
		return await fs.readFile(p, "utf-8");
	} catch {
		return undefined;
	}
}

function splitInlineFlow(inner: string): string[] {
	// Split by "," but ignore commas inside [...] or {...}.
	const out: string[] = [];
	let depth = 0;
	let buf = "";
	for (const ch of inner) {
		if (ch === "[" || ch === "{") depth += 1;
		else if (ch === "]" || ch === "}") depth -= 1;
		if (ch === "," && depth === 0) {
			out.push(buf);
			buf = "";
		} else {
			buf += ch;
		}
	}
	if (buf.trim()) out.push(buf);
	return out;
}

function parseScalar(value: string): string | number | string[] {
	const trimmed = value.trim();
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		return splitInlineFlow(trimmed.slice(1, -1))
			.map((s) => s.trim().replace(/^["']|["']$/g, ""))
			.filter(Boolean);
	}
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
	return trimmed.replace(/^["']|["']$/g, "");
}

/**
 * Parse a very small subset of YAML that covers what our SKILL.md frontmatter uses:
 *   - top-level scalars: name / description / version / triggers / license / author
 *   - nested map `od:` with scalars + array of inline-flow maps for tweaks
 *
 * Returns a normalized object. Unknown keys are kept on the result.
 */
function parseFrontmatter(content: string): Record<string, unknown> {
	if (!content.startsWith("---")) return {};
	const end = content.indexOf("\n---", 3);
	if (end === -1) return {};
	const block = content.slice(3, end);
	const lines = block.split("\n");

	const result: Record<string, unknown> = {};
	let currentMap: Record<string, unknown> | null = null;
	let currentMapKey = "";
	let currentList: unknown[] | null = null;
	let currentListKey = "";

	const flushList = () => {
		if (currentList !== null && currentMap) {
			currentMap[currentListKey] = currentList;
			currentList = null;
			currentListKey = "";
		}
	};
	const flushMap = () => {
		flushList();
		if (currentMap) {
			result[currentMapKey] = currentMap;
			currentMap = null;
			currentMapKey = "";
		}
	};

	for (const rawLine of lines) {
		if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;

		// Indented line → belongs to current map
		if (/^\s+/.test(rawLine)) {
			const trimmed = rawLine.trim();

			// list item under a map (e.g. tweaks: \n  - { name: ... })
			if (trimmed.startsWith("-")) {
				if (currentMap && currentList === null) {
					// previous line was `tweaks:` — start list
					// But we need to detect which key — handled by checking the last
					// key in currentMap whose value is null sentinel.
					const pendingKey = Object.keys(currentMap).find(
						(k) => currentMap?.[k] === null,
					);
					if (pendingKey) {
						currentList = [];
						currentListKey = pendingKey;
					}
				}
				if (currentList !== null) {
					const item = trimmed.slice(1).trim();
					if (item.startsWith("{") && item.endsWith("}")) {
						const inner = item.slice(1, -1);
						const obj: Record<string, unknown> = {};
						for (const part of splitInlineFlow(inner)) {
							const colon = part.indexOf(":");
							if (colon === -1) continue;
							const k = part.slice(0, colon).trim();
							const v = part.slice(colon + 1).trim();
							obj[k] = parseScalar(v);
						}
						currentList.push(obj);
					} else {
						currentList.push(parseScalar(item));
					}
				}
				continue;
			}

			// nested key: value under map
			const colon = trimmed.indexOf(":");
			if (colon !== -1 && currentMap) {
				flushList();
				const k = trimmed.slice(0, colon).trim();
				const v = trimmed.slice(colon + 1).trim();
				if (v === "") {
					currentMap[k] = null; // sentinel: list/map follows
				} else {
					currentMap[k] = parseScalar(v);
				}
			}
			continue;
		}

		// Top-level line
		flushMap();
		const colon = rawLine.indexOf(":");
		if (colon === -1) continue;
		const key = rawLine.slice(0, colon).trim();
		const value = rawLine.slice(colon + 1).trim();
		if (value === "") {
			currentMap = {};
			currentMapKey = key;
		} else {
			result[key] = parseScalar(value);
		}
	}
	flushMap();
	return result;
}

function normalizeSummary(name: string, fm: Record<string, unknown>): DesignSkillSummary {
	const od = (fm.od as Record<string, unknown> | undefined) ?? {};
	const tweaksRaw = Array.isArray(od.tweaks) ? (od.tweaks as Array<Record<string, unknown>>) : [];
	const tweaks: DesignSkillTweak[] = tweaksRaw.map((t) => ({
		name: String(t.name ?? ""),
		type: (t.type === "number" ? "number" : "select") as "select" | "number",
		values: Array.isArray(t.values) ? (t.values as string[]) : undefined,
		min: typeof t.min === "number" ? t.min : undefined,
		max: typeof t.max === "number" ? t.max : undefined,
		step: typeof t.step === "number" ? t.step : undefined,
		default:
			typeof t.default === "number" || typeof t.default === "string" ? t.default : undefined,
	}));

	return {
		name,
		description: String(fm.description ?? ""),
		version: String(fm.version ?? "0.0.0"),
		triggers: Array.isArray(fm.triggers) ? (fm.triggers as string[]) : [],
		group: typeof od.group === "string" ? od.group : undefined,
		default_frame: typeof od.default_frame === "string" ? od.default_frame : undefined,
		tweaks: tweaks.filter((t) => !!t.name),
	};
}

export async function listSkillSummaries(): Promise<DesignSkillSummary[]> {
	const root = getDesignBuiltinSkillsRoot();
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(root, { withFileTypes: true });
	} catch {
		return [];
	}
	const out: DesignSkillSummary[] = [];
	for (const ent of entries) {
		if (!ent.isDirectory()) continue;
		const skillFile = path.join(root, ent.name, "SKILL.md");
		const content = await readFileOptional(skillFile);
		if (!content) continue;
		const fm = parseFrontmatter(content);
		out.push(normalizeSummary(ent.name, fm));
	}
	return out;
}

export async function getSkillResourceMap(
	id: string,
): Promise<DesignSkillResourceMap | null> {
	const root = getDesignBuiltinSkillsRoot();
	const safeId = id.replace(/[^\w-]/g, "");
	const dir = path.join(root, safeId);
	const skillContent = await readFileOptional(path.join(dir, "SKILL.md"));
	if (!skillContent) return null;
	const fm = parseFrontmatter(skillContent);
	const [template, checklist, layouts, components, themes, example] =
		await Promise.all([
			readFileOptional(path.join(dir, "assets", "template.html")),
			readFileOptional(path.join(dir, "references", "checklist.md")),
			readFileOptional(path.join(dir, "references", "layouts.md")),
			readFileOptional(path.join(dir, "references", "components.md")),
			readFileOptional(path.join(dir, "references", "themes.md")),
			readFileOptional(path.join(dir, "example.html")),
		]);

	return {
		id: safeId,
		skill_md: skillContent,
		template_html: template,
		checklist_md: checklist,
		layouts_md: layouts,
		components_md: components,
		themes_md: themes,
		example_html: example,
		frontmatter: normalizeSummary(safeId, fm),
	};
}

export async function getFrameSource(frameId: string): Promise<string | null> {
	if (!frameId) return null;
	const safe = frameId.replace(/[^\w-]/g, "");
	return (await readFileOptional(path.join(getDesignFramesRoot(), `${safe}.html`))) ?? null;
}
