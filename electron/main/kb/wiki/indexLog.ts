/**
 * index.md 和 log.md 的维护服务
 * index.md：内容目录（所有页面的链接和摘要）
 * log.md：操作日志（append-only）
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { WikiPage, LogOperation } from "./types";
import { INDEX_FILE_NAME, LOG_FILE_NAME, PAGE_TYPE_DIRS } from "./types";

// ---------------------------------------------------------------------------
// index.md
// ---------------------------------------------------------------------------

/**
 * 重建 index.md（全量重建）
 * 按 page_type 分组展示所有页面
 */
export async function rebuildIndex(
	wikiRoot: string,
	pages: WikiPage[],
	scopeName: string,
): Promise<void> {
	const now = formatTimestamp(Date.now());

	// 按 page_type 分组
	const groups: Record<string, WikiPage[]> = {
		entity: [],
		concept: [],
		workflow: [],
		other: [],
	};

	for (const page of pages) {
		// 跳过知识地图（它是特殊页面）
		if (page.slug === "知识地图" || page.slug === "知识地图") continue;

		const type = page.page_type || "other";
		if (type in groups) {
			groups[type].push(page);
		} else {
			groups.other.push(page);
		}
	}

	const lines: string[] = [];
	lines.push(`# ${scopeName} Wiki`);
	lines.push("");
	lines.push("> 原始资料目录：当前线程工作目录本身");
	lines.push(`> 生成时间：${now}`);
	lines.push("");

	// 实体
	if (groups.entity.length > 0) {
		lines.push("## 实体 (Entities)");
		lines.push("");
		for (const p of sortByTitle(groups.entity)) {
			const dir = PAGE_TYPE_DIRS.entity || "";
			const relPath = dir ? `./${dir}/${p.slug}.md` : `./${p.slug}.md`;
			lines.push(`- [${p.title}](${relPath}) — ${p.summary || "暂无摘要"}`);
		}
		lines.push("");
	}

	// 概念
	if (groups.concept.length > 0) {
		lines.push("## 概念 (Concepts)");
		lines.push("");
		for (const p of sortByTitle(groups.concept)) {
			const dir = PAGE_TYPE_DIRS.concept || "";
			const relPath = dir ? `./${dir}/${p.slug}.md` : `./${p.slug}.md`;
			lines.push(`- [${p.title}](${relPath}) — ${p.summary || "暂无摘要"}`);
		}
		lines.push("");
	}

	// 流程
	if (groups.workflow.length > 0) {
		lines.push("## 流程 (Workflows)");
		lines.push("");
		for (const p of sortByTitle(groups.workflow)) {
			const dir = PAGE_TYPE_DIRS.workflow || "";
			const relPath = dir ? `./${dir}/${p.slug}.md` : `./${p.slug}.md`;
			lines.push(`- [${p.title}](${relPath}) — ${p.summary || "暂无摘要"}`);
		}
		lines.push("");
	}

	// 其他
	if (groups.other.length > 0) {
		lines.push("## 其他");
		lines.push("");
		for (const p of sortByTitle(groups.other)) {
			lines.push(`- [${p.title}](./${p.slug}.md) — ${p.summary || "暂无摘要"}`);
		}
		lines.push("");
	}

	// 知识地图（始终显示）
	const mapPage = pages.find(
		(p) => p.slug === "知识地图" || p.title === "知识地图",
	);
	if (mapPage) {
		lines.push("## 入口");
		lines.push("");
		lines.push(
			`- [知识地图](./${mapPage.slug}.md) — ${mapPage.summary || "当前线程工作目录的 Wiki 入口与结构地图"}`,
		);
		lines.push("");
	}

	const totalPageCount = pages.filter(
		(p) => p.slug !== "知识地图",
	).length;
	lines.push("---");
	lines.push("");
	lines.push(`共 ${totalPageCount} 个知识页面 · 最后更新：${now}`);
	lines.push("");

	await fs.writeFile(
		path.join(wikiRoot, INDEX_FILE_NAME),
		lines.join("\n"),
		"utf-8",
	);
}

// ---------------------------------------------------------------------------
// log.md
// ---------------------------------------------------------------------------

/**
 * 追加一条日志到 log.md
 */
export async function appendLog(
	wikiRoot: string,
	operation: LogOperation,
	detail: string,
): Promise<void> {
	const logPath = path.join(wikiRoot, LOG_FILE_NAME);
	const timestamp = formatTimestamp(Date.now());
	const entry = `- [${timestamp}] **${operation}** — ${detail}\n`;

	try {
		await fs.appendFile(logPath, entry, "utf-8");
	} catch {
		// log.md 不存在时创建
		await fs.writeFile(logPath, `# Wiki Log\n\n${entry}`, "utf-8");
	}
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
	const d = new Date(ts);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sortByTitle(pages: WikiPage[]): WikiPage[] {
	return [...pages].sort((a, b) => a.title.localeCompare(b.title));
}
