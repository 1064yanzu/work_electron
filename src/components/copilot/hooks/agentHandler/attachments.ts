import { getSourceDetail } from "@/lib/api";
import type { workspaceStore } from "@/lib/workspaceStore";

type WorkspaceContexts = ReturnType<typeof workspaceStore.getState>["contexts"];

export interface ResolvedAttachedFile {
	title: string;
	path: string;
	type: "file" | "document";
	mimeType?: string;
	size?: number;
	isBinary?: boolean;
}

export async function resolveAttachmentsFromContexts(
	contexts: WorkspaceContexts,
	debugLog: (...args: unknown[]) => void,
): Promise<{
	attachedContexts: Array<{ title: string; content: string }>;
	attachedFiles: ResolvedAttachedFile[];
}> {
	const attachedContexts: Array<{ title: string; content: string }> = [];
	const attachedFiles: ResolvedAttachedFile[] = [];

	const resolvedContexts = await Promise.all(
		contexts.map(async (ctx) => {
			let content = ctx.content;
			if (!content && ctx.sourceId) {
				try {
					const detail = await getSourceDetail(ctx.sourceId);
					content = detail.note?.content || detail.source.description || "";
					debugLog(
						"[CopilotSidebar] 加载资料内容:",
						ctx.title,
						content.slice(0, 100),
					);
				} catch (err) {
					console.error("[CopilotSidebar] 加载资料内容失败:", err);
				}
			}
			return { ...ctx, content };
		}),
	);
	for (const ctx of resolvedContexts) {
		const content = ctx.content || "";
		const filePath = ctx.filePath;
		const fileSize = ctx.size;
		if (filePath) {
			const isText =
				(typeof ctx.mimeType === "string" &&
					ctx.mimeType.startsWith("text/")) ||
				content.trim().length > 0;
			attachedFiles.push({
				title: ctx.title,
				path: filePath,
				type: ctx.type === "source" ? "document" : "file",
				mimeType: ctx.mimeType,
				size: fileSize,
				isBinary: !isText,
			});
		}

		if (!filePath && content.trim()) {
			attachedContexts.push({ title: ctx.title, content });
		}
	}

	debugLog("[CopilotSidebar] 附件聚合统计:", {
		contextCount: contexts.length,
		attachedFiles: attachedFiles.map((f) => ({
			title: f.title,
			type: f.type,
			path: f.path,
			size: f.size,
		})),
		attachedContextsCount: attachedContexts.length,
	});

	return { attachedContexts, attachedFiles };
}

export function buildAttachedFilesForUI(
	attachedFiles: ResolvedAttachedFile[],
	attachedContexts: Array<{ title: string; content: string }>,
): Array<{
	title: string;
	path: string;
	type: "file" | "document";
	size?: number;
}> {
	return [
		...attachedFiles.map((f) => ({
			title: f.title,
			path: f.path,
			type: f.type,
			size: f.size,
		})),
		// 从 attachedContexts 中提取（这些是小型上下文）
		...attachedContexts
			.filter((c) => !attachedFiles.find((f) => f.title === c.title))
			.map((c) => ({
				title: c.title,
				path: "",
				type: "document" as const,
			})),
	];
}
