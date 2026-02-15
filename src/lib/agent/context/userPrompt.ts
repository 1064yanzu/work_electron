type ConversationContextLine = string;

type AttachedFile = {
	title: string;
	path: string;
	type?: "file" | "document";
};

type AttachedContext = {
	title: string;
	content: string;
};

export function buildRuntimeUserPrompt(input: {
	query: string;
	resumeSessionId?: string;
	conversationContext?: ConversationContextLine[];
	attachedFiles?: AttachedFile[];
	attachedContexts?: AttachedContext[];
	contextBudget?: {
		maxContextChars?: number;
		maxContextLines?: number;
		maxFiles?: number;
	};
}): string {
	let enhancedUserPrompt = input.query;
	const maxContextLines = Math.max(
		1,
		Math.floor(Number(input.contextBudget?.maxContextLines ?? 16)),
	);
	const maxContextChars = Math.max(
		500,
		Math.floor(Number(input.contextBudget?.maxContextChars ?? 4000)),
	);
	const maxFiles = Math.max(
		1,
		Math.floor(Number(input.contextBudget?.maxFiles ?? 12)),
	);

	// Inject conversation context only for fresh turns (non-resume).
	if (!input.resumeSessionId && input.conversationContext?.length) {
		const lines = input.conversationContext
			.map((line) => String(line || "").trim())
			.filter(Boolean);
		const tail =
			lines.length > maxContextLines ? lines.slice(-maxContextLines) : lines;
		let joined = tail.join("\n");
		if (joined.length > maxContextChars)
			joined = joined.slice(-maxContextChars);
		if (joined) {
			enhancedUserPrompt = `【对话历史（节选）】\n${joined}\n\n${enhancedUserPrompt}`;
		}
	}

	if (input.attachedFiles?.length || input.attachedContexts?.length) {
		const fileList: string[] = [];
		if (input.attachedFiles?.length) {
			for (const file of input.attachedFiles.slice(0, maxFiles)) {
				fileList.push(
					`- ${file.title} (文件路径: ${file.path})${
						file.type ? ` [${file.type}]` : ""
					}`,
				);
			}
		}
		if (input.attachedContexts?.length) {
			const remaining = Math.max(0, maxFiles - fileList.length);
			for (const ctx of input.attachedContexts.slice(0, remaining)) {
				fileList.push(`- ${ctx.title}`);
			}
		}
		if (fileList.length > 0) {
			enhancedUserPrompt += `\n\n【用户附加的文件/资料】\n${fileList.join("\n")}\n\n注意：这些文件以“路径”形式提供。若需要查看内容，请使用 Read 工具读取文件；若需要上传/处理文件，请将文件路径作为参数传递给对应 Skill 工具。`;
		}
	}

	return enhancedUserPrompt;
}
