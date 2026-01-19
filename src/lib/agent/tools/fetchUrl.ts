// 抓取网页内容工具

import { fetchUrlContent, getSourceDetail } from "../../api";
import { fetchPageContent } from "../../config";
import { workspaceStore } from "../../workspaceStore";
import {
	createArtifact,
	type ToolContext,
	type ToolDefinition,
	type ToolResult,
} from "../types";

export const fetchUrlTool: ToolDefinition = {
	type: "fetch_url",
	name: "抓取网页",
	description: "获取指定 URL 的网页内容",
	icon: "Globe",
	inputSchema: {
		type: "object",
		properties: {
			url: { type: "string", description: "要抓取的网页 URL" },
			title: { type: "string", description: "标题（可选）" },
			saveToLibrary: {
				type: "boolean",
				default: true,
				description: "是否保存到资料库",
			},
			maxChars: {
				type: "number",
				default: 12000,
				description: "最多返回的正文字符数（避免上下文过大）",
			},
		},
		required: ["url"],
	},
	execute: async (
		input: Record<string, any>,
		context: ToolContext,
	): Promise<ToolResult> => {
		const { url, title, saveToLibrary = true, maxChars = 12000 } = input;

		if (!url) {
			return { success: false, error: "URL 不能为空" };
		}

		try {
			context.onProgress?.(20, "正在抓取网页...");

			let sourceId: string | undefined;
			let resolvedTitle = title || "";
			let resolvedUrl = url;
			let contentText = "";

			if (saveToLibrary) {
				const project_id =
					workspaceStore.getState().currentProjectId || undefined;
				const currentFolderId = workspaceStore.getState().currentFolderId;
				const folder_id =
					currentFolderId && currentFolderId !== "__unassigned__"
						? currentFolderId
						: undefined;
				const source = await fetchUrlContent({
					url,
					title: title || undefined,
					tags: ["agent-fetched"],
					project_id,
					folder_id,
				});
				sourceId = source.id;
				resolvedTitle = source.title;
				resolvedUrl = source.url || url;

				const detail = await getSourceDetail(source.id);
				contentText = detail?.note?.content || "";
			} else {
				const page = await fetchPageContent(url);
				resolvedTitle = page.title || title || url;
				resolvedUrl = page.url || url;
				contentText = page.content || "";

				// 如果拿到了 HTML 且仍希望落库，可以由调用方改用 saveToLibrary=true
				// 这里保持行为清晰：saveToLibrary=false 不写库。
			}

			const trimmed =
				typeof maxChars === "number" && maxChars > 0
					? contentText.slice(0, maxChars)
					: contentText;
			const wasTrimmed =
				trimmed.length > 0 && trimmed.length < contentText.length;

			context.onProgress?.(100, "抓取完成");

			const artifacts = [
				createArtifact(
					"url",
					resolvedTitle || resolvedUrl,
					undefined,
					resolvedUrl,
				),
				createArtifact(
					"text",
					resolvedTitle || resolvedUrl,
					trimmed +
						(wasTrimmed
							? `\n\n[已截断，原始长度 ${contentText.length} 字符]`
							: ""),
					resolvedUrl,
				),
			];
			artifacts[0].metadata = { sourceId, savedToLibrary: saveToLibrary };
			artifacts[1].metadata = {
				sourceId,
				savedToLibrary: saveToLibrary,
				wasTrimmed,
				fullLength: contentText.length,
			};

			return {
				success: true,
				data: {
					sourceId,
					title: resolvedTitle || resolvedUrl,
					url: resolvedUrl,
					content: trimmed,
					wasTrimmed,
					fullLength: contentText.length,
					savedToLibrary: saveToLibrary,
				},
				artifacts,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "抓取失败",
			};
		}
	},
};
