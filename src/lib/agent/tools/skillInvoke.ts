// skill_invoke 工具定义
// 让 LLM 可以自主激活技能（读取完整的 SKILL.md 内容）

import { skillsStore } from "../../skillsStore";
import { invoke } from "../../tauriCompat";
import type { ToolDefinition, ToolResult } from "../types";

export const skillInvokeTool: ToolDefinition = {
	type: "skill_invoke",
	name: "激活技能",
	description:
		"根据技能名称读取完整的 SKILL.md 指令内容。当你判断用户请求与某个技能相关时，使用此工具获取详细的技能指令。",
	icon: "Zap",
	inputSchema: {
		type: "object",
		properties: {
			skill_name: {
				type: "string",
				description:
					"要激活的技能名称（必须与 available_skills 中的 name 匹配）",
			},
		},
		required: ["skill_name"],
	},

	async execute(input: Record<string, any>): Promise<ToolResult> {
		const { skill_name } = input;

		if (!skill_name || typeof skill_name !== "string") {
			return {
				success: false,
				error: "缺少必需参数: skill_name",
			};
		}

		try {
			await skillsStore.init();
			const skills = skillsStore.getEnabledSkills();
			const skill = skills.find(
				(s) => s.name.toLowerCase() === skill_name.toLowerCase(),
			);

			if (!skill) {
				return {
					success: false,
					error: `技能 "${skill_name}" 未找到。可用技能: ${skills.map((s) => s.name).join(", ")}`,
				};
			}

			// 读取完整的 SKILL.md 文件
			const skillMdPath = `${skill.location}/SKILL.md`;
			let skillContent: string;

			try {
				// read_file_safe 返回 { content, encoding, size } 结构
				const result = await invoke<{
					content: string;
					encoding: string;
					size: number;
				}>("read_file_safe", {
					payload: { path: skillMdPath },
				});
				skillContent = result.content;
			} catch (e) {
				return {
					success: false,
					error: `无法读取技能文件: ${skillMdPath}. 错误: ${e instanceof Error ? e.message : String(e)}`,
				};
			}

			// 返回技能信息和完整内容
			return {
				success: true,
				data: {
					skillName: skill.name,
					description: skill.description,
					location: skill.location,
					instructions: skillContent,
					message: `技能 "${skill.name}" 已激活。请按照上述指令执行任务。`,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: `激活技能失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	},
};
