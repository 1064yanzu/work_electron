// Diff 工具函数
// 提供 diff 生成、统计、路径格式化等功能

import { diffLines, type Change } from "diff";

// Diff 行数据
export interface DiffLine {
	type: "added" | "removed" | "unchanged";
	content: string;
	oldLineNumber?: number;
	newLineNumber?: number;
}

// Diff 统计
export interface DiffStats {
	additions: number;
	deletions: number;
	changes: number;
}

// Diff 分块（用于折叠展示）
export interface DiffHunk {
	startOld: number;
	startNew: number;
	lines: DiffLine[];
}

/**
 * 生成两段文本的行级 diff
 */
export function generateDiff(
	oldContent: string,
	newContent: string,
): DiffLine[] {
	const changes: Change[] = diffLines(oldContent, newContent);
	const result: DiffLine[] = [];
	let oldLine = 1;
	let newLine = 1;

	for (const change of changes) {
		const lines = change.value.replace(/\n$/, "").split("\n");

		for (const line of lines) {
			if (change.added) {
				result.push({
					type: "added",
					content: line,
					newLineNumber: newLine++,
				});
			} else if (change.removed) {
				result.push({
					type: "removed",
					content: line,
					oldLineNumber: oldLine++,
				});
			} else {
				result.push({
					type: "unchanged",
					content: line,
					oldLineNumber: oldLine++,
					newLineNumber: newLine++,
				});
			}
		}
	}

	return result;
}

/**
 * 统计 diff 的增删行数
 */
export function parseDiffStats(lines: DiffLine[]): DiffStats {
	const additions = lines.filter((l) => l.type === "added").length;
	const deletions = lines.filter((l) => l.type === "removed").length;
	return {
		additions,
		deletions,
		changes: additions + deletions,
	};
}

/**
 * 从完整路径生成显示用的相对路径
 * 如果提供 rootPath 则相对于根路径，否则只显示最后两段
 */
export function formatFilePath(fullPath: string, rootPath?: string): string {
	if (!fullPath) return "";
	// 标准化路径分隔符
	const normalized = fullPath.replace(/\\/g, "/");
	if (rootPath) {
		const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "");
		if (normalized.startsWith(normalizedRoot)) {
			return normalized.slice(normalizedRoot.length + 1);
		}
	}
	// 如果没有 rootPath 或路径不匹配，显示最后两段
	const parts = normalized.split("/").filter(Boolean);
	if (parts.length <= 2) return normalized;
	return ".../" + parts.slice(-2).join("/");
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filePath: string): string {
	const parts = filePath.split(".");
	return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

/**
 * 根据文件扩展名推断语言
 */
export function inferLanguage(filePath: string): string {
	const ext = getFileExtension(filePath);
	const langMap: Record<string, string> = {
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
		yml: "yaml",
		yaml: "yaml",
		toml: "toml",
		xml: "xml",
		md: "markdown",
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
	};
	return langMap[ext] || "text";
}

/**
 * 将 diff 行分组为 hunks（变更段），便于折叠预览
 * @param lines 全部 diff 行
 * @param contextLines 上下文行数（变更行前后保留的 unchanged 行数）
 */
export function groupIntoHunks(
	lines: DiffLine[],
	contextLines = 3,
): DiffHunk[] {
	const hunks: DiffHunk[] = [];
	const changedIndices: number[] = [];

	// 找出所有有变更的行的索引
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].type !== "unchanged") {
			changedIndices.push(i);
		}
	}

	if (changedIndices.length === 0) return [];

	let hunkStart = Math.max(0, changedIndices[0] - contextLines);
	let hunkEnd = Math.min(lines.length - 1, changedIndices[0] + contextLines);

	for (let i = 1; i < changedIndices.length; i++) {
		const nextStart = Math.max(0, changedIndices[i] - contextLines);
		const nextEnd = Math.min(
			lines.length - 1,
			changedIndices[i] + contextLines,
		);

		if (nextStart <= hunkEnd + 1) {
			// 合并相邻的 hunks
			hunkEnd = nextEnd;
		} else {
			// 保存当前 hunk 并开始新的
			const hunkLines = lines.slice(hunkStart, hunkEnd + 1);
			const firstOld =
				hunkLines.find((l) => l.oldLineNumber !== undefined)?.oldLineNumber ||
				1;
			const firstNew =
				hunkLines.find((l) => l.newLineNumber !== undefined)?.newLineNumber ||
				1;
			hunks.push({
				startOld: firstOld,
				startNew: firstNew,
				lines: hunkLines,
			});
			hunkStart = nextStart;
			hunkEnd = nextEnd;
		}
	}

	// 最后一个 hunk
	const hunkLines = lines.slice(hunkStart, hunkEnd + 1);
	const firstOld =
		hunkLines.find((l) => l.oldLineNumber !== undefined)?.oldLineNumber || 1;
	const firstNew =
		hunkLines.find((l) => l.newLineNumber !== undefined)?.newLineNumber || 1;
	hunks.push({
		startOld: firstOld,
		startNew: firstNew,
		lines: hunkLines,
	});

	return hunks;
}

/**
 * 截取 diff 行用于预览（最多显示指定行数的变更）
 */
export function truncateDiffForPreview(
	lines: DiffLine[],
	maxChangedLines = 10,
): {
	lines: DiffLine[];
	truncated: boolean;
	totalChangedLines: number;
} {
	const changedLines = lines.filter((l) => l.type !== "unchanged");
	const totalChangedLines = changedLines.length;

	if (totalChangedLines <= maxChangedLines) {
		return { lines, truncated: false, totalChangedLines };
	}

	// 使用 hunks 来截取，确保上下文完整
	const hunks = groupIntoHunks(lines, 2);
	const truncatedLines: DiffLine[] = [];
	let changedCount = 0;

	for (const hunk of hunks) {
		for (const line of hunk.lines) {
			if (changedCount >= maxChangedLines && line.type !== "unchanged") {
				return { lines: truncatedLines, truncated: true, totalChangedLines };
			}
			truncatedLines.push(line);
			if (line.type !== "unchanged") changedCount++;
		}
	}

	return {
		lines: truncatedLines,
		truncated: changedCount < totalChangedLines,
		totalChangedLines,
	};
}
