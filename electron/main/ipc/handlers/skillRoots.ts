import path from "node:path";
import { app } from "electron";

/**
 * 应用内 Skills 管理面板的单一真实来源。
 * 侧栏启用/禁用、导入/删除都应围绕这组目录工作，
 * 运行时再把已启用技能同步进各自沙盒的 project skills。
 */
export function getManagedSkillsRootDir(): string {
	return path.join(app.getPath("home"), ".claude", "skills");
}

export function getProjectSkillsRootDir(cwd: string): string {
	return path.join(cwd, ".claude", "skills");
}
