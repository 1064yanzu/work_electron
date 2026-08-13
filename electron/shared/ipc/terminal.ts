// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：terminal（共 14 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

export interface TerminalIpcSchema {
	// ==================
	// 终端（Terminal / PTY）
	// ==================
	/** 创建终端实例 */
	terminal_create: {
		input: {
			id: string;
			cwd?: string;
			shell?: string;
			env?: Record<string, string>;
			cols?: number;
			rows?: number;
		};
		output: {
			id: string;
			name: string;
			cwd: string;
			shell: string;
			pid: number;
			createdAt: number;
		};
	};
	/** 向终端写入数据 */
	terminal_write: {
		input: { id: string; data: string };
		output: { success: boolean };
	};
	/** 调整终端大小 */
	terminal_resize: {
		input: { id: string; cols: number; rows: number };
		output: { success: boolean };
	};
	/** 销毁终端 */
	terminal_destroy: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 列出活跃终端 */
	terminal_list: {
		input: Record<string, never>;
		output: Array<{
			id: string;
			name: string;
			cwd: string;
			shell: string;
			pid: number;
			createdAt: number;
		}>;
	};

	// ==================
	// Git Worktree 沙盒隔离
	// ==================
	/** 创建 worktree */
	worktree_create: {
		input: { repoPath: string; branchName?: string };
		output: {
			worktreePath: string;
			branchName: string;
			isGitWorktree: boolean;
			createdAt: number;
		};
	};
	/** 列出所有 worktree */
	worktree_list: {
		input: { repoPath: string };
		output: Array<{
			worktreePath: string;
			branchName: string;
			head: string;
			isMain: boolean;
		}>;
	};
	/** 合并 worktree 变更回主分支 */
	worktree_merge: {
		input: { repoPath: string; worktreePath: string };
		output: {
			success: boolean;
			method: "merge" | "cherry-pick" | "patch";
			message: string;
			conflicts?: string[];
		};
	};
	/** 删除 worktree */
	worktree_remove: {
		input: { repoPath: string; worktreePath: string };
		output: { success: boolean; message: string };
	};
	/** 获取 worktree 相对于主分支的 diff */
	worktree_diff: {
		input: { repoPath: string; worktreePath: string };
		output: {
			diff: string;
			changedFiles: string[];
			stat: string;
		};
	};

	// ==================
	// 预览服务器（沙盒前端预览）
	// ==================
	/** 启动预览服务器 */
	preview_server_start: {
		input: {
			taskId: string;
			sandboxDir: string;
			mode?: "dev" | "static" | "single";
		};
		output: {
			port: number;
			url: string;
			mode: "dev" | "static" | "single";
			processId?: number;
		};
	};
	/** 停止预览服务器 */
	preview_server_stop: {
		input: { taskId: string };
		output: { success: boolean };
	};
	/** 查询预览服务器状态 */
	preview_server_status: {
		input: { taskId: string };
		output: {
			running: boolean;
			mode?: "dev" | "static" | "single";
			url?: string;
			port?: number;
			ready?: boolean;
		};
	};
	/** 弹出独立预览窗口 */
	preview_window_open: {
		input: { taskId: string; url?: string };
		output: { windowId: number };
	};
}
