// 浏览器相关工具

import { invoke } from "../../tauriCompat";
import {
	createArtifact,
	type ToolContext,
	type ToolDefinition,
	type ToolResult,
} from "../types";

// 打开浏览器工具
export const browserOpenTool: ToolDefinition = {
	type: "browser_open",
	name: "打开浏览器",
	description: "在内置浏览器中打开指定 URL",
	icon: "ExternalLink",
	inputSchema: {
		type: "object",
		properties: {
			url: { type: "string", description: "要打开的 URL" },
			newWindow: {
				type: "boolean",
				default: false,
				description: "是否在新窗口打开",
			},
		},
		required: ["url"],
	},
	execute: async (
		input: Record<string, any>,
		_context: ToolContext,
	): Promise<ToolResult> => {
		const { url, newWindow = false } = input;

		if (!url) {
			return { success: false, error: "URL 不能为空" };
		}

		try {
			if (newWindow) {
				// 在新窗口打开
				await invoke("open_browser_window", { url });
			}
			// 非新窗口模式：返回指令，由调用方处理导航

			return {
				success: true,
				data: {
					url,
					newWindow,
					action: newWindow ? "opened_in_new_window" : "navigate_to_url",
				},
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "打开浏览器失败",
			};
		}
	},
};

// 浏览器截图工具（需要后端支持）
export const browserScreenshotTool: ToolDefinition = {
	type: "browser_screenshot",
	name: "浏览器截图",
	description: "对当前浏览器页面进行截图",
	icon: "Camera",
	inputSchema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				description: "要截图的 URL（可选，默认当前页面）",
			},
			fullPage: {
				type: "boolean",
				default: false,
				description: "是否截取整页",
			},
		},
	},
	execute: async (
		input: Record<string, any>,
		context: ToolContext,
	): Promise<ToolResult> => {
		const { url, fullPage = false } = input;

		try {
			context.onProgress?.(20, "正在准备截图...");

			// 调用后端截图命令（需要实现）
			// const screenshot = await invoke('browser_screenshot', { url, fullPage });

			// 暂时返回模拟结果
			context.onProgress?.(100, "截图完成");

			const artifact = createArtifact(
				"image",
				`截图 - ${url || "当前页面"}`,
				undefined,
				undefined,
			);
			artifact.mimeType = "image/png";

			return {
				success: true,
				data: {
					message: "截图功能开发中",
					url,
					fullPage,
				},
				artifacts: [artifact],
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "截图失败",
			};
		}
	},
};
