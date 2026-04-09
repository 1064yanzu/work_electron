/**
 * Plan Mode Prompt 构建器
 *
 * 负责：
 * 1. 构建规划模式的 system prompt 注入内容
 * 2. 从 Agent 输出中解析结构化计划
 * 3. 构建执行模式的 prompt（将确认的计划作为上下文）
 */

import type { PlanData, PlanStep } from "./planModeStore";

// ─── System Prompt 构建 ───

/**
 * 构建规划模式的 system prompt 注入内容。
 * 指示 Agent 只输出结构化计划，不执行任何修改操作。
 */
export function buildPlanModeSystemPrompt(): string {
	return `
## Plan Mode (规划模式)

You are currently in **Plan Mode**. In this mode you MUST:

1. **Analyze** the user's request thoroughly
2. **Output a structured plan** as a JSON code block — do NOT execute any file modifications
3. **Only use read-only tools** (Read, Glob, Grep, WebSearch, WebFetch) to gather context
4. **Never** use Edit, Write, Bash, or any tool that modifies the filesystem

### Plan Output Format

After analyzing the task, output your plan in the following JSON format inside a fenced code block tagged \`plan\`:

\`\`\`plan
{
  "taskDescription": "Brief summary of what the user wants to accomplish",
  "steps": [
    {
      "id": "step-1",
      "title": "Short title for this step",
      "description": "Detailed description of what this step will do and why",
      "estimatedFiles": ["path/to/file1.ts", "path/to/file2.ts"]
    }
  ]
}
\`\`\`

### Guidelines

- Break the task into clear, atomic steps that can be executed sequentially
- Each step should be independently understandable
- List all files that will likely be created or modified in \`estimatedFiles\`
- Order steps by dependency (prerequisites first)
- Include validation/testing steps where appropriate
- Be specific about what changes each step will make
- If the task is ambiguous, state your assumptions in the step descriptions
`.trim();
}

// ─── 计划解析 ───

/**
 * 从 Agent 输出中解析计划。
 * 支持 ```plan``` 代码块和裸 JSON 两种格式。
 */
export function parsePlanFromAgentOutput(content: string): PlanData | null {
	if (!content || typeof content !== "string") return null;

	// 尝试从 ```plan ... ``` 代码块中提取
	const fencedMatch = content.match(/```plan\s*\n([\s\S]*?)```/);
	let jsonStr = fencedMatch?.[1]?.trim() ?? null;

	// 回退：尝试从 ```json ... ``` 代码块中提取
	if (!jsonStr) {
		const jsonFencedMatch = content.match(/```json\s*\n([\s\S]*?)```/);
		jsonStr = jsonFencedMatch?.[1]?.trim() ?? null;
	}

	// 回退：尝试直接解析整段内容为 JSON
	if (!jsonStr) {
		const trimmed = content.trim();
		if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
			jsonStr = trimmed;
		}
	}

	if (!jsonStr) return null;

	try {
		const parsed = JSON.parse(jsonStr);
		return normalizeParsedPlan(parsed);
	} catch {
		return null;
	}
}

/**
 * 将解析出的 JSON 规范化为 PlanData 结构
 */
function normalizeParsedPlan(raw: unknown): PlanData | null {
	if (!raw || typeof raw !== "object") return null;
	const obj = raw as Record<string, unknown>;

	const taskDescription =
		typeof obj.taskDescription === "string"
			? obj.taskDescription
			: typeof obj.task === "string"
				? (obj.task as string)
				: "";

	if (!taskDescription) return null;

	const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];
	if (rawSteps.length === 0) return null;

	const steps: PlanStep[] = rawSteps
		.map((s, index) => normalizePlanStep(s, index))
		.filter((s): s is PlanStep => s !== null);

	if (steps.length === 0) return null;

	return {
		id: generatePlanId(),
		taskDescription,
		steps,
		createdAt: Date.now(),
		status: "draft",
	};
}

/**
 * 规范化单个步骤
 */
function normalizePlanStep(raw: unknown, index: number): PlanStep | null {
	if (!raw || typeof raw !== "object") return null;
	const obj = raw as Record<string, unknown>;

	const title = typeof obj.title === "string" ? obj.title : "";
	const description =
		typeof obj.description === "string" ? obj.description : "";

	if (!title && !description) return null;

	const estimatedFiles = Array.isArray(obj.estimatedFiles)
		? obj.estimatedFiles.filter((f): f is string => typeof f === "string")
		: undefined;

	return {
		id: typeof obj.id === "string" ? obj.id : `step-${index + 1}`,
		title: title || `Step ${index + 1}`,
		description: description || title,
		estimatedFiles: estimatedFiles?.length ? estimatedFiles : undefined,
		status: "pending",
	};
}

// ─── 执行 Prompt 构建 ───

/**
 * 构建执行模式的 prompt，将确认的计划作为上下文注入。
 */
export function buildPlanExecutionPrompt(plan: PlanData): string {
	const stepsText = plan.steps
		.map((step, i) => {
			const filesNote =
				step.estimatedFiles?.length
					? `\n   Files: ${step.estimatedFiles.join(", ")}`
					: "";
			return `${i + 1}. **${step.title}**\n   ${step.description}${filesNote}`;
		})
		.join("\n\n");

	return `
## Execution Plan (已确认的执行计划)

The user has reviewed and confirmed the following plan. Execute each step in order.
After completing each step, briefly note what was done before moving to the next.

### Task
${plan.taskDescription}

### Steps
${stepsText}

### Instructions
- Execute the steps in the order listed above
- If a step cannot be completed as planned, explain why and adapt
- After completing all steps, provide a brief summary of what was accomplished
`.trim();
}

// ─── 工具集定义 ───

/** 规划模式下允许的只读工具 */
export const PLAN_MODE_ALLOWED_TOOLS = [
	"Read",
	"Glob",
	"Grep",
	"WebSearch",
	"WebFetch",
	"AskUserQuestion",
] as const;

// ─── 工具函数 ───

function generatePlanId(): string {
	return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
