type RequiredToolParam =
	| string
	| {
			name: string;
			aliases?: string[];
			kind?: "text" | "string" | "array" | "object" | "any";
	  };

export function normalizeToolNameKey(toolName: string): string {
	return String(toolName || "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

const REQUIRED_TOOL_PARAMS: Record<string, RequiredToolParam[]> = {
	askuserquestion: [{ name: "questions", kind: "array" }],
	bash: ["command"],
	edit: [
		{ name: "file_path", aliases: ["path", "file"] },
		"old_string",
		{ name: "new_string", kind: "string" },
	],
	glob: ["pattern"],
	grep: ["pattern"],
	multiedit: [
		{ name: "file_path", aliases: ["path", "file"] },
		{ name: "edits", kind: "array" },
	],
	read: [{ name: "file_path", aliases: ["path", "file"] }],
	skill: ["skill"],
	task: [
		"description",
		"prompt",
		{
			name: "subagent_type",
			aliases: ["subagentType", "agent_type", "agentType"],
		},
	],
	todowrite: [{ name: "todos", kind: "array" }],
	webfetch: ["url", "prompt"],
	websearch: ["query"],
	write: [
		{ name: "file_path", aliases: ["path", "file"] },
		{ name: "content", kind: "string" },
	],
};

export function shouldPreserveEmptyStringParam(
	toolName: string,
	key: string,
): boolean {
	const specs = REQUIRED_TOOL_PARAMS[normalizeToolNameKey(toolName)] || [];
	return specs.some((spec) => {
		if (typeof spec === "string") return false;
		if (spec.kind !== "string") return false;
		return spec.name === key || Boolean(spec.aliases?.includes(key));
	});
}

export function hasRequiredToolParamValue(
	toolInput: Record<string, unknown>,
	param: RequiredToolParam,
): boolean {
	const spec = typeof param === "string" ? { name: param } : param;
	const keys = [spec.name, ...(spec.aliases || [])];
	const kind = spec.kind || "text";

	for (const key of keys) {
		const value = toolInput[key];
		if (kind === "array") {
			if (Array.isArray(value) && value.length > 0) return true;
			continue;
		}
		if (kind === "object") {
			if (value && typeof value === "object" && !Array.isArray(value)) {
				return true;
			}
			continue;
		}
		if (kind === "any") {
			if (value !== undefined && value !== null && value !== "") return true;
			continue;
		}
		if (kind === "string") {
			if (typeof value === "string") return true;
			continue;
		}
		if (typeof value === "string" && value.trim().length > 0) return true;
	}
	return false;
}

export function hasFilePathParam(toolInput: Record<string, unknown>): boolean {
	return hasRequiredToolParamValue(toolInput, {
		name: "file_path",
		aliases: ["path", "file"],
	});
}

export function getMissingRequiredToolParams(
	toolName: string,
	toolInput: Record<string, unknown>,
): string[] {
	const specs = REQUIRED_TOOL_PARAMS[normalizeToolNameKey(toolName)] || [];
	return specs
		.filter((spec) => !hasRequiredToolParamValue(toolInput, spec))
		.map((spec) => (typeof spec === "string" ? spec : spec.name));
}

export function buildMissingRequiredToolParamsMessage(
	toolName: string,
	missing: string[],
): string {
	const toolLower = normalizeToolNameKey(toolName);
	const nextAction = (() => {
		if (toolLower === "edit") {
			return "请先用 Read/Glob/Grep 确认目标文件和原文，再重新发起包含完整 file_path、old_string、new_string 的 Edit 调用。";
		}
		if (toolLower === "write") {
			return "请补齐目标 file_path 和要写入的 content 后再重新调用 Write。";
		}
		if (toolLower === "bash") {
			return "请补齐 command 后再重新调用 Bash。";
		}
		if (toolLower === "task") {
			return "请补齐 description、prompt、subagent_type 后再重新调用 Task。";
		}
		if (toolLower === "askuserquestion") {
			return "请提供非空 questions 数组后再重新调用 AskUserQuestion。";
		}
		return "请补齐上述必填参数后再重新调用该工具。";
	})();
	return `工具参数无效：${toolName} 缺少必填参数 ${missing.join(", ")}。不要重复调用空参数工具；${nextAction}`;
}
