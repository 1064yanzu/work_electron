/**
 * templateRegistry.ts
 *
 * 扫描 vendor 目录下导入的 open-design templates，解析 SKILL.md frontmatter，
 * 以结构化 DesignTemplateSummary 列表形式暴露给 IPC 层。
 *
 * 扫描根目录（多路径）：
 *   1. electron/main/design/library/vendor/open-design/templates/  (导入资源)
 *
 * 与 skillsRegistry 的区别：
 *   - skillsRegistry → builtin-skills（手写 ipo-* 技能，主要用于 systemPromptBuilder）
 *   - templateRegistry → 用户可选的"模板"（来自 open-design，更丰富）
 *
 * 同样不缓存，按需扫描（资源量大但都在本地，读取足够快）。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getDesignLibraryRoot } from "./resourcePaths";

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface DesignTemplateSummary {
  id: string;
  name: string;
  description: string;
  /** od.mode: prototype | deck | template | design-system */
  mode?: string;
  /** od.platform */
  platform?: string;
  /** od.scenario */
  scenario?: string;
  /** od.category */
  category?: string;
  triggers: string[];
  /** 是否有 example.html 可用于预览 */
  has_example: boolean;
  /** 来源路径（开发时可回溯） */
  source_dir: string;
}

// ─── 辅助 ────────────────────────────────────────────────────────────────────

async function readFileSafe(p: string): Promise<string | undefined> {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return undefined;
  }
}

/** 极简 frontmatter 解析，仅提取 string/string[] 值 */
function parseFrontmatter(content: string): Record<string, unknown> {
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = content.slice(3, end);
  const result: Record<string, unknown> = {};

  const lines = block.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) {
      i++;
      continue;
    }
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      // 内联数组
      result[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      i++;
    } else if (rawValue === "") {
      // 可能是多行块，尝试读 od.* 子键（下面的 parseOd 函数处理）
      result[key] = null;
      i++;
    } else if (rawValue === "|" || rawValue === ">") {
      // 块标量 — 跳过，只取到 key
      result[key] = "";
      i++;
      // 跳过块内容
      const keyIndent = line.length - line.trimStart().length;
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextIndent = nextLine.length - nextLine.trimStart().length;
        if (nextLine.trim() && nextIndent <= keyIndent) break;
        i++;
      }
    } else {
      result[key] = rawValue.replace(/^["']|["']$/g, "");
      i++;
    }
  }

  // 解析 od: 子块
  const odBlock = parseSubBlock(block, "od");
  if (odBlock) {
    result["od"] = odBlock;
  }

  return result;
}

/** 解析 frontmatter 文本中指定顶级 key 下的子块（仅支持 2 层简单 key:value） */
function parseSubBlock(yamlText: string, topKey: string): Record<string, unknown> | null {
  const lines = yamlText.split("\n");
  const marker = `${topKey}:`;
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === marker) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;

  const result: Record<string, unknown> = {};
  let i = startIdx + 1;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }
    const indent = raw.length - raw.trimStart().length;
    if (indent === 0) break; // 回到顶层
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const subKey = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      result[subKey] = rawValue
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (rawValue === "") {
      // 下一级子块（如 preview:）—— 读取子块
      const sub: Record<string, unknown> = {};
      i++;
      while (i < lines.length) {
        const subRaw = lines[i];
        const subTrimmed = subRaw.trim();
        const subIndent = subRaw.length - subRaw.trimStart().length;
        if (!subTrimmed || subTrimmed.startsWith("#")) {
          i++;
          continue;
        }
        if (subIndent <= indent) break;
        const subColon = subTrimmed.indexOf(":");
        if (subColon !== -1) {
          const sk = subTrimmed.slice(0, subColon).trim();
          const sv = subTrimmed.slice(subColon + 1).trim();
          if (sv.startsWith("[") && sv.endsWith("]")) {
            sub[sk] = sv
              .slice(1, -1)
              .split(",")
              .map((s) => s.trim().replace(/^["']|["']$/g, ""))
              .filter(Boolean);
          } else {
            sub[sk] = sv.replace(/^["']|["']$/g, "");
          }
        }
        i++;
      }
      result[subKey] = sub;
      continue;
    } else {
      result[subKey] = rawValue.replace(/^["']|["']$/g, "");
    }
    i++;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function asStringArray(val: unknown): string[] {
  return Array.isArray(val)
    ? val.filter((v): v is string => typeof v === "string")
    : [];
}

function asString(val: unknown): string | undefined {
  return typeof val === "string" && val ? val : undefined;
}

function asRecord(val: unknown): Record<string, unknown> | undefined {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : undefined;
}

// ─── 核心扫描 ─────────────────────────────────────────────────────────────────

function getTemplateRoots(): string[] {
  const lib = getDesignLibraryRoot();
  return [
    path.join(lib, "vendor/open-design/templates"),
  ];
}

async function scanRoot(root: string): Promise<DesignTemplateSummary[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: DesignTemplateSummary[] = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const id = ent.name;
    if (id.startsWith("_") || id.startsWith(".")) continue;

    const dir = path.join(root, id);
    const skillContent = await readFileSafe(path.join(dir, "SKILL.md"));
    if (!skillContent) continue;

    const fm = parseFrontmatter(skillContent);
    const od = asRecord(fm["od"]) ?? {};

    // 检查是否有 example.html（两个可能位置）
    let hasExample = false;
    try {
      await fs.access(path.join(dir, "example.html"));
      hasExample = true;
    } catch {
      try {
        await fs.access(path.join(dir, "assets", "example.html"));
        hasExample = true;
      } catch {
        // no example
      }
    }

    results.push({
      id,
      name: asString(fm["name"]) ?? id,
      description: asString(fm["description"]) ?? "",
      mode: asString(od["mode"]),
      platform: asString(od["platform"]),
      scenario: asString(od["scenario"]),
      category: asString(od["category"]),
      triggers: asStringArray(fm["triggers"]),
      has_example: hasExample,
      source_dir: dir,
    });
  }

  return results;
}

/**
 * 列出所有导入模板。
 * 调用方（IPC handler）可以按 mode / category / triggers 二次过滤。
 */
export async function listTemplateSummaries(): Promise<DesignTemplateSummary[]> {
  const roots = getTemplateRoots();
  const allLists = await Promise.all(roots.map(scanRoot));
  return allLists.flat().sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 根据 id 加载单个模板的完整资源。
 * 返回 SKILL.md 原文 + 示例 HTML（若有）。
 */
export async function getTemplateDetail(
  id: string,
): Promise<{ id: string; skill_md: string; example_html?: string } | null> {
  const roots = getTemplateRoots();

  for (const root of roots) {
    const safeId = id.replace(/[^\w-]/g, "");
    const dir = path.join(root, safeId);
    const skillMd = await readFileSafe(path.join(dir, "SKILL.md"));
    if (!skillMd) continue;

    const example =
      (await readFileSafe(path.join(dir, "example.html"))) ??
      (await readFileSafe(path.join(dir, "assets", "example.html")));

    return { id: safeId, skill_md: skillMd, example_html: example };
  }

  return null;
}
