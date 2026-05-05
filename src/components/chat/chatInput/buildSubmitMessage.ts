import type { SelectedChip } from "../SlashCommandChip";

export interface BuildSubmitMessageResult {
	finalMessage: string;
	skillName?: string;
}

/**
 * 把用户输入与已选择的命令 chips 合成最终发送消息：
 *   显式 Skill 名（$skill-name）+ 提示词 chip 内容 + 用户输入
 *
 * Agent Skill 通过 `$skill-name` 显式出现在用户 prompt 中，由 SDK 原生路由。
 */
export function buildSubmitMessage(
	rawValue: string,
	selectedChips: SelectedChip[],
): BuildSubmitMessageResult {
	const trimmed = rawValue.trim();

	const promptContent = selectedChips
		.filter((c) => c.type === "prompt" && c.content)
		.map((c) => c.content)
		.join("\n\n");

	const agentSkillChip = selectedChips.find((c) => c.type === "agent_skill");
	const selectedSkillName = agentSkillChip?.skillName;
	const skillMention = selectedSkillName ? `$${selectedSkillName}` : "";

	let finalMessage = trimmed;
	if (promptContent) {
		finalMessage = finalMessage
			? `${promptContent}\n\n${finalMessage}`
			: promptContent;
	}
	if (skillMention) {
		finalMessage = finalMessage
			? `${skillMention}\n\n${finalMessage}`
			: skillMention;
	}

	return {
		finalMessage,
		skillName: selectedSkillName,
	};
}
