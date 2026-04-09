/**
 * Git Worktree 沙盒隔离服务
 * 为多 Agent 并行执行提供独立的 git worktree 工作目录，避免文件冲突。
 * 非 git 仓库时降级为 fs.cp 临时目录复制。
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Logger } from "../logging/types";

const execFileAsync = promisify(execFile);

// ==================
// 类型定义
// ==================

export interface WorktreeInfo {
	/** worktree 绝对路径 */
	worktreePath: string;
	/** 分支名 */
	branchName: string;
	/** 是否为 git worktree（false 表示降级的 fs.cp 副本） */
	isGitWorktree: boolean;
	/** 创建时间戳 */
	createdAt: number;
}

export interface WorktreeListItem {
	/** worktree 绝对路径 */
	worktreePath: string;
	/** 分支名 */
	branchName: string;
	/** HEAD commit hash */
	head: string;
	/** 是否为主 worktree */
	isMain: boolean;
}

export interface WorktreeDiff {
	/** diff 文本内容 */
	diff: string;
	/** 变更文件列表 */
	changedFiles: string[];
	/** 统计摘要 */
	stat: string;
}

export interface WorktreeMergeResult {
	success: boolean;
	/** 合并方式 */
	method: "merge" | "cherry-pick" | "patch";
	/** 合并信息 */
	message: string;
	/** 冲突文件（如有） */
	conflicts?: string[];
}

// ==================
// 工具函数
// ==================

/** 生成唯一分支名 */
function generateBranchName(): string {
	const ts = Date.now();
	const rand = Math.random().toString(36).slice(2, 8);
	return `ipo-agent-${ts}-${rand}`;
}

/** 获取 .ipo/worktrees 根目录 */
function getWorktreeRoot(repoPath: string): string {
	return path.join(repoPath, ".ipo", "worktrees");
}

/** 检查路径是否为 git 仓库 */
async function isGitRepo(dirPath: string): Promise<boolean> {
	try {
		await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
			cwd: dirPath,
		});
		return true;
	} catch {
		return false;
	}
}

/** 获取当前分支名 */
async function getCurrentBranch(repoPath: string): Promise<string> {
	const { stdout } = await execFileAsync(
		"git",
		["rev-parse", "--abbrev-ref", "HEAD"],
		{ cwd: repoPath },
	);
	return stdout.trim();
}

/** 安全执行 git 命令，统一错误处理 */
async function gitExec(
	args: string[],
	cwd: string,
): Promise<{ stdout: string; stderr: string }> {
	try {
		return await execFileAsync("git", args, {
			cwd,
			maxBuffer: 10 * 1024 * 1024, // 10MB，diff 可能很大
		});
	} catch (err: unknown) {
		const msg =
			err instanceof Error ? err.message : String(err);
		throw new Error(`git ${args[0]} 失败: ${msg}`);
	}
}

// ==================
// WorktreeService 类
// ==================

class WorktreeService {
	private logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * 创建 worktree
	 * git 仓库 → git worktree add
	 * 非 git 仓库 → fs.cp 降级复制
	 */
	async createWorktree(
		repoPath: string,
		branchName?: string,
	): Promise<WorktreeInfo> {
		const branch = branchName || generateBranchName();
		const root = getWorktreeRoot(repoPath);
		await fs.mkdir(root, { recursive: true });

		const worktreePath = path.join(root, branch);
		const isGit = await isGitRepo(repoPath);

		if (isGit) {
			return this.createGitWorktree(repoPath, worktreePath, branch);
		}
		return this.createFsCopyWorktree(repoPath, worktreePath, branch);
	}

	/** git worktree add 创建 */
	private async createGitWorktree(
		repoPath: string,
		worktreePath: string,
		branch: string,
	): Promise<WorktreeInfo> {
		this.logger.info({
			msg: "创建 git worktree",
			repoPath,
			worktreePath,
			branch,
		});

		// 先确保没有同名分支
		try {
			await gitExec(["rev-parse", "--verify", branch], repoPath);
			// 分支已存在，用 --checkout
			await gitExec(
				["worktree", "add", worktreePath, branch],
				repoPath,
			);
		} catch {
			// 分支不存在，创建新分支
			await gitExec(
				["worktree", "add", "-b", branch, worktreePath],
				repoPath,
			);
		}

		this.logger.info({ msg: "git worktree 创建成功", worktreePath, branch });
		return {
			worktreePath,
			branchName: branch,
			isGitWorktree: true,
			createdAt: Date.now(),
		};
	}

	/** 非 git 仓库降级：fs.cp 复制 */
	private async createFsCopyWorktree(
		repoPath: string,
		worktreePath: string,
		branch: string,
	): Promise<WorktreeInfo> {
		this.logger.info({
			msg: "非 git 仓库，降级为 fs.cp 复制",
			repoPath,
			worktreePath,
		});

		await fs.cp(repoPath, worktreePath, {
			recursive: true,
			filter: (src) => {
				// 排除 node_modules 和 .ipo 目录
				const rel = path.relative(repoPath, src);
				if (rel.startsWith("node_modules") || rel.startsWith(".ipo")) {
					return false;
				}
				return true;
			},
		});

		this.logger.info({ msg: "fs.cp 复制完成", worktreePath });
		return {
			worktreePath,
			branchName: branch,
			isGitWorktree: false,
			createdAt: Date.now(),
		};
	}

	/**
	 * 列出仓库的所有 worktree
	 */
	async listWorktrees(repoPath: string): Promise<WorktreeListItem[]> {
		const isGit = await isGitRepo(repoPath);
		if (!isGit) {
			// 非 git 仓库，扫描 .ipo/worktrees 目录
			return this.listFsCopyWorktrees(repoPath);
		}

		const { stdout } = await gitExec(
			["worktree", "list", "--porcelain"],
			repoPath,
		);

		const items: WorktreeListItem[] = [];
		const blocks = stdout.split("\n\n").filter(Boolean);

		for (const block of blocks) {
			const lines = block.split("\n");
			let wtPath = "";
			let head = "";
			let branch = "";
			let isMain = false;

			for (const line of lines) {
				if (line.startsWith("worktree ")) {
					wtPath = line.slice("worktree ".length);
				} else if (line.startsWith("HEAD ")) {
					head = line.slice("HEAD ".length);
				} else if (line.startsWith("branch ")) {
					// refs/heads/xxx → xxx
					branch = line.slice("branch ".length).replace("refs/heads/", "");
				}
			}

			// 主 worktree 路径 === repoPath
			if (path.resolve(wtPath) === path.resolve(repoPath)) {
				isMain = true;
			}

			if (wtPath) {
				items.push({
					worktreePath: wtPath,
					branchName: branch || "(detached)",
					head: head.slice(0, 12),
					isMain,
				});
			}
		}

		return items;
	}

	/** 扫描 .ipo/worktrees 目录（非 git 降级模式） */
	private async listFsCopyWorktrees(
		repoPath: string,
	): Promise<WorktreeListItem[]> {
		const root = getWorktreeRoot(repoPath);
		try {
			const entries = await fs.readdir(root, { withFileTypes: true });
			return entries
				.filter((e) => e.isDirectory())
				.map((e) => ({
					worktreePath: path.join(root, e.name),
					branchName: e.name,
					head: "(fs-copy)",
					isMain: false,
				}));
		} catch {
			return [];
		}
	}

	/**
	 * 获取 worktree 相对于主分支的 diff
	 */
	async getWorktreeDiff(
		repoPath: string,
		worktreePath: string,
	): Promise<WorktreeDiff> {
		const isGit = await isGitRepo(worktreePath);
		if (!isGit) {
			return { diff: "", changedFiles: [], stat: "非 git worktree，无法获取 diff" };
		}

		// 获取主分支名
		const mainBranch = await getCurrentBranch(repoPath);
		// 获取 worktree 分支名
		const wtBranch = await getCurrentBranch(worktreePath);

		// 先提交 worktree 中的所有变更（如果有未提交的）
		// 获取 diff: 主分支..worktree分支
		const { stdout: diff } = await gitExec(
			["diff", `${mainBranch}...${wtBranch}`],
			worktreePath,
		);

		const { stdout: stat } = await gitExec(
			["diff", "--stat", `${mainBranch}...${wtBranch}`],
			worktreePath,
		);

		const { stdout: nameOnly } = await gitExec(
			["diff", "--name-only", `${mainBranch}...${wtBranch}`],
			worktreePath,
		);

		const changedFiles = nameOnly
			.split("\n")
			.map((f) => f.trim())
			.filter(Boolean);

		return { diff, changedFiles, stat: stat.trim() };
	}

	/**
	 * 将 worktree 的变更合并回主分支
	 */
	async mergeWorktree(
		repoPath: string,
		worktreePath: string,
	): Promise<WorktreeMergeResult> {
		const isGit = await isGitRepo(worktreePath);
		if (!isGit) {
			return {
				success: false,
				method: "patch",
				message: "非 git worktree，不支持合并",
			};
		}

		const mainBranch = await getCurrentBranch(repoPath);
		const wtBranch = await getCurrentBranch(worktreePath);

		this.logger.info({
			msg: "合并 worktree 变更",
			mainBranch,
			wtBranch,
			repoPath,
		});

		// 先在 worktree 中自动提交未暂存的变更
		await this.autoCommitWorktree(worktreePath, wtBranch);

		// 在主仓库中执行 merge
		try {
			const { stdout } = await gitExec(
				["merge", wtBranch, "--no-edit"],
				repoPath,
			);
			this.logger.info({ msg: "merge 成功", output: stdout.trim() });
			return {
				success: true,
				method: "merge",
				message: stdout.trim() || "合并成功",
			};
		} catch (mergeErr) {
			// merge 失败，检查是否有冲突
			this.logger.warn({
				msg: "merge 失败，尝试获取冲突信息",
				error: String(mergeErr),
			});

			try {
				const { stdout: conflictFiles } = await gitExec(
					["diff", "--name-only", "--diff-filter=U"],
					repoPath,
				);
				const conflicts = conflictFiles
					.split("\n")
					.filter(Boolean);

				// 中止 merge，让调用方决定如何处理
				await gitExec(["merge", "--abort"], repoPath);

				return {
					success: false,
					method: "merge",
					message: "合并存在冲突，已自动中止",
					conflicts,
				};
			} catch {
				return {
					success: false,
					method: "merge",
					message: `合并失败: ${String(mergeErr)}`,
				};
			}
		}
	}

	/**
	 * 自动提交 worktree 中未暂存的变更
	 */
	private async autoCommitWorktree(
		worktreePath: string,
		branchName: string,
	): Promise<void> {
		// 检查是否有未暂存的变更
		const { stdout: status } = await gitExec(
			["status", "--porcelain"],
			worktreePath,
		);
		if (!status.trim()) return;

		this.logger.info({
			msg: "自动提交 worktree 未暂存变更",
			worktreePath,
			branchName,
		});

		await gitExec(["add", "-A"], worktreePath);
		await gitExec(
			["commit", "-m", `[ipo-agent] auto-commit from ${branchName}`],
			worktreePath,
		);
	}

	/**
	 * 删除 worktree 和对应分支
	 */
	async removeWorktree(
		repoPath: string,
		worktreePath: string,
	): Promise<{ success: boolean; message: string }> {
		this.logger.info({ msg: "删除 worktree", repoPath, worktreePath });

		const isGit = await isGitRepo(repoPath);

		if (isGit) {
			// 获取 worktree 对应的分支名（删除前）
			let branchToDelete = "";
			try {
				branchToDelete = await getCurrentBranch(worktreePath);
			} catch {
				// worktree 可能已损坏
			}

			// 强制移除 worktree
			try {
				await gitExec(
					["worktree", "remove", worktreePath, "--force"],
					repoPath,
				);
			} catch {
				// worktree 可能已被手动删除，尝试 prune
				await gitExec(["worktree", "prune"], repoPath);
			}

			// 删除对应分支
			if (branchToDelete && branchToDelete.startsWith("ipo-agent-")) {
				try {
					await gitExec(
						["branch", "-D", branchToDelete],
						repoPath,
					);
					this.logger.info({ msg: "已删除分支", branch: branchToDelete });
				} catch {
					this.logger.warn({ msg: "删除分支失败（可能已不存在）", branch: branchToDelete });
				}
			}
		} else {
			// 非 git 仓库，直接删除目录
			await fs.rm(worktreePath, { recursive: true, force: true });
		}

		this.logger.info({ msg: "worktree 删除完成", worktreePath });
		return { success: true, message: "worktree 已删除" };
	}
}

// ==================
// 单例
// ==================

let instance: WorktreeService | null = null;

export function getWorktreeService(logger?: Logger): WorktreeService {
	if (!instance) {
		if (!logger) {
			throw new Error("首次调用 getWorktreeService 必须传入 logger");
		}
		instance = new WorktreeService(logger);
	}
	return instance;
}