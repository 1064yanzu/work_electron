/**
 * YAML Frontmatter 解析 / 序列化工具
 * 轻量实现，不依赖 gray-matter 等外部库
 */
import type { WikiFrontmatter } from "./types";

const FRONTMATTER_DELIMITER = "---";

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------

/**
 * 从 Markdown 文件内容中解析 frontmatter 和正文
 *
 * 格式：
 * ```
 * ---
 * title: "xxx"
 * ...
 * ---
 *
 * # 正文
 * ...
 * ```
 */
export function parseFrontmatter(raw: string): {
	frontmatter: WikiFrontmatter;
	content: string;
} {
	const trimmed = raw.trimStart();

	if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
		return {
			frontmatter: createEmptyFrontmatter(),
			content: raw,
		};
	}

	// 找到第二个 --- 分隔符
	const secondIdx = trimmed.indexOf(
		`\n${FRONTMATTER_DELIMITER}`,
		FRONTMATTER_DELIMITER.length,
	);
	if (secondIdx === -1) {
		return {
			frontmatter: createEmptyFrontmatter(),
			content: raw,
		};
	}

	const yamlBlock = trimmed.slice(
		FRONTMATTER_DELIMITER.length + 1,
		secondIdx,
	);
	const bodyStart =
		secondIdx + 1 + FRONTMATTER_DELIMITER.length;
	const content = trimmed.slice(bodyStart).replace(/^\n+/, "");

	const parsed = parseYamlLite(yamlBlock);

	return {
		frontmatter: {
			title: String(parsed.title || ""),
			slug: String(parsed.slug || ""),
			page_type: String(parsed.page_type || "entity"),
			summary: String(parsed.summary || ""),
			tags: parseStringArray(parsed.tags),
			related_pages: parseStringArray(parsed.related_pages),
			confidence: Number(parsed.confidence ?? 0.7),
			last_updated_by: String(parsed.last_updated_by || "auto"),
			created_at: Number(parsed.created_at || 0),
			updated_at: Number(parsed.updated_at || 0),
		},
		content,
	};
}

// ---------------------------------------------------------------------------
// 序列化
// ---------------------------------------------------------------------------

/**
 * 将 frontmatter 和正文组合为完整的 Markdown 文件内容
 */
export function serializeFrontmatter(
	fm: WikiFrontmatter,
	content: string,
): string {
	const lines: string[] = [FRONTMATTER_DELIMITER];

	lines.push(`title: ${yamlQuote(fm.title)}`);
	lines.push(`slug: ${yamlQuote(fm.slug)}`);
	lines.push(`page_type: ${yamlQuote(fm.page_type)}`);
	lines.push(`summary: ${yamlQuote(fm.summary)}`);
	lines.push("tags:");
	for (const tag of fm.tags) {
		lines.push(`  - ${yamlQuote(tag)}`);
	}
	lines.push("related_pages:");
	for (const rp of fm.related_pages) {
		lines.push(`  - ${yamlQuote(rp)}`);
	}
	lines.push(`confidence: ${fm.confidence}`);
	lines.push(`last_updated_by: ${yamlQuote(fm.last_updated_by)}`);
	lines.push(`created_at: ${fm.created_at}`);
	lines.push(`updated_at: ${fm.updated_at}`);

	lines.push(FRONTMATTER_DELIMITER);
	lines.push("");
	lines.push(content);

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Slug 转换
// ---------------------------------------------------------------------------

/**
 * 将标题转换为文件名安全的 slug
 */
export function titleToSlug(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 100) || `page-${Date.now()}`
	);
}

/**
 * 根据 page_type 返回子目录名
 */
export function getPageDir(pageType: string): string {
	const dirMap: Record<string, string> = {
		entity: "entities",
		concept: "concepts",
		workflow: "workflows",
	};
	return dirMap[pageType] || "";
}

// ---------------------------------------------------------------------------
// 内部辅助
// ---------------------------------------------------------------------------

function createEmptyFrontmatter(): WikiFrontmatter {
	return {
		title: "",
		slug: "",
		page_type: "entity",
		summary: "",
		tags: [],
		related_pages: [],
		confidence: 0.7,
		last_updated_by: "auto",
		created_at: 0,
		updated_at: 0,
	};
}

/**
 * 极简 YAML 解析——仅支持单层 key: value 和 key:\n  - item 数组
 * 不支持嵌套对象、多行字符串等复杂语法
 */
function parseYamlLite(yaml: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const lines = yaml.split("\n");

	let currentKey = "";
	let currentArray: string[] | null = null;

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();

		// 空行或注释
		if (!line || line.startsWith("#")) continue;

		// 数组项: "  - value"
		if (/^\s+-\s+/.test(line) && currentArray !== null) {
			const value = line.replace(/^\s+-\s+/, "").trim();
			currentArray.push(yamlUnquote(value));
			continue;
		}

		// 如果之前在收集数组，先保存
		if (currentArray !== null && currentKey) {
			result[currentKey] = currentArray;
			currentArray = null;
			currentKey = "";
		}

		// key: value 行
		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;

		const key = line.slice(0, colonIdx).trim();
		const valueRaw = line.slice(colonIdx + 1).trim();

		if (!key) continue;

		if (valueRaw === "" || valueRaw === "[]") {
			// 可能是数组的开始，也可能是空值
			currentKey = key;
			currentArray = [];
			continue;
		}

		// 普通 key: value
		result[key] = yamlUnquote(valueRaw);
		currentKey = "";
		currentArray = null;
	}

	// 处理文件末尾的数组
	if (currentArray !== null && currentKey) {
		result[currentKey] = currentArray;
	}

	return result;
}

/** 安全引用 YAML 字符串值 */
function yamlQuote(value: string): string {
	if (!value) return '""';
	// 如果包含特殊字符，用双引号包裹
	if (/[:#\[\]{}&*!|>'"%@`\n]/.test(value) || value.trim() !== value) {
		return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	}
	return value;
}

/** 去除 YAML 值的引号 */
function yamlUnquote(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed
			.slice(1, -1)
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");
	}
	return trimmed;
}

/** 将 unknown 值解析为 string[] */
function parseStringArray(val: unknown): string[] {
	if (Array.isArray(val)) return val.map(String);
	if (typeof val === "string") {
		try {
			const parsed = JSON.parse(val);
			return Array.isArray(parsed) ? parsed.map(String) : [];
		} catch {
			return [];
		}
	}
	return [];
}
