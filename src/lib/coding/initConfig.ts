/**
 * 初始化配置模块
 * 根据后端类型生成对应的配置文件模板（CLAUDE.md / AGENTS.md）
 */

import { invoke } from "../tauriCompat";
import type { CodingBackendId } from "../../../electron/shared/coding-workspace";

export interface InitConfigResult {
	success: boolean;
	filePath?: string;
	error?: string;
}

/** CLAUDE.md 基础指令模板 */
function getClaudeCodeTemplate(projectName: string): string {
	return `# ${projectName} - Claude Code 指令

## 项目概述
<!-- 在此描述项目的核心功能和架构 -->

## 技术栈
<!-- 列出项目使用的主要技术和框架 -->

## 开发约定

### 代码风格
- 遵循项目既有的代码风格和命名约定
- 保持代码简洁、可读、可维护
- 适度添加注释，解释复杂逻辑

### 文件组织
- 保持模块化，避免单个文件过大
- 相关功能放在同一目录下
- 遵循项目已有的目录结构

### 提交规范
- 使用语义化提交信息（feat/fix/refactor/docs/chore）
- 每次提交聚焦于单一变更
- 提交前确保代码能通过构建和测试

## 注意事项
- 修改代码前先理解上下文
- 不要破坏已有功能
- 涉及破坏性变更时先说明影响范围
`;
}

/** AGENTS.md 基础指令模板 */
function getCodexTemplate(projectName: string): string {
	return `# ${projectName} - Codex 指令

## 项目概述
<!-- 在此描述项目的核心功能和架构 -->

## 技术栈
<!-- 列出项目使用的主要技术和框架 -->

## 开发约定

### 代码风格
- 遵循项目既有的代码风格和命名约定
- 保持代码简洁、可读、可维护
- 适度添加注释，解释复杂逻辑

### 文件组织
- 保持模块化，避免单个文件过大
- 相关功能放在同一目录下
- 遵循项目已有的目录结构

### 提交规范
- 使用语义化提交信息（feat/fix/refactor/docs/chore）
- 每次提交聚焦于单一变更
- 提交前确保代码能通过构建和测试

## 注意事项
- 修改代码前先理解上下文
- 不要破坏已有功能
- 涉及破坏性变更时先说明影响范围
`;
}

/**
 * 初始化项目配置
 * 根据 backend 类型生成对应的配置文件
 */
export async function initProjectConfig(
	projectPath: string,
	backend: CodingBackendId,
): Promise<InitConfigResult> {
	const projectName = projectPath.split("/").pop() || projectPath;

	const configFileName = backend === "claude-code" ? "CLAUDE.md" : "AGENTS.md";
	const configFilePath = `${projectPath}/${configFileName}`;
	const content =
		backend === "claude-code"
			? getClaudeCodeTemplate(projectName)
			: getCodexTemplate(projectName);

	try {
		const result = await invoke<{ success: boolean; error?: string }>(
			"coding_write_file",
			{
				path: configFilePath,
				content,
				createDirs: false,
			},
		);

		if (!result.success) {
			return { success: false, error: result.error || "写入配置文件失败。" };
		}

		return { success: true, filePath: configFilePath };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, error: `创建配置文件失败: ${message}` };
	}
}
