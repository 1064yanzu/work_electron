// 文件系统操作工具
// 安全的文件读写能力

import { safeInvoke } from "../../tauriBridge";
import {
	createArtifact,
	type ToolContext,
	type ToolDefinition,
	type ToolResult,
} from "../types";
import { agentStore } from "../store";

function isAbsolutePath(p: string): boolean {
	if (p.startsWith("/")) return true;
	return /^[a-zA-Z]:[\\/]/.test(p);
}

function resolvePathInSandbox(inputPath: string): {
	path: string;
	sandboxDir?: string;
} {
	const sandboxDir = (agentStore.getState().currentTask?.metadata as any)
		?.sandboxDir as string | undefined;
	const raw = String(inputPath || "").trim();
	if (!sandboxDir || raw.length === 0) return { path: raw, sandboxDir };

	if (isAbsolutePath(raw)) {
		if (!raw.startsWith(`${sandboxDir}/`) && raw !== sandboxDir) {
			throw new Error(`路径不在沙盒目录内: ${sandboxDir}`);
		}
		return { path: raw, sandboxDir };
	}

	const relative = raw.replace(/^(\.\/|\.\\|\/|\\)+/, "");
	return { path: `${sandboxDir}/${relative}`, sandboxDir };
}

// 读取文件工具
export const fileReadTool: ToolDefinition = {
	type: "file_read",
	name: "读取文件",
	description: "读取本地文件内容",
	inputSchema: {
		path: {
			type: "string",
			description: "文件路径",
			required: true,
		},
		encoding: {
			type: "string",
			enum: ["utf-8", "base64"],
			description: "编码格式，默认 utf-8",
			default: "utf-8",
		},
	},
	execute: async (
		input: Record<string, any>,
		context: ToolContext,
	): Promise<ToolResult> => {
		const { path, encoding = "utf-8" } = input;

		if (!path) {
			return {
				success: false,
				error: "文件路径不能为空",
			};
		}

		try {
			context.onProgress?.(10, "正在读取文件...");
			const resolved = resolvePathInSandbox(path);

			const result = await safeInvoke<{
				content: string;
				encoding: string;
				size: number;
			}>("read_file_safe", {
				payload: {
					path: resolved.path,
					encoding,
				},
			});

			context.onProgress?.(100, "读取完成");

			const artifact = createArtifact(
				"file",
				`文件: ${resolved.path}`,
				result.content,
				undefined,
			);

			return {
				success: true,
				data: {
					content: result.content,
					encoding: result.encoding,
					size: result.size,
					path: resolved.path,
				},
				artifacts: [artifact],
			};
		} catch (error) {
			console.error("[fileRead] 读取文件失败:", error);

			const message = error instanceof Error ? error.message : String(error);
			const recursive = Boolean((input as any)?.recursive);
			const looksLikeDir =
				/路径不是文件|not a file|is a directory/i.test(message) ||
				/\/$/.test(String(path));

			if (looksLikeDir) {
				try {
					context.onProgress?.(20, "检测到目录路径，尝试列出文件...");
					const resolved = resolvePathInSandbox(path);
					const files = await safeInvoke<
						Array<{
							path: string;
							name: string;
							is_file: boolean;
							is_dir: boolean;
							size?: number;
						}>
					>("list_files_safe", {
						payload: {
							path: resolved.path,
							recursive,
						},
					});

					context.onProgress?.(100, "列出完成");

					const fileList = files
						.map(
							(f) =>
								`${f.is_dir ? "[目录]" : "[文件]"} ${f.name}${f.size ? ` (${f.size} bytes)` : ""}`,
						)
						.join("\n");

					const artifact = createArtifact(
						"text",
						`文件列表: ${resolved.path}`,
						fileList,
						undefined,
					);

					return {
						success: true,
						data: {
							files,
							count: files.length,
							path: resolved.path,
							recursive,
						},
						artifacts: [artifact],
					};
				} catch (e) {
					return {
						success: false,
						error: e instanceof Error ? e.message : "列出文件失败",
					};
				}
			}

			return {
				success: false,
				error: message || "读取文件失败",
			};
		}
	},
};

// 写入文件工具
export const fileWriteTool: ToolDefinition = {
	type: "file_write",
	name: "写入文件",
	description: "写入内容到本地文件",
	inputSchema: {
		path: {
			type: "string",
			description: "文件路径",
			required: true,
		},
		content: {
			type: "string",
			description: "文件内容",
			required: true,
		},
		encoding: {
			type: "string",
			enum: ["utf-8", "base64"],
			description: "编码格式，默认 utf-8",
			default: "utf-8",
		},
		create_dirs: {
			type: "boolean",
			description: "是否创建目录（如果不存在）",
			default: false,
		},
	},
	execute: async (
		input: Record<string, any>,
		context: ToolContext,
	): Promise<ToolResult> => {
		const { path, content, encoding = "utf-8", create_dirs = false } = input;

		if (!path || content === undefined) {
			return {
				success: false,
				error: "文件路径和内容不能为空",
			};
		}

		try {
			context.onProgress?.(10, "正在写入文件...");
			const resolved = resolvePathInSandbox(path);

			await safeInvoke("write_file_safe", {
				payload: {
					path: resolved.path,
					content,
					encoding,
					create_dirs,
				},
			});

			context.onProgress?.(100, "写入完成");

			return {
				success: true,
				data: {
					path: resolved.path,
					size: content.length,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "写入文件失败",
			};
		}
	},
};

// 列出文件工具
export const fileListTool: ToolDefinition = {
	type: "file_list",
	name: "列出文件",
	description: "列出目录中的文件",
	inputSchema: {
		path: {
			type: "string",
			description: "目录路径",
			required: true,
		},
		recursive: {
			type: "boolean",
			description: "是否递归列出子目录",
			default: false,
		},
	},
	execute: async (
		input: Record<string, any>,
		context: ToolContext,
	): Promise<ToolResult> => {
		const { path, recursive = false } = input;

		if (!path) {
			return {
				success: false,
				error: "目录路径不能为空",
			};
		}

		try {
			context.onProgress?.(10, "正在列出文件...");
			const resolved = resolvePathInSandbox(path);

			const files = await safeInvoke<
				Array<{
					path: string;
					name: string;
					is_file: boolean;
					is_dir: boolean;
					size?: number;
				}>
			>("list_files_safe", {
				payload: {
					path: resolved.path,
					recursive,
				},
			});

			context.onProgress?.(100, "列出完成");

			const fileList = files
				.map(
					(f) =>
						`${f.is_dir ? "[目录]" : "[文件]"} ${f.name}${f.size ? ` (${f.size} bytes)` : ""}`,
				)
				.join("\n");

			const artifact = createArtifact(
				"text",
				`文件列表: ${resolved.path}`,
				fileList,
				undefined,
			);

			return {
				success: true,
				data: {
					files,
					count: files.length,
					path: resolved.path,
				},
				artifacts: [artifact],
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "列出文件失败",
			};
		}
	},
};
