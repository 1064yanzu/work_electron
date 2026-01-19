import { EVENTS, events } from "../../events";
import { workspaceStore } from "../../workspaceStore";
import type { ToolContext, ToolDefinition, ToolResult } from "../types";

function normalizeText(s: unknown): string {
	return typeof s === "string" ? s : "";
}

function extractTitleAndContent(content: string): {
	title: string;
	content: string;
} {
	const trimmed = content.trim();
	const lines = trimmed.split("\n");
	const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
	const first = firstNonEmptyIdx >= 0 ? lines[firstNonEmptyIdx].trim() : "";
	const headingMatch = first.match(/^(#{1,6})\s+(.+)$/);
	if (headingMatch && headingMatch[2]) {
		const title = headingMatch[2].trim().slice(0, 80) || "新文档";
		const body =
			lines
				.slice(firstNonEmptyIdx + 1)
				.join("\n")
				.trim() || trimmed;
		return { title, content: body };
	}
	return { title: (first || "新文档").slice(0, 80), content: trimmed };
}

function extractSummary(content: string): string {
	const cleaned = content
		.replace(/^#{1,6}\s+.*$/gm, "")
		.replace(/\s+/g, " ")
		.trim();
	if (!cleaned) return "";
	const m = cleaned.match(/^(.{30,160}?)([。！？.!?]|$)/);
	return (m?.[1] || cleaned.slice(0, 120)).trim();
}

export const docCreateTool: ToolDefinition = {
	type: "doc_create",
	name: "创建文档",
	description: "在编辑器中创建一个新文档（等价于输出 :::create-doc 协议）",
	icon: "FilePlus",
	inputSchema: {
		type: "object",
		properties: {
			title: { type: "string", description: "文档标题（可选）" },
			summary: { type: "string", description: "摘要（可选）" },
			content: { type: "string", description: "文档正文（Markdown）" },
		},
		required: ["content"],
	},
	execute: async (
		input: Record<string, any>,
		_context: ToolContext,
	): Promise<ToolResult> => {
		const rawContent = normalizeText(input?.content);
		if (!rawContent.trim())
			return { success: false, error: "content 不能为空" };

		const inferred = extractTitleAndContent(rawContent);
		const title =
			normalizeText(input?.title).trim() || inferred.title || "新文档";
		const content = inferred.content.trim()
			? rawContent.trim()
			: rawContent.trim();
		const summary =
			normalizeText(input?.summary).trim() || extractSummary(rawContent);

		events.emit(EVENTS.AI_DOC_CREATE_END, {
			title,
			summary,
			content,
			prompt: title,
		});

		return {
			success: true,
			data: { title, summary, contentLength: content.length },
		};
	},
};

export const docUpdateTool: ToolDefinition = {
	type: "doc_update",
	name: "更新文档",
	description: "在编辑器中更新当前文档（等价于输出 :::update-doc 协议）",
	icon: "FileEdit",
	inputSchema: {
		type: "object",
		properties: {
			content: { type: "string", description: "新的完整文档内容（Markdown）" },
		},
		required: ["content"],
	},
	execute: async (
		input: Record<string, any>,
		_context: ToolContext,
	): Promise<ToolResult> => {
		const suggestedContent = normalizeText(input?.content).trim();
		if (!suggestedContent) return { success: false, error: "content 不能为空" };

		const originalContent = workspaceStore.getActiveDocContent() || "";
		events.emit(EVENTS.AI_DOC_UPDATE_END, {
			originalContent,
			suggestedContent,
			prompt: "doc_update",
		});

		return {
			success: true,
			data: { contentLength: suggestedContent.length },
		};
	},
};

type PatchOp =
	| {
			op: "replace";
			target: string; // 要被替换的原文片段（必须精确匹配）
			replacement: string; // 替换成的新片段
			occurrence?: number; // 第几次出现（从 1 开始）。不填则要求唯一匹配
	  }
	| {
			op: "replace_all";
			target: string; // 要被替换的原文片段（必须精确匹配）
			replacement: string;
			maxReplacements?: number; // 安全阈值，防止误替换过多
	  }
	| {
			op: "append";
			content: string; // 追加到文档末尾
			ensureNewline?: boolean; // 默认 true：若末尾无换行则先补换行
	  }
	| {
			op: "replace_lines";
			startLine: number; // 1-based
			endLine: number; // 1-based, inclusive
			replacement: string; // 替换成的新文本（可包含多行）
			expectedSha1?: string; // 可选：对被替换行文本做 sha1 校验，防止行号漂移误改
	  }
	| {
			op: "apply_unified_diff";
			diff: string; // unified diff (git diff / unified diff hunks)
			maxOffset?: number; // 每个 hunk 允许的行偏移搜索范围（默认 200）
			requireExact?: boolean; // 是否要求上下文完全匹配（默认 true）
	  }
	| {
			op: "delete";
			target: string; // 要删除的原文片段（必须精确匹配）
			occurrence?: number;
	  }
	| {
			op: "insert_before";
			anchor: string; // 在该锚点之前插入
			content: string;
			occurrence?: number;
	  }
	| {
			op: "insert_after";
			anchor: string; // 在该锚点之后插入
			content: string;
			occurrence?: number;
	  };

function findOccurrenceIndex(
	haystack: string,
	needle: string,
	occurrence: number,
): number {
	if (!needle) return -1;
	let from = 0;
	let count = 0;
	while (true) {
		const idx = haystack.indexOf(needle, from);
		if (idx === -1) return -1;
		count += 1;
		if (count === occurrence) return idx;
		from = idx + needle.length;
	}
}

function countOccurrences(haystack: string, needle: string): number {
	if (!needle) return 0;
	let from = 0;
	let count = 0;
	while (true) {
		const idx = haystack.indexOf(needle, from);
		if (idx === -1) return count;
		count += 1;
		from = idx + needle.length;
	}
}

async function sha1Hex(text: string): Promise<string> {
	// Web Crypto 在现代浏览器/tauri webview 可用
	const enc = new TextEncoder();
	const data = enc.encode(text);
	const digest = await crypto.subtle.digest("SHA-1", data);
	const bytes = Array.from(new Uint8Array(digest));
	return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

type UnifiedHunkLine =
	| { kind: "context"; text: string }
	| { kind: "remove"; text: string }
	| { kind: "add"; text: string };

type UnifiedHunk = {
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
	lines: UnifiedHunkLine[];
};

function parseUnifiedDiff(diff: string): UnifiedHunk[] {
	const hunks: UnifiedHunk[] = [];
	const lines = diff.replace(/\r\n/g, "\n").split("\n");
	let i = 0;
	const headerRe = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

	while (i < lines.length) {
		const line = lines[i];
		const m = line.match(headerRe);
		if (!m) {
			i++;
			continue;
		}

		const oldStart = Number(m[1]);
		const oldCount = m[2] ? Number(m[2]) : 1;
		const newStart = Number(m[3]);
		const newCount = m[4] ? Number(m[4]) : 1;
		i++;

		const hunkLines: UnifiedHunkLine[] = [];
		while (i < lines.length) {
			const l = lines[i];
			if (l.startsWith("@@")) break;
			if (l.startsWith("+++") || l.startsWith("---")) {
				i++;
				continue;
			}
			if (l.startsWith("\\ No newline at end of file")) {
				i++;
				continue;
			}
			const prefix = l.slice(0, 1);
			const text = l.slice(1);
			if (prefix === " ") hunkLines.push({ kind: "context", text });
			else if (prefix === "-") hunkLines.push({ kind: "remove", text });
			else if (prefix === "+") hunkLines.push({ kind: "add", text });
			else {
				// 非标准行，视为上下文（尽量容错）
				hunkLines.push({ kind: "context", text: l });
			}
			i++;
		}

		hunks.push({ oldStart, oldCount, newStart, newCount, lines: hunkLines });
	}

	return hunks;
}

function sliceMatchesAt(
	docLines: string[],
	startIdx: number,
	hunk: UnifiedHunk,
	requireExact: boolean,
): boolean {
	let cursor = startIdx;
	for (const l of hunk.lines) {
		if (l.kind === "add") continue;
		if (cursor >= docLines.length) return false;
		if (requireExact) {
			if (docLines[cursor] !== l.text) return false;
		} else {
			if (docLines[cursor].trimEnd() !== l.text.trimEnd()) return false;
		}
		cursor++;
	}
	return true;
}

function applyHunkAt(
	docLines: string[],
	startIdx: number,
	hunk: UnifiedHunk,
): { lines: string[]; endIdx: number } {
	const before = docLines.slice(0, startIdx);
	const afterStart = startIdx;
	const oldSegment: string[] = [];
	const newSegment: string[] = [];

	for (const l of hunk.lines) {
		if (l.kind === "context") {
			oldSegment.push(l.text);
			newSegment.push(l.text);
		} else if (l.kind === "remove") {
			oldSegment.push(l.text);
		} else {
			newSegment.push(l.text);
		}
	}

	const after = docLines.slice(afterStart + oldSegment.length);
	const out = [...before, ...newSegment, ...after];
	return { lines: out, endIdx: before.length + newSegment.length };
}

function applyUnifiedDiffToText(
	original: string,
	diff: string,
	options: { maxOffset: number; requireExact: boolean },
): { updated: string; appliedHunks: number } {
	const hunks = parseUnifiedDiff(diff);
	if (!hunks.length) throw new Error("unified diff 中未找到任何 @@ hunk");

	let docLines = original.split("\n");
	let applied = 0;

	for (const hunk of hunks) {
		const expectedIdx = Math.max(0, (hunk.oldStart || 1) - 1);
		const maxOffset = options.maxOffset;
		const requireExact = options.requireExact;

		let foundIdx: number | null = null;
		if (sliceMatchesAt(docLines, expectedIdx, hunk, requireExact)) {
			foundIdx = expectedIdx;
		} else {
			for (let offset = 1; offset <= maxOffset; offset++) {
				const up = expectedIdx - offset;
				const down = expectedIdx + offset;
				if (up >= 0 && sliceMatchesAt(docLines, up, hunk, requireExact)) {
					foundIdx = up;
					break;
				}
				if (
					down < docLines.length &&
					sliceMatchesAt(docLines, down, hunk, requireExact)
				) {
					foundIdx = down;
					break;
				}
			}
		}

		if (foundIdx == null) {
			throw new Error(
				"unified diff hunk 无法应用（上下文未匹配，请输出更完整的 diff 上下文或回退 doc_update）",
			);
		}

		docLines = applyHunkAt(docLines, foundIdx, hunk).lines;
		applied += 1;
	}

	return { updated: docLines.join("\n"), appliedHunks: applied };
}

function applyPatch(
	original: string,
	edits: PatchOp[],
	requireUnique: boolean,
): { updated: string; applied: number } {
	let text = original;
	let applied = 0;

	for (const edit of edits) {
		if (edit.op === "append") {
			const insert = normalizeText(edit.content);
			if (!insert.trim()) throw new Error("append.content 不能为空");
			const ensureNewline = edit.ensureNewline !== false;
			if (ensureNewline && text.length > 0 && !text.endsWith("\n")) {
				text += "\n";
			}
			text += insert;
			applied += 1;
			continue;
		}

		if (edit.op === "replace_all") {
			const target = normalizeText(edit.target);
			const replacement = normalizeText(edit.replacement);
			if (!target) throw new Error("replace_all.target 不能为空");
			if (target === replacement)
				throw new Error("replace_all.target 与 replacement 相同，无需替换");
			const count = countOccurrences(text, target);
			if (count === 0) throw new Error("replace_all.target 未找到");
			const max =
				typeof edit.maxReplacements === "number" && edit.maxReplacements > 0
					? edit.maxReplacements
					: 200;
			if (count > max) {
				throw new Error(
					`replace_all 匹配次数过多(${count})，超过阈值(${max})，请收窄 target 或提高 maxReplacements`,
				);
			}
			text = text.split(target).join(replacement);
			applied += 1;
			continue;
		}

		if (edit.op === "replace_lines") {
			const startLine = Number(edit.startLine);
			const endLine = Number(edit.endLine);
			const replacement = normalizeText(edit.replacement);
			if (!Number.isFinite(startLine) || startLine < 1)
				throw new Error("replace_lines.startLine 必须是 >= 1 的数字");
			if (!Number.isFinite(endLine) || endLine < startLine)
				throw new Error("replace_lines.endLine 必须是 >= startLine 的数字");

			const lines = text.split("\n");
			const startIdx = startLine - 1;
			const endIdx = Math.min(lines.length - 1, endLine - 1);
			if (startIdx >= lines.length)
				throw new Error("replace_lines.startLine 超出文档行数");

			if (edit.expectedSha1 && typeof edit.expectedSha1 === "string") {
				// 注意：applyPatch 目前是同步函数，这里只能做弱校验：要求 caller 传入 expectedSha1 时也传入原文片段作为 target 去走 replace/insert
				// 为了保持稳定，expectedSha1 在执行阶段单独校验（见 execute 部分）。
			}

			const replacementLines = replacement.split("\n");
			lines.splice(startIdx, endIdx - startIdx + 1, ...replacementLines);
			text = lines.join("\n");
			applied += 1;
			continue;
		}

		if (edit.op === "apply_unified_diff") {
			const diff = normalizeText(edit.diff);
			if (!diff.trim()) throw new Error("apply_unified_diff.diff 不能为空");
			const maxOffset =
				typeof edit.maxOffset === "number" && edit.maxOffset >= 0
					? Math.floor(edit.maxOffset)
					: 200;
			const requireExact = edit.requireExact !== false;
			const res = applyUnifiedDiffToText(text, diff, {
				maxOffset,
				requireExact,
			});
			text = res.updated;
			applied += res.appliedHunks;
			continue;
		}

		if (edit.op === "replace") {
			const target = normalizeText(edit.target);
			const replacement = normalizeText(edit.replacement);
			const occ =
				typeof edit.occurrence === "number" && edit.occurrence > 0
					? edit.occurrence
					: undefined;
			if (!target) throw new Error("replace.target 不能为空");
			if (occ == null && requireUnique) {
				const c = countOccurrences(text, target);
				if (c === 0) throw new Error("replace.target 未找到");
				if (c > 1)
					throw new Error(
						"replace.target 匹配不唯一，请指定 occurrence 或提供更长的 target",
					);
			}
			const idx = findOccurrenceIndex(text, target, occ ?? 1);
			if (idx === -1) throw new Error("replace.target 未找到");
			text = text.slice(0, idx) + replacement + text.slice(idx + target.length);
			applied += 1;
			continue;
		}

		if (edit.op === "delete") {
			const target = normalizeText(edit.target);
			const occ =
				typeof edit.occurrence === "number" && edit.occurrence > 0
					? edit.occurrence
					: undefined;
			if (!target) throw new Error("delete.target 不能为空");
			if (occ == null && requireUnique) {
				const c = countOccurrences(text, target);
				if (c === 0) throw new Error("delete.target 未找到");
				if (c > 1)
					throw new Error(
						"delete.target 匹配不唯一，请指定 occurrence 或提供更长的 target",
					);
			}
			const idx = findOccurrenceIndex(text, target, occ ?? 1);
			if (idx === -1) throw new Error("delete.target 未找到");
			text = text.slice(0, idx) + text.slice(idx + target.length);
			applied += 1;
			continue;
		}

		if (edit.op === "insert_before" || edit.op === "insert_after") {
			const anchor = normalizeText(edit.anchor);
			const insert = normalizeText(edit.content);
			const occ =
				typeof edit.occurrence === "number" && edit.occurrence > 0
					? edit.occurrence
					: undefined;
			if (!anchor) throw new Error("insert.anchor 不能为空");
			if (occ == null && requireUnique) {
				const c = countOccurrences(text, anchor);
				if (c === 0) throw new Error("insert.anchor 未找到");
				if (c > 1)
					throw new Error(
						"insert.anchor 匹配不唯一，请指定 occurrence 或提供更长的 anchor",
					);
			}
			const idx = findOccurrenceIndex(text, anchor, occ ?? 1);
			if (idx === -1) throw new Error("insert.anchor 未找到");
			const insertAt = edit.op === "insert_before" ? idx : idx + anchor.length;
			text = text.slice(0, insertAt) + insert + text.slice(insertAt);
			applied += 1;
			continue;
		}

		// exhaustive
		// @ts-expect-error unreachable
		throw new Error(`未知补丁操作: ${String(edit.op)}`);
	}

	return { updated: text, applied };
}

export const docPatchTool: ToolDefinition = {
	type: "doc_patch",
	name: "小改动补丁",
	description:
		"对当前文档做小范围精确修改（基于锚点的 replace/insert/delete），失败会返回错误以便回退到 doc_update",
	icon: "Wand2",
	inputSchema: {
		type: "object",
		properties: {
			requireUnique: {
				type: "boolean",
				default: true,
				description: "未指定 occurrence 时是否要求唯一匹配（推荐 true）",
			},
			edits: {
				type: "array",
				description: "补丁操作列表，按顺序应用",
				items: {
					type: "object",
					properties: {
						op: {
							type: "string",
							enum: [
								"replace",
								"replace_all",
								"append",
								"replace_lines",
								"apply_unified_diff",
								"delete",
								"insert_before",
								"insert_after",
							],
						},
						target: { type: "string" },
						replacement: { type: "string" },
						maxReplacements: { type: "number" },
						startLine: { type: "number" },
						endLine: { type: "number" },
						expectedSha1: { type: "string" },
						ensureNewline: { type: "boolean" },
						diff: { type: "string" },
						maxOffset: { type: "number" },
						requireExact: { type: "boolean" },
						anchor: { type: "string" },
						content: { type: "string" },
						occurrence: { type: "number" },
					},
					required: ["op"],
				},
			},
		},
		required: ["edits"],
	},
	execute: async (
		input: Record<string, any>,
		_context: ToolContext,
	): Promise<ToolResult> => {
		const edits = Array.isArray(input?.edits) ? (input.edits as PatchOp[]) : [];
		if (!edits.length) return { success: false, error: "edits 不能为空" };

		const requireUnique = input?.requireUnique !== false;
		const originalContent = workspaceStore.getActiveDocContent() || "";

		try {
			// 对 replace_lines.expectedSha1 做强校验（防止行号漂移）
			for (const edit of edits) {
				if (edit.op !== "replace_lines") continue;
				if (!edit.expectedSha1) continue;
				if (typeof crypto === "undefined" || !crypto.subtle) {
					return {
						success: false,
						error:
							"当前环境不支持 expectedSha1 校验（crypto.subtle 不可用），请移除 expectedSha1 或改用其他操作",
					};
				}
				const lines = originalContent.split("\n");
				const startIdx = Number(edit.startLine) - 1;
				const endIdx = Math.min(lines.length - 1, Number(edit.endLine) - 1);
				if (
					!Number.isFinite(startIdx) ||
					startIdx < 0 ||
					startIdx >= lines.length
				)
					return {
						success: false,
						error: "replace_lines.startLine 超出文档行数",
					};
				if (!Number.isFinite(endIdx) || endIdx < startIdx)
					return { success: false, error: "replace_lines.endLine 非法" };
				const slice = lines.slice(startIdx, endIdx + 1).join("\n");
				const got = await sha1Hex(slice);
				if (got !== edit.expectedSha1) {
					return {
						success: false,
						error: `replace_lines.expectedSha1 校验失败（可能文档已变化/行号漂移）。got=${got}`,
					};
				}
			}

			const { updated, applied } = applyPatch(
				originalContent,
				edits,
				requireUnique,
			);
			if (updated === originalContent)
				return {
					success: false,
					error: "补丁未产生任何变化（可能 target/anchor 不正确）",
				};

			events.emit(EVENTS.AI_DOC_UPDATE_END, {
				originalContent,
				suggestedContent: updated,
				prompt: "doc_patch",
			});

			return {
				success: true,
				data: { appliedEdits: applied, contentLength: updated.length },
			};
		} catch (e) {
			return {
				success: false,
				error: e instanceof Error ? e.message : "补丁应用失败",
			};
		}
	},
};
