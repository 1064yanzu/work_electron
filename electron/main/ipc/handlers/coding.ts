/**
 * Coding Workspace IPC Handlers
 * 桥接前端请求与 codingService
 */
import { dialog } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { CodingApprovalMode } from "../../../shared/coding-workspace";
import {
	getGitBranches,
	getGitHistory,
	getGitStatus,
	isGitRepo,
	readFileContent,
	readFileTree,
	gitAdd,
	gitUnstage,
	gitCommit,
	gitPush,
	gitPull,
	gitCheckout,
	gitCreateBranch,
	gitStash,
	gitDiscard,
} from "../../services/codingService";
import {
	revertFileContent,
	writeFileContent,
} from "../../services/codingFileWriteService";
import { startWatching, stopWatching } from "../../services/fileWatcherService";
import {
	getAllBackendCapabilityMatrices,
	getBackendCapabilityMatrix,
	getCodingWorkspaceProfile,
	readCodingWorkspaceMemory,
	updateCodingWorkspaceProfile,
	writeCodingWorkspaceMemory,
} from "../../services/codingWorkspaceService";

export function createCodingHandlers() {
	return {
		coding_select_directory: async (_event: IpcMainInvokeEvent) => {
			const result = await dialog.showOpenDialog({
				properties: ["openDirectory"],
				title: "选择项目目录",
			});
			return {
				path: result.canceled ? null : result.filePaths[0] || null,
			};
		},

		coding_select_files: async (
			_event: IpcMainInvokeEvent,
			input: { project_path?: string },
		) => {
			const result = await dialog.showOpenDialog({
				properties: ["openFile", "multiSelections"],
				title: "选择要加入上下文的文件",
				defaultPath: input.project_path,
			});
			return {
				paths: result.canceled ? [] : result.filePaths,
			};
		},

		coding_read_file_tree: async (
			_event: IpcMainInvokeEvent,
			input: { path: string; maxDepth?: number },
		) => {
			const tree = await readFileTree(input.path, input.maxDepth ?? 5);
			const gitRepo = await isGitRepo(input.path);
			return { tree, isGitRepo: gitRepo };
		},

		coding_git_status: async (
			_event: IpcMainInvokeEvent,
			input: { path: string },
		) => {
			const isRepo = await isGitRepo(input.path);
			if (!isRepo) {
				return {
					isGitRepo: false,
					status: null,
				};
			}
			const status = await getGitStatus(input.path);
			return {
				isGitRepo: true,
				status,
			};
		},

		coding_git_branches: async (
			_event: IpcMainInvokeEvent,
			input: { path: string },
		) => {
			const isRepo = await isGitRepo(input.path);
			if (!isRepo) {
				return {
					isGitRepo: false,
					branches: [],
				};
			}
			const branches = await getGitBranches(input.path);
			return {
				isGitRepo: true,
				branches,
			};
		},

		coding_git_history: async (
			_event: IpcMainInvokeEvent,
			input: { path: string; limit?: number },
		) => {
			const isRepo = await isGitRepo(input.path);
			if (!isRepo) {
				return {
					isGitRepo: false,
					commits: [],
				};
			}
			const commits = await getGitHistory(input.path, input.limit ?? 12);
			return {
				isGitRepo: true,
				commits,
			};
		},

		coding_read_file: async (
			_event: IpcMainInvokeEvent,
			input: { path: string; maxSize?: number },
		) => {
			return readFileContent(input.path, input.maxSize);
		},

		coding_workspace_profile_get: async (
			_event: IpcMainInvokeEvent,
			input: { project_path: string },
		) => {
			return getCodingWorkspaceProfile(input.project_path);
		},

		coding_workspace_profile_update: async (
			_event: IpcMainInvokeEvent,
			input: {
				projectPath: string;
				defaultBackend?: "claude-code" | "codex";
				defaultModel?: string;
				defaultApprovalMode?: CodingApprovalMode;
				memoryPolicy?: "manual" | "always";
			},
		) => {
			return updateCodingWorkspaceProfile(input);
		},

		coding_workspace_memory_read: async (
			_event: IpcMainInvokeEvent,
			input: { project_path: string },
		) => {
			return readCodingWorkspaceMemory(input.project_path);
		},

		coding_workspace_memory_write: async (
			_event: IpcMainInvokeEvent,
			input: {
				projectPath: string;
				target: "workspace" | "memory" | "rules";
				content: string;
			},
		) => {
			return writeCodingWorkspaceMemory(input);
		},

		coding_backend_capabilities_get: async (
			_event: IpcMainInvokeEvent,
			input: { backend?: "claude-code" | "codex" },
		) => {
			if (input.backend) {
				return getBackendCapabilityMatrix(input.backend);
			}
			return getAllBackendCapabilityMatrices();
		},

		coding_write_file: async (
			_event: IpcMainInvokeEvent,
			input: { path: string; content: string; createDirs?: boolean },
		) => {
			return writeFileContent(input.path, input.content, input.createDirs);
		},

		coding_revert_file: async (
			_event: IpcMainInvokeEvent,
			input: { path: string; content: string },
		) => {
			return revertFileContent(input.path, input.content);
		},

		coding_watch_start: async (
			_event: IpcMainInvokeEvent,
			input: { path: string; ignored?: string[] },
		) => {
			return startWatching(input.path, { ignored: input.ignored });
		},

		coding_watch_stop: async (
			_event: IpcMainInvokeEvent,
			input: { path: string },
		) => {
			return stopWatching(input.path);
		},

		// ==================
		// Git 写操作
		// ==================

		coding_git_add: async (
			_event: IpcMainInvokeEvent,
			input: { dirPath: string; files: string[] },
		) => {
			return gitAdd(input.dirPath, input.files);
		},

		coding_git_unstage: async (
			_event: IpcMainInvokeEvent,
			input: { dirPath: string; files: string[] },
		) => {
			return gitUnstage(input.dirPath, input.files);
		},

		coding_git_commit: async (
			_event: IpcMainInvokeEvent,
			input: { dirPath: string; message: string; amend?: boolean },
		) => {
			return gitCommit(input.dirPath, input.message, {
				amend: input.amend,
			});
		},

		coding_git_push: async (
			_event: IpcMainInvokeEvent,
			input: { dirPath: string; remote?: string; branch?: string },
		) => {
			return gitPush(input.dirPath, input.remote, input.branch);
		},

		coding_git_pull: async (
			_event: IpcMainInvokeEvent,
			input: { dirPath: string; remote?: string; branch?: string },
		) => {
			return gitPull(input.dirPath, input.remote, input.branch);
		},

		coding_git_checkout: async (
			_event: IpcMainInvokeEvent,
			input: { dirPath: string; branch: string },
		) => {
			return gitCheckout(input.dirPath, input.branch);
		},

		coding_git_create_branch: async (
			_event: IpcMainInvokeEvent,
			input: { dirPath: string; branchName: string; startPoint?: string },
		) => {
			return gitCreateBranch(input.dirPath, input.branchName, input.startPoint);
		},

		coding_git_stash: async (
			_event: IpcMainInvokeEvent,
			input: {
				dirPath: string;
				action: "push" | "pop" | "list";
				message?: string;
			},
		) => {
			return gitStash(input.dirPath, input.action, input.message);
		},

		coding_git_discard: async (
			_event: IpcMainInvokeEvent,
			input: { dirPath: string; files: string[] },
		) => {
			return gitDiscard(input.dirPath, input.files);
		},
	};
}
