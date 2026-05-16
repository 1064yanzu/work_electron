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
import type {
	DesignSkillInputConfig,
	DesignSkillParameterConfig,
	DesignSkillParameterType,
	DesignSkillPreviewConfig,
	DesignSkillReferenceDoc,
	DesignSkillResourceMap,
	DesignSkillSummary,
	DesignSkillTweak,
} from "../../shared/types";
import {
	getDesignBuiltinSkillsRoot,
	getDesignFramesRoot,
} from "./resourcePaths";

export type {
	DesignSkillInputConfig,
	DesignSkillParameterConfig,
	DesignSkillPreviewConfig,
	DesignSkillReferenceDoc,
	DesignSkillResourceMap,
	DesignSkillSummary,
	DesignSkillTweak,
} from "../../shared/types";

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
	if (trimmed === "true") return 1;
	if (trimmed === "false") return 0;
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
	return trimmed.replace(/^["']|["']$/g, "");
}

function parseValue(value: string): unknown {
	const trimmed = value.trim();
	if (trimmed === "") return "";
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
		const inner = trimmed.slice(1, -1);
		const obj: Record<string, unknown> = {};
		for (const part of splitInlineFlow(inner)) {
			const colon = part.indexOf(":");
			if (colon === -1) continue;
			const k = part.slice(0, colon).trim();
			const v = part.slice(colon + 1).trim();
			obj[k] = parseValue(v);
		}
		return obj;
	}
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (trimmed === "null") return null;
	return parseScalar(trimmed);
}

function nextMeaningfulIndex(lines: string[], start: number): number {
	for (let i = start; i < lines.length; i += 1) {
		const trimmed = lines[i].trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		return i;
	}
	return -1;
}

function indentOf(line: string): number {
	return line.match(/^\s*/)?.[0].length ?? 0;
}

function parseBlockScalar(
	lines: string[],
	start: number,
	parentIndent: number,
): [string, number] {
	const first = nextMeaningfulIndex(lines, start);
	if (first === -1) return ["", start];
	const contentIndent = indentOf(lines[first]);
	if (contentIndent <= parentIndent) return ["", start];
	const chunks: string[] = [];
	let i = start;
	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();
		const indent = indentOf(line);
		if (trimmed && indent <= parentIndent) break;
		if (!trimmed) {
			chunks.push("");
			i += 1;
			continue;
		}
		chunks.push(line.slice(contentIndent));
		i += 1;
	}
	return [chunks.join("\n").trimEnd(), i];
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean"
		? value
		: typeof value === "number"
			? value !== 0
			: undefined;
}

function asStringArray(value: unknown): string[] | undefined {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function parseMap(lines: string[], start: number, indent: number): [Record<string, unknown>, number] {
	const out: Record<string, unknown> = {};
	let i = start;
	while (i < lines.length) {
		const raw = lines[i];
		const trimmed = raw.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			i += 1;
			continue;
		}
		const lineIndent = indentOf(raw);
		if (lineIndent < indent) break;
		if (lineIndent !== indent || trimmed.startsWith("-")) break;
		const colon = trimmed.indexOf(":");
		if (colon === -1) {
			i += 1;
			continue;
		}
		const key = trimmed.slice(0, colon).trim();
		const value = trimmed.slice(colon + 1).trim();
		if (value === "|" || value === ">") {
			const [block, nextIndex] = parseBlockScalar(lines, i + 1, lineIndent);
			out[key] = block;
			i = nextIndex;
			continue;
		}
		if (value !== "") {
			out[key] = parseValue(value);
			i += 1;
			continue;
		}

		const next = nextMeaningfulIndex(lines, i + 1);
		if (next === -1) {
			out[key] = null;
			i += 1;
			continue;
		}
		const nextIndent = indentOf(lines[next]);
		const nextTrimmed = lines[next].trim();
		if (nextIndent <= lineIndent) {
			out[key] = null;
			i += 1;
			continue;
		}
		if (nextTrimmed.startsWith("-")) {
			const [list, nextIndex] = parseList(lines, next, nextIndent);
			out[key] = list;
			i = nextIndex;
			continue;
		}
		const [child, nextIndex] = parseMap(lines, next, nextIndent);
		out[key] = child;
		i = nextIndex;
	}
	return [out, i];
}

function parseList(lines: string[], start: number, indent: number): [unknown[], number] {
	const out: unknown[] = [];
	let i = start;
	while (i < lines.length) {
		const raw = lines[i];
		const trimmed = raw.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			i += 1;
			continue;
		}
		const lineIndent = indentOf(raw);
		if (lineIndent < indent) break;
		if (lineIndent !== indent || !trimmed.startsWith("-")) break;

		const item = trimmed.slice(1).trim();
		if (!item) {
			const next = nextMeaningfulIndex(lines, i + 1);
			if (next === -1 || indentOf(lines[next]) <= lineIndent) {
				out.push(null);
				i += 1;
				continue;
			}
			const nextIndent = indentOf(lines[next]);
			const nextTrimmed = lines[next].trim();
			if (nextTrimmed.startsWith("-")) {
				const [list, nextIndex] = parseList(lines, next, nextIndent);
				out.push(list);
				i = nextIndex;
				continue;
			}
			const [map, nextIndex] = parseMap(lines, next, nextIndent);
			out.push(map);
			i = nextIndex;
			continue;
		}

		if (item.startsWith("{") && item.endsWith("}")) {
			out.push(parseValue(item));
			i += 1;
			continue;
		}

		const colon = item.indexOf(":");
		if (colon !== -1) {
			const firstKey = item.slice(0, colon).trim();
			const firstValue = item.slice(colon + 1).trim();
			const row: Record<string, unknown> = {};
			if (firstValue === "|" || firstValue === ">") {
				const [block, nextIndex] = parseBlockScalar(lines, i + 1, lineIndent);
				row[firstKey] = block;
				i = nextIndex;
			} else if (firstValue === "") {
				row[firstKey] = null;
				i += 1;
			} else {
				row[firstKey] = parseValue(firstValue);
				i += 1;
			}

			const [rest, nextIndex] = parseMap(lines, i, lineIndent + 2);
			out.push({ ...row, ...rest });
			i = nextIndex;
			continue;
		}

		out.push(parseValue(item));
		i += 1;
	}
	return [out, i];
}

function parseFrontmatter(content: string): Record<string, unknown> {
	if (!content.startsWith("---")) return {};
	const end = content.indexOf("\n---", 3);
	if (end === -1) return {};
	const block = content.slice(3, end);
	return parseMap(block.split("\n"), 0, 0)[0];
}

function normalizeSummary(name: string, fm: Record<string, unknown>): DesignSkillSummary {
	const od = asRecord(fm.od) ?? {};
	const previewRaw = asRecord(od.preview);
	const designSystemRaw = asRecord(od.design_system);
	const outputsRaw = asRecord(od.outputs);
	const craftRaw = asRecord(od.craft);
	const critiqueRaw = asRecord(od.critique);
	const tweaksRaw = Array.isArray(od.tweaks)
		? od.tweaks
				.map((item) => asRecord(item))
				.filter((item): item is Record<string, unknown> => Boolean(item))
		: [];
	const parametersRaw = Array.isArray(od.parameters)
		? od.parameters
				.map((item) => asRecord(item))
				.filter((item): item is Record<string, unknown> => Boolean(item))
		: [];
	const inputsRaw = Array.isArray(od.inputs)
		? od.inputs
				.map((item) => asRecord(item))
				.filter((item): item is Record<string, unknown> => Boolean(item))
		: [];

	const tweaksFromParameters: DesignSkillTweak[] = parametersRaw
		.filter((item): item is Record<string, unknown> => {
			const type = item.type;
			return type === "select" || type === "number";
		})
		.map((item) => ({
			name: String(item.name ?? ""),
			type: item.type === "number" ? "number" : "select",
			values: asStringArray(item.values),
			min: typeof item.min === "number" ? item.min : undefined,
			max: typeof item.max === "number" ? item.max : undefined,
			step: typeof item.step === "number" ? item.step : undefined,
			default:
				typeof item.default === "number" || typeof item.default === "string"
					? item.default
					: undefined,
		}));

	const tweaks: DesignSkillTweak[] =
		tweaksRaw.length > 0
			? tweaksRaw.map((t) => ({
					name: String(t?.name ?? ""),
					type: t?.type === "number" ? "number" : "select",
					values: asStringArray(t?.values),
					min: typeof t?.min === "number" ? t.min : undefined,
					max: typeof t?.max === "number" ? t.max : undefined,
					step: typeof t?.step === "number" ? t.step : undefined,
					default:
						typeof t?.default === "number" || typeof t?.default === "string"
							? t.default
							: undefined,
				}))
			: tweaksFromParameters;

	const preview: DesignSkillPreviewConfig | undefined = previewRaw
		? {
				type:
					previewRaw.type === "jsx" ||
					previewRaw.type === "pptx" ||
					previewRaw.type === "markdown"
						? previewRaw.type
						: "html",
				entry: typeof previewRaw.entry === "string" ? previewRaw.entry : undefined,
				reload: typeof previewRaw.reload === "string" ? previewRaw.reload : undefined,
			}
		: undefined;

	const parameters: DesignSkillParameterConfig[] = parametersRaw.map((item) => {
		const type = String(item?.type ?? "select") as DesignSkillParameterType;
		const min = typeof item?.min === "number" ? item.min : undefined;
		const max = typeof item?.max === "number" ? item.max : undefined;
		return {
			name: String(item?.name ?? ""),
			type,
			default:
				typeof item?.default === "number" || typeof item?.default === "string"
					? item.default
					: undefined,
			range:
				typeof min === "number" && typeof max === "number" ? [min, max] : undefined,
			values: asStringArray(item?.values),
		};
	});

	const inputs: DesignSkillInputConfig[] = inputsRaw.map((item) => ({
		name: String(item?.name ?? ""),
		type:
			item?.type === "integer" ||
			item?.type === "enum" ||
			item?.type === "boolean"
				? item.type
				: "string",
		required: asBoolean(item?.required),
		default:
			typeof item?.default === "string" ||
			typeof item?.default === "number" ||
			typeof item?.default === "boolean"
				? item.default
				: undefined,
		min: typeof item?.min === "number" ? item.min : undefined,
		max: typeof item?.max === "number" ? item.max : undefined,
		values: asStringArray(item?.values),
	}));

	return {
		name,
		description: String(fm.description ?? ""),
		version: String(fm.version ?? "0.0.0"),
		triggers: asStringArray(fm.triggers) ?? [],
		group:
			typeof od.group === "string"
				? od.group
				: typeof od.category === "string"
					? od.category
					: undefined,
		category: typeof od.category === "string" ? od.category : undefined,
		default_frame: typeof od.default_frame === "string" ? od.default_frame : undefined,
		mode:
			od.mode === "prototype" ||
			od.mode === "deck" ||
			od.mode === "template" ||
			od.mode === "design-system" ||
			od.mode === "image" ||
			od.mode === "video" ||
			od.mode === "audio" ||
			od.mode === "utility"
				? od.mode
				: undefined,
		surface: typeof od.surface === "string" ? od.surface : undefined,
		platform: typeof od.platform === "string" ? od.platform : undefined,
		skill_type: typeof od.type === "string" ? od.type : undefined,
		upstream: typeof od.upstream === "string" ? od.upstream : undefined,
		tweaks: tweaks.filter((t) => !!t.name),
		preview,
		design_system: designSystemRaw
			? {
					requires: asBoolean(designSystemRaw.requires),
					sections: asStringArray(designSystemRaw.sections),
				}
			: undefined,
		craft_requires: craftRaw ? asStringArray(craftRaw.requires) : undefined,
		inputs: inputs.filter((input) => !!input.name),
		parameters: parameters.filter((param) => !!param.name),
		outputs: outputsRaw
			? {
					primary:
						typeof outputsRaw.primary === "string" ? outputsRaw.primary : undefined,
					secondary: asStringArray(outputsRaw.secondary),
				}
			: undefined,
		capabilities_required: asStringArray(od.capabilities_required),
		critique_policy:
			critiqueRaw?.policy === "required" ||
			critiqueRaw?.policy === "opt-in" ||
			critiqueRaw?.policy === "opt-out"
				? critiqueRaw.policy
				: undefined,
		featured: typeof od.featured === "number" ? od.featured : undefined,
		scenario: typeof od.scenario === "string" ? od.scenario : undefined,
	};
}

async function listReferenceDocs(dir: string): Promise<DesignSkillReferenceDoc[]> {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const docs = await Promise.all(
		entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(async (entry) => {
				const content = await readFileOptional(path.join(dir, entry.name));
				if (!content) return null;
				const id = entry.name.replace(/\.md$/i, "");
				const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? id;
				return { id, title, content };
			}),
	);
	return docs.filter((doc): doc is DesignSkillReferenceDoc => !!doc);
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
	const referencesDir = path.join(dir, "references");
	const [template, checklist, layouts, components, themes, example, references] =
		await Promise.all([
			readFileOptional(path.join(dir, "assets", "template.html")) ??
				readFileOptional(path.join(dir, "template.html")),
			readFileOptional(path.join(referencesDir, "checklist.md")) ??
				readFileOptional(path.join(dir, "checklist.md")),
			readFileOptional(path.join(referencesDir, "layouts.md")) ??
				readFileOptional(path.join(dir, "layouts.md")),
			readFileOptional(path.join(referencesDir, "components.md")) ??
				readFileOptional(path.join(dir, "components.md")),
			readFileOptional(path.join(referencesDir, "themes.md")) ??
				readFileOptional(path.join(dir, "themes.md")),
			readFileOptional(path.join(dir, "example.html")),
			listReferenceDocs(referencesDir),
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
		references,
		frontmatter: normalizeSummary(safeId, fm),
	};
}

export async function getFrameSource(frameId: string): Promise<string | null> {
	if (!frameId) return null;
	const safe = frameId.replace(/[^\w-]/g, "");
	return (await readFileOptional(path.join(getDesignFramesRoot(), `${safe}.html`))) ?? null;
}
