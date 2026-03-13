/**
 * 模型名称格式化工具
 * 统一 CodingInputActions 和 CodingChatInput 中的模型名称显示
 */

/** 常见模型名简化映射（Codex 系列不再硬编码，从用户 CLI 配置读取） */
const MODEL_NAME_MAP: Record<string, string> = {
	'claude-sonnet-4-6': 'Sonnet 4.6',
	'claude-opus-4-6': 'Opus 4.6',
	'claude-haiku-4-5': 'Haiku 4.5',
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
