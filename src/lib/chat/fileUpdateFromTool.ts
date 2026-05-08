import type { FileUpdate } from "./types";

type FileUpdateStatus = NonNullable<FileUpdate["status"]>;

const WRITE_TOOL_NAMES = new Set([
	"write",
	"edit",
	"multiedit",
	"notebookedit",
]);

function normalizeToolName(name: string | undefined): string {
	return String(name || "")
		.trim()
		.toLowerCase();
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function countLines(value: unknown): number {
	const text = asString(value);
	if (!text) return 0;
	return text.endsWith("\n")
		? text.split("\n").length - 1
		: text.split("\n").length;
}

function basename(filePath: string): string {
	const clean = filePath.split("#")[0].split("?")[0];
	return clean.split(/[/\\]/).filter(Boolean).pop() || filePath;
}

function stripTrailingSlash(value: string): string {
	return value.replace(/[\\/]+$/, "");
}

function formatDisplayPath(filePath: string, baseDir?: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	const base = baseDir ? stripTrailingSlash(baseDir).replace(/\\/g, "/") : "";
	if (base && normalized.startsWith(`${base}/`)) {
		const rel = normalized.slice(base.length + 1);
		return rel || basename(normalized);
	}
	return basename(normalized);
}

function getToolFilePath(
	input: Record<string, unknown>,
	toolName: string,
): string {
	const directPath =
		asString(input.file_path) ||
		asString(input.path) ||
		asString(input.file) ||
		asString(input.notebook_path);
	if (directPath) return directPath.trim();

	if (toolName === "bash") {
		return "";
	}

	return "";
}

function getEditStats(input: Record<string, unknown>): {
	additions: number;
	deletions: number;
} {
	const edits = Array.isArray(input.edits) ? input.edits : null;
	if (edits) {
		return edits.reduce(
			(acc, edit) => {
				if (!edit || typeof edit !== "object") return acc;
				const record = edit as Record<string, unknown>;
				return {
					additions: acc.additions + countLines(record.new_string),
					deletions: acc.deletions + countLines(record.old_string),
				};
			},
			{ additions: 0, deletions: 0 },
		);
	}

	return {
		additions: countLines(input.new_string ?? input.new_source),
		deletions: countLines(input.old_string),
	};
}

export function buildFileUpdateFromToolInput(input: {
	toolName?: string;
	toolCallId?: string;
	toolInput?: Record<string, unknown> | null;
	status?: FileUpdateStatus;
	baseDir?: string;
}): FileUpdate | null {
	const toolName = normalizeToolName(input.toolName);
	if (!toolName || (!WRITE_TOOL_NAMES.has(toolName) && toolName !== "bash")) {
		return null;
	}

	const toolInput = input.toolInput || {};
	const filePath = getToolFilePath(toolInput, toolName);
	if (!filePath) return null;

	const isWrite = toolName === "write";
	const stats = isWrite
		? { additions: countLines(toolInput.content), deletions: 0 }
		: getEditStats(toolInput);

	return {
		fileName: formatDisplayPath(filePath, input.baseDir),
		filePath,
		type: isWrite ? "create" : "update",
		additions: stats.additions,
		deletions: stats.deletions,
		status: input.status || "running",
		toolCallId: input.toolCallId,
	};
}
