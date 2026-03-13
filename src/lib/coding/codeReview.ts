/**
 * 代码审查模块
 * 通过 IPC 获取 Git 状态，构建代码审查 prompt
 */

import { invoke } from "../tauriCompat";

/** Git 文件状态 */
interface GitFileStatus {
	path: string;
	status:
		| "modified"
		| "added"
		| "deleted"
		| "renamed"
		| "untracked"
		| "copied"
		| "conflicted";
	staged: boolean;
}

/** coding_git_status IPC 返回类型 */
interface GitStatusResult {
	isGitRepo: boolean;
	status: {
		branch: string;
		ahead: number;
		behind: number;
		files: GitFileStatus[];
	} | null;
}

export interface CodeReviewResult {
	success: boolean;
	prompt?: string;
	error?: string;
}

/**
 * 启动代码审查
 * 1. 通过 IPC 调用 coding_git_status 获取当前 Git 变更
 * 2. 构建中文的 review prompt
 * 3. 返回 prompt 字符串供 session manager 发送
 */
export async function startCodeReview(
	projectPath: string,
): Promise<CodeReviewResult> {
	try {
		const result = await invoke<GitStatusResult>("coding_git_status", {
			path: projectPath,
		});

		if (!result.isGitRepo) {
			return {
				success: false,
				error: "当前目录不是 Git 仓库，无法进行代码审查。",
			};
		}

		if (!result.status) {
			return { success: false, error: "无法获取 Git 状态信息。" };
		}

		const { branch, files } = result.status;

		if (files.length === 0) {
			return { success: false, error: "当前没有任何文件变更，无需审查。" };
		}

		const prompt = buildReviewPrompt(branch, files);
		return { success: true, prompt };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, error: `获取 Git 状态失败: ${message}` };
	}
}

/**
 * 构建代码审查 prompt
 */
function buildReviewPrompt(branch: string, files: GitFileStatus[]): string {
	const statusLabels: Record<GitFileStatus["status"], string> = {
		modified: "修改",
		added: "新增",
		deleted: "删除",
		renamed: "重命名",
		untracked: "未追踪",
		copied: "复制",
		conflicted: "冲突",
	};

	const fileList = files
		.map(
			(f) =>
				`  - [${statusLabels[f.status]}] ${f.path}${f.staged ? " (已暂存)" : ""}`,
		)
		.join("\n");

	return `请对当前分支 \`${branch}\` 的代码变更进行审查。

## 变更文件列表

${fileList}

## 审查要求

请你作为资深代码审查者，对以上变更进行全面审查，重点关注以下方面：

1. **代码质量**：是否有代码异味、重复代码、过长函数等问题
2. **逻辑正确性**：是否有潜在的 bug、边界条件遗漏、错误处理不完善
3. **安全性**：是否有安全隐患（硬编码密钥、XSS、注入等）
4. **性能**：是否有性能瓶颈或不必要的计算/渲染
5. **可维护性**：命名是否清晰、注释是否充分、架构是否合理
6. **类型安全**：TypeScript 类型是否完善，有无 any 滥用

请逐文件分析，给出具体的改进建议和示例代码（如果适用）。对于严重问题请标注优先级。`;
}
