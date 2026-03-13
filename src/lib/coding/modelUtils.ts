/**
 * 模型名称格式化工具
 * 统一 CodingInputActions 和 CodingChatInput 中的模型名称显示
 */

/** 常见模型名简化映射 */
const MODEL_NAME_MAP: Record<string, string> = {
	'claude-sonnet-4-6': 'Sonnet 4.6',
	'claude-opus-4-6': 'Opus 4.6',
	'claude-haiku-4-5': 'Haiku 4.5',
	'gpt-5-codex': 'GPT-5 Codex',
	'gpt-5.4': 'GPT-5.4',
	'gpt-5-mini': 'GPT-5 Mini',
	'o3': 'o3',
	'o4-mini': 'o4 Mini',
};

/** 格式化模型名称为简短显示 */
export function formatModelName(model: string): string {
	return MODEL_NAME_MAP[model] || model.split('/').pop()?.slice(0, 20) || model;
}

/** 获取完整的模型名称映射（用于下拉菜单等） */
export function getModelDisplayName(model: string): { short: string; full: string } {
	return {
		short: formatModelName(model),
		full: model,
	};
}
