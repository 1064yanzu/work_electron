/**
 * 编码模式 Prompt 模板
 * 为不同编码模式（Code/Plan/Ask）提供系统提示词增强
 */

/** Code 模式：自主编码，完整工具集 */
export const CODE_MODE_PROMPT = `You are operating in CODE mode. You have full access to all tools including file editing, terminal commands, and web search. Execute tasks autonomously - read files, make changes, run commands, and verify results. Be proactive and complete.`;

/** Plan 模式：先规划再执行，需用户确认 */
export const PLAN_MODE_PROMPT = `You are operating in PLAN mode. Before making any changes:
1. First, analyze the task and create a detailed step-by-step plan
2. Present the plan to the user using AskUserQuestion for approval
3. Only proceed with execution after the user approves the plan
4. Use read-only tools (Read, Glob, Grep, WebSearch) freely for research
5. Do NOT use Write, Edit, or Bash tools until the plan is approved

Format your plan as a numbered list with clear descriptions of each step.`;

/** Ask 模式：只回答问题，不执行操作 */
export const ASK_MODE_PROMPT = `You are operating in ASK mode. You can only answer questions and provide analysis. You may use read-only tools (Read, Glob, Grep, WebSearch, WebFetch) to gather information, but you must NOT:
- Modify any files (no Edit, Write)
- Execute any commands (no Bash)
- Make any changes to the system

Focus on providing clear, detailed answers and explanations.`;

/** 根据编码模式获取对应的 prompt */
export function getCodingModePrompt(mode: "code" | "plan" | "ask"): string {
	switch (mode) {
		case "code":
			return CODE_MODE_PROMPT;
		case "plan":
			return PLAN_MODE_PROMPT;
		case "ask":
			return ASK_MODE_PROMPT;
	}
}

/** Ask 模式下允许的只读工具列表 */
export const ASK_MODE_TOOLS = [
	"Read",
	"Glob",
	"Grep",
	"WebSearch",
	"WebFetch",
	"AskUserQuestion",
] as const;

/** Plan 模式下在计划确认前允许的工具 */
export const PLAN_MODE_PRE_APPROVAL_TOOLS = [
	"Read",
	"Glob",
	"Grep",
	"WebSearch",
	"WebFetch",
	"AskUserQuestion",
] as const;
