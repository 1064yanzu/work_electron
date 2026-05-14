#!/usr/bin/env node
// Augment imported open-design DESIGN.md files with frontmatter the existing
// systemRegistry can parse, plus a 4-line attribution header.
// Idempotent: skips files that already have frontmatter.
import fs from "node:fs/promises";
import path from "node:path";

const SYSTEMS_DIR = path.resolve(
  "electron/main/design/library/systems",
);

const EXISTING_FRONTMATTER = new Set([
  "airbnb",
  "apple",
  "claude",
  "cursor",
  "linear-app",
  "notion",
  "raycast",
  "stripe",
  "supabase",
  "vercel",
]);

const STYLE_IDS = new Set([
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

function escapeYaml(s) {
  return String(s).replace(/"/g, '\\"');
}

async function processSystem(id) {
  if (EXISTING_FRONTMATTER.has(id)) return { id, action: "skip-existing" };
  const file = path.join(SYSTEMS_DIR, id, "DESIGN.md");
  let raw;
  try {
    raw = await fs.readFile(file, "utf-8");
  } catch {
    return { id, action: "missing" };
  }
  if (raw.startsWith("---")) return { id, action: "skip-has-frontmatter" };

  // H1 title (first "# ...")
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  let title = titleMatch ? titleMatch[1].trim() : id;
  title = title.replace(/^Design System (Inspired by|for|–|-)\s*/i, "");
  title = title.replace(/\s*\([^)]+\)\s*$/, "");
  title = title.replace(/\s*DESIGN\.md.*$/i, "");

  // Category — try "> Category: X" or fallback heuristic
  const catMatch = raw.match(/Category[:：]\s*([^\n<>]+)/i);
  let category = catMatch ? catMatch[1].trim() : "";
  if (!category) category = STYLE_IDS.has(id) ? "Style" : "SaaS";

  // Summary — first quote-block line
  const summaryMatch = raw.match(/^>\s*(.+)$/m);
  let summary = summaryMatch ? summaryMatch[1].trim() : "";
  summary = summary.replace(/^Category[:：]\s*[^—–-]+[—–-]\s*/i, "");
  summary = summary.replace(/^Category[:：]\s*[^\n]+$/i, "");
  if (!summary) {
    const para = raw.match(/^#[^\n]+\n+([^\n#>].+)/m);
    if (para) summary = para[1].replace(/[`*_]/g, "").slice(0, 140);
  }

  // Swatches — first 5 distinct hex colours
  const seen = new Set();
  const swatches = [];
  for (const m of raw.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const c = `#${m[1].toUpperCase()}`;
    if (!seen.has(c)) {
      seen.add(c);
      swatches.push(c);
      if (swatches.length >= 5) break;
    }
  }

  const fm = [
    "---",
    `title: "${escapeYaml(title)}"`,
    `category: "${escapeYaml(category)}"`,
    `swatches: [${swatches.map((s) => `"${s}"`).join(", ")}]`,
    `summary: "${escapeYaml(summary)}"`,
    "source: open-design",
    "license: Apache-2.0",
    "---",
    "",
    `<!-- Source: open-design/design-systems/${id}/DESIGN.md | License: Apache-2.0 | Imported: 2026-05-14 -->`,
    "",
  ].join("\n");

  await fs.writeFile(file, fm + raw, "utf-8");
  return {
    id,
    action: "patched",
    title,
    category,
    swatches: swatches.length,
  };
}

const entries = await fs.readdir(SYSTEMS_DIR, { withFileTypes: true });
const results = [];
for (const ent of entries) {
  if (!ent.isDirectory()) continue;
  results.push(await processSystem(ent.name));
}
const patched = results.filter((r) => r.action === "patched");
const skipped = results.filter((r) => r.action.startsWith("skip"));
const missing = results.filter((r) => r.action === "missing");
console.log(
  JSON.stringify(
    { patched: patched.length, skipped: skipped.length, missing: missing.length },
    null,
    2,
  ),
);
console.log(
  patched
    .slice(0, 5)
    .map((r) => `  - ${r.id}: title=${r.title}, category=${r.category}, swatches=${r.swatches}`)
    .join("\n"),
);
