/**
 * Git Worktree IPC Handler
 * 处理前端与 worktree 服务之间的通信
 */
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { Logger } from "../../logging/types";
import { getWorktreeService } from "../../services/worktreeService";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createWorktreeHandlers(deps: { logger: Logger }) {
	const service = getWorktreeService(deps.logger);

	const worktree_create: Handler<"worktree_create"> = async (_event, input) => {
		const result = await service.createWorktree(
			input.repoPath,
			input.branchName,
		);
		return result;
	};

	const worktree_list: Handler<"worktree_list"> = async (_event, input) => {
		return service.listWorktrees(input.repoPath);
	};

	const worktree_merge: Handler<"worktree_merge"> = async (_event, input) => {
		return service.mergeWorktree(input.repoPath, input.worktreePath);
	};

	const worktree_remove: Handler<"worktree_remove"> = async (_event, input) => {
		return service.removeWorktree(input.repoPath, input.worktreePath);
	};

	const worktree_diff: Handler<"worktree_diff"> = async (_event, input) => {
		return service.getWorktreeDiff(input.repoPath, input.worktreePath);
	};

	return {
		worktree_create,
		worktree_list,
		worktree_merge,
		worktree_remove,
		worktree_diff,
	};
}
