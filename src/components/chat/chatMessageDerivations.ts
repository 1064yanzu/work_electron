export type ExtractedCodeBlock = {
	language: string;
	code: string;
};

export type ChatWebPreviewData =
	| {
			kind: "html";
			html: string;
			css?: string;
			js?: string;
	  }
	| {
			kind: "react";
			jsx: string;
			css?: string;
	  };

export type AssistantMessageSegment =
	| {
			kind: "processing";
			action: "update" | "create";
	  }
	| {
			kind: "file_update";
			updateType: "update" | "create";
	  }
	| {
			kind: "markdown";
			content: string;
	  };

const CODE_BLOCK_REGEX = /```(\w*)\n([\s\S]*?)```/g;
const ASSISTANT_MESSAGE_MARKER_REGEX =
	/(<<<<AI_UPDATE_PENDING>>>>|<<<<AI_CREATE_PENDING>>>>|<<<<AI_UPDATE_DONE>>>>|<<<<AI_CREATE_DONE>>>>)/;

export function extractCodeBlocks(content: string): ExtractedCodeBlock[] {
	CODE_BLOCK_REGEX.lastIndex = 0;
	const blocks: ExtractedCodeBlock[] = [];
	let match: RegExpExecArray | null;
	while ((match = CODE_BLOCK_REGEX.exec(content)) !== null) {
		blocks.push({
			language: match[1] || "text",
			code: match[2].trim(),
		});
	}
	return blocks;
}

export function extractWebPreviewFromCodeBlocks(
	blocks: ExtractedCodeBlock[],
): ChatWebPreviewData | null {
	let html = "";
	let jsx = "";
	let css = "";
	let js = "";

	for (const block of blocks) {
		const lang = String(block.language || "")
			.trim()
			.toLowerCase();
		const code = String(block.code || "");
		if (!html && (lang === "html" || lang === "htm")) html = code;
		else if (!jsx && (lang === "jsx" || lang === "tsx")) jsx = code;
		else if (!css && lang === "css") css = code;
		else if (
			!js &&
			(lang === "js" ||
				lang === "javascript" ||
				lang === "mjs" ||
				lang === "cjs")
		)
			js = code;
	}

	if (!html) {
		const fallback = blocks.find((block) =>
			/<\s*div[\s>]|<\s*html[\s>]|<!doctype/i.test(block.code),
		);
		if (fallback) {
			const looksLikeHtml = /<\s*html[\s>]|<!doctype/i.test(fallback.code);
			if (looksLikeHtml) html = fallback.code;
			else if (!jsx) jsx = fallback.code;
		}
	}

	if (html && html.trim()) {
		return {
			kind: "html",
			html,
			css: css.trim() ? css : undefined,
			js: js.trim() ? js : undefined,
		};
	}
	if (jsx && jsx.trim()) {
		return {
			kind: "react",
			jsx,
			css: css.trim() ? css : undefined,
		};
	}
	return null;
}

export function splitAssistantMessageContent(
	content: string,
): AssistantMessageSegment[] {
	return content
		.split(ASSISTANT_MESSAGE_MARKER_REGEX)
		.map<AssistantMessageSegment | null>((part) => {
			if (part === "<<<<AI_UPDATE_PENDING>>>>") {
				return { kind: "processing", action: "update" };
			}
			if (part === "<<<<AI_CREATE_PENDING>>>>") {
				return { kind: "processing", action: "create" };
			}
			if (part === "<<<<AI_UPDATE_DONE>>>>") {
				return { kind: "file_update", updateType: "update" };
			}
			if (part === "<<<<AI_CREATE_DONE>>>>") {
				return { kind: "file_update", updateType: "create" };
			}
			if (!part || !part.trim()) return null;
			return { kind: "markdown", content: part };
		})
		.filter((part): part is AssistantMessageSegment => part !== null);
}
