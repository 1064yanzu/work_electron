// 代码执行工具
// 支持 Python 和 JavaScript 代码执行

import { safeInvoke } from "../../tauriBridge";
import {
	createArtifact,
	type ToolContext,
	type ToolDefinition,
	type ToolResult,
} from "../types";

export const codeExecuteTool: ToolDefinition = {
	type: "code_execute",
	name: "执行代码",
	description: "在沙箱中执行 Python 或 JavaScript 代码",
	inputSchema: {
		language: {
			type: "string",
			enum: ["python", "javascript"],
			description: "编程语言",
			required: true,
		},
		code: {
			type: "string",
			description: "要执行的代码",
			required: true,
		},
		timeout: {
			type: "number",
			description: "超时时间（秒），默认 30",
			default: 30,
		},
		files: {
			type: "array",
			description:
				"（可选）预置到沙盒目录中的文件列表（path 为相对路径，content_base64 为内容的 base64）",
			items: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "相对路径，如 input.txt / data/input.json",
					},
					content_base64: {
						type: "string",
						description: "文件内容的 base64（支持二进制）",
					},
				},
			},
		},
	},
	execute: async (
		input: Record<string, any>,
		context: ToolContext,
	): Promise<ToolResult> => {
		const { language, code, timeout, files } = input;

		if (!language || !code) {
			return {
				success: false,
				error: "语言和代码不能为空",
			};
		}

		if (!["python", "javascript", "js"].includes(language)) {
			return {
				success: false,
				error: `不支持的语言: ${language}`,
			};
		}

		try {
			context.onProgress?.(10, "准备执行代码...");

			let result: {
				success: boolean;
				output: string;
				error?: string;
				duration_ms: number;
				image_paths?: string[];
				sandbox_dir?: string;
				script_path?: string;
			};

			try {
				result = await safeInvoke<{
					success: boolean;
					output: string;
					error?: string;
					duration_ms: number;
					image_paths?: string[];
					sandbox_dir?: string;
					script_path?: string;
				}>("execute_code", {
					payload: {
						language: language === "js" ? "javascript" : language,
						code,
						timeout: timeout || 30,
						files: Array.isArray(files) ? files : [],
					},
				});
			} catch (invokeError) {
				console.error("[codeExecute] Tauri invoke 失败:", invokeError);
				throw invokeError; // 重新抛出，让外层 catch 处理
			}

			context.onProgress?.(100, "执行完成");

			if (result && result.success) {
				const artifacts = [
					createArtifact(
						"code",
						`代码执行结果 (${language})`,
						result.output,
						undefined,
					),
				];

				if (result.sandbox_dir || result.script_path) {
					const lines = [
						result.sandbox_dir ? `sandbox: ${result.sandbox_dir}` : "",
						result.script_path ? `script: ${result.script_path}` : "",
					].filter(Boolean);
					artifacts.push(
						createArtifact("text", "执行沙盒信息", lines.join("\n"), undefined),
					);
				}

				// 如果有图片路径，创建图片artifact
				if (result.image_paths && result.image_paths.length > 0) {
					for (const imagePath of result.image_paths) {
						artifacts.push(
							createArtifact(
								"image",
								`生成的图片: ${imagePath.split("/").pop() || "image"}`,
								imagePath,
								imagePath,
							),
						);
					}
				}

				return {
					success: true,
					data: {
						output: result.output,
						duration_ms: result.duration_ms,
						language,
						image_paths: result.image_paths,
						sandbox_dir: result.sandbox_dir,
						script_path: result.script_path,
					},
					artifacts,
				};
			} else {
				const errorMsg = result?.error || "代码执行失败";
				console.error("[codeExecute] 执行失败:", errorMsg, result);
				return {
					success: false,
					error: errorMsg,
					data: {
						output: result?.output || "",
						duration_ms: result?.duration_ms || 0,
					},
				};
			}
		} catch (error) {
			console.error("[codeExecute] 调用失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: `代码执行失败: ${errorMsg}`,
			};
		}
	},
};
