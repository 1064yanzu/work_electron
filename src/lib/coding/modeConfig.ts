/**
 * 编码模式 → SDK 参数映射
 * 将 Code/Plan/Ask 三种 UI 模式映射为 Claude Agent SDK 的具体参数
 */

import type { AgentStartPayload } from '../agent/sdkClient';

/** Code 模式：自主编码，完整工具集 */
const CODE_MODE_TOOLS = [
	'Read', 'Write', 'Edit', 'Glob', 'Grep',
	'Bash', 'WebSearch', 'WebFetch',
	'NotebookEdit', 'TodoRead', 'TodoWrite',
] as const;

/** Plan 模式：先规划再执行，只读 + AskUserQuestion */
const PLAN_MODE_TOOLS = [
	'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'AskUserQuestion',
] as const;

/** Ask 模式：只回答问题，只读工具 */
const ASK_MODE_TOOLS = [
	'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch',
] as const;

export interface ModeConfig {
	permissionMode: string;
	allowedTools: string[];
	systemPromptSuffix: string;
}

/** 根据编码模式获取 SDK 配置 */
export function getModeConfig(mode: 'code' | 'plan' | 'ask'): ModeConfig {
	switch (mode) {
		case 'code':
			return {
				permissionMode: 'acceptEdits',
				allowedTools: [...CODE_MODE_TOOLS],
				systemPromptSuffix: 'You are operating in CODE mode. Execute tasks autonomously with full tool access.',
			};
		case 'plan':
			return {
				permissionMode: 'plan',
				allowedTools: [...PLAN_MODE_TOOLS],
				systemPromptSuffix: 'You are operating in PLAN mode. First analyze and create a step-by-step plan. Use read-only tools for research. Do NOT modify files until the plan is approved.',
			};
		case 'ask':
			return {
				permissionMode: 'plan',
				allowedTools: [...ASK_MODE_TOOLS],
				systemPromptSuffix: 'You are operating in ASK mode. Only answer questions and provide analysis. Do NOT modify any files or execute any commands.',
			};
	}
}

/** 将 ModeConfig 合并到 SDK payload */
export function applyModeToPayload(
	payload: Partial<AgentStartPayload>,
	mode: 'code' | 'plan' | 'ask',
): Partial<AgentStartPayload> {
	const config = getModeConfig(mode);
	return {
		...payload,
		permission_mode: config.permissionMode,
		allowed_tools: config.allowedTools,
		system_prompt: payload.system_prompt
			? `${payload.system_prompt}\n\n${config.systemPromptSuffix}`
			: config.systemPromptSuffix,
	};
}
