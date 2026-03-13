/**
 * CLI Binary Detection IPC Handlers
 *
 * 为渲染进程提供 CLI 二进制检测和缓存管理的 IPC 接口。
 */

import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import {
	detectCliBinary,
	invalidateCliCache,
} from "../../services/cliBinaryDetector";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createCliBinaryHandlers() {
	const cli_detect_binary: Handler<"cli_detect_binary"> = async (
		_event,
		input,
	) => {
		const result = await detectCliBinary(input.backend, {
			userConfiguredPath: input.userConfiguredPath,
		});
		return {
			backend: result.backend,
			path: result.path,
			source: result.source,
			version: result.version,
			detectedAt: result.detectedAt,
			error: result.error,
		};
	};

	const cli_invalidate_cache: Handler<"cli_invalidate_cache"> = async (
		_event,
		input,
	) => {
		invalidateCliCache(input.backend);
		return { success: true };
	};

	return {
		cli_detect_binary,
		cli_invalidate_cache,
	};
}
