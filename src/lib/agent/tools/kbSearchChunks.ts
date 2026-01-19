import { type KbSearchChunksPayload, kbSearchChunks } from "../../api";
import { isTauriUnavailableError } from "../../tauriBridge";
import {
	createArtifact,
	type ToolContext,
	type ToolDefinition,
	type ToolResult,
} from "../types";

export const kbSearchChunksTool: ToolDefinition = {
	type: "kb_search_chunks",
	name: "资料库检索",
	description:
		"优先从本地资料库（NoteChunk）检索相关内容，用于 Agent 上下文补全",
	icon: "BookOpen",
	inputSchema: {
		type: "object",
		properties: {
			query: { type: "string", description: "检索关键词" },
			limit: { type: "number", default: 8 },
			source_id: { type: "string", description: "可选：限定某个 source_id" },
		},
		required: ["query"],
	},
	execute: async (
		input: Record<string, any>,
		context: ToolContext,
	): Promise<ToolResult> => {
		const { query, limit = 8, source_id } = input;

		if (!query) {
			return { success: false, error: "检索关键词不能为空" };
		}

		try {
			context.onProgress?.(10, "正在检索本地资料库...");

			const payload: KbSearchChunksPayload = {
				query,
				limit,
			};
			if (typeof source_id === "string" && source_id.trim().length > 0) {
				payload.source_id = source_id.trim();
			}
			const hits = await kbSearchChunks(payload);

			context.onProgress?.(100, `命中 ${hits.length} 条分块`);

			const artifacts = hits.map((hit) => {
				const title = hit.source_title
					? `${hit.source_title} · #${hit.chunk_index}`
					: `资料库分块 · #${hit.chunk_index}`;

				const artifact = createArtifact("text", title, hit.snippet);
				artifact.metadata = {
					chunkId: hit.chunk_id,
					noteId: hit.note_id,
					sourceId: hit.source_id,
					score: hit.score,
					chunkIndex: hit.chunk_index,
				};
				return artifact;
			});

			return {
				success: true,
				data: {
					query,
					limit,
					source_id,
					hits,
					totalHits: hits.length,
				},
				artifacts,
			};
		} catch (error) {
			if (isTauriUnavailableError(error)) {
				return {
					success: false,
					error: "当前环境不支持 Tauri 调用，无法检索本地资料库",
				};
			}

			const errMsg =
				error instanceof Error
					? error.message
					: typeof error === "string"
						? error
						: (() => {
								try {
									return JSON.stringify(error);
								} catch {
									return String(error);
								}
							})();
			return {
				success: false,
				error: errMsg ? `资料库检索失败: ${errMsg}` : "资料库检索失败",
			};
		}
	},
};
