import type { SessionSendOptions } from "./types";
import { inferLanguage } from "../utils/diffUtils";

const MAX_CONTEXT_FILES = 8;
const MAX_TOTAL_CONTEXT_CHARS = 60_000;

export function buildPromptWithContextFiles(
	prompt: string,
	contextFiles: SessionSendOptions["contextFiles"],
): string {
	if (!contextFiles?.length) return prompt;

	let remaining = MAX_TOTAL_CONTEXT_CHARS;
	const sections: string[] = [];

	for (const file of contextFiles.slice(0, MAX_CONTEXT_FILES)) {
		if (!file.content) continue;
		const safeContent = file.content.slice(0, remaining);
		if (!safeContent) break;
		remaining -= safeContent.length;
		sections.push(
			[
				`File: ${file.path}`,
				`Language: ${inferLanguage(file.path)}`,
				"```",
				safeContent,
				"```",
			].join("\n"),
		);
		if (remaining <= 0) break;
	}

	if (sections.length === 0) return prompt;

	return [
		"Attached project context files:",
		...sections,
		"",
		"User request:",
		prompt,
	].join("\n\n");
}
