import fsp from "node:fs/promises";
import path from "node:path";
import type { Logger } from "../../logging/types";
import type { RemoteInboundContextFile } from "./types";

const REMOTE_CONTEXT_ROOT = "__remote_inputs";

export type PersistedInboundContextFile = {
	source: string;
	title: string;
	absolutePath: string;
	relativePath: string;
};

function sanitizeFileNameSegment(raw: string): string {
	return String(raw || "")
		.normalize("NFKC")
		.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
		.replace(/\s+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 80);
}

function normalizeFileName(raw: string, fallback: string): string {
	const input = String(raw || "").trim();
	const extRaw = path.extname(input);
	const ext = extRaw ? extRaw.slice(0, 10) : ".md";
	const baseRaw = extRaw ? input.slice(0, -extRaw.length) : input;
	const base =
		sanitizeFileNameSegment(baseRaw) ||
		sanitizeFileNameSegment(fallback) ||
		"doc";
	return `${base}${ext.startsWith(".") ? ext : `.${ext}`}`;
}

function renderContextFile(file: RemoteInboundContextFile): string {
	const lines: string[] = [];
	lines.push(`# ${file.title || "远程上下文文档"}`);
	lines.push("");
	lines.push(`来源: ${file.source}`);
	if (file.metadata) {
		for (const [key, value] of Object.entries(file.metadata)) {
			lines.push(`${key}: ${value}`);
		}
	}
	lines.push("");
	lines.push(file.content || "");
	lines.push("");
	return lines.join("\n");
}

function uniqueFileName(fileName: string, used: Set<string>): string {
	if (!used.has(fileName)) {
		used.add(fileName);
		return fileName;
	}
	const ext = path.extname(fileName);
	const base = ext ? fileName.slice(0, -ext.length) : fileName;
	let idx = 2;
	while (idx < 1_000) {
		const next = `${base}_${idx}${ext}`;
		if (!used.has(next)) {
			used.add(next);
			return next;
		}
		idx += 1;
	}
	const fallback = `${base}_${Date.now()}${ext}`;
	used.add(fallback);
	return fallback;
}

export async function persistInboundContextFiles(params: {
	logger: Logger;
	sandboxDir: string;
	files: RemoteInboundContextFile[];
}): Promise<PersistedInboundContextFile[]> {
	const files = params.files || [];
	if (files.length === 0) return [];

	const rootDir = path.join(params.sandboxDir, REMOTE_CONTEXT_ROOT);
	await fsp.mkdir(rootDir, { recursive: true });
	const used = new Set<string>();
	const persisted: PersistedInboundContextFile[] = [];

	for (let i = 0; i < files.length; i += 1) {
		const item = files[i];
		try {
			const sourceDirName =
				sanitizeFileNameSegment(item.source || "remote") || "remote";
			const sourceDir = path.join(rootDir, sourceDirName);
			await fsp.mkdir(sourceDir, { recursive: true });
			const desiredName = normalizeFileName(
				item.suggested_name,
				`${sourceDirName}_${i + 1}`,
			);
			const fileName = uniqueFileName(`${sourceDirName}/${desiredName}`, used);
			const absolutePath = path.join(rootDir, fileName);
			await fsp.writeFile(absolutePath, renderContextFile(item), "utf-8");
			persisted.push({
				source: item.source,
				title: item.title,
				absolutePath,
				relativePath: path.relative(params.sandboxDir, absolutePath),
			});
		} catch (error) {
			params.logger.warn({
				msg: "persist inbound context file failed",
				source: item.source,
				title: item.title,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return persisted;
}

export function buildContextFilesPrompt(
	files: PersistedInboundContextFile[],
): string {
	if (files.length === 0) return "";
	const lines: string[] = [
		"[系统上下文：已同步远程文档到本地沙盒]",
		"请优先使用 Read 工具读取以下本地文件：",
	];
	for (const file of files) {
		lines.push(`- ${file.relativePath}`);
	}
	lines.push("约束：不要再调用 WebFetch/WebSearch 访问对应的远程文档链接。");
	return lines.join("\n");
}
