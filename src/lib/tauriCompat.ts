import type { IPCSchema } from "../../electron/shared/ipc-schema";

export type InvokeArgs = Record<string, unknown>;

/**
 * 合法 IPC 命令名 = ipc-schema 的 key。
 *
 * 这是渲染端对「单一事实源」的编译期约束：调用不存在的命令会直接编译报错，
 * 而不是运行时被 catch 吞掉后静默失效（历史上 backup_to_local /
 * agent_update_message 等 12 个幽灵命令都是这么潜伏下来的）。
 */
export type IpcCommand = keyof IPCSchema & string;

export function isDesktopEnvironment() {
	return (
		typeof window !== "undefined" &&
		typeof window.electronAPI?.invoke === "function"
	);
}

export async function invoke<T>(
	command: IpcCommand,
	args?: InvokeArgs,
): Promise<T> {
	if (!isDesktopEnvironment()) {
		throw new Error("TAURI_UNAVAILABLE");
	}

	const input = (() => {
		const a = (args ?? {}) as Record<string, unknown>;
		// 历史约定：部分调用点用 { payload: {...} } 包裹入参，这里解包
		if ("payload" in a) {
			const p = a.payload;
			if (p === undefined) return {};
			if (p !== null && typeof p === "object")
				return p as Record<string, unknown>;
		}
		return a;
	})();

	return window.electronAPI.invoke(
		command as never,
		input as never,
	) as Promise<T>;
}

export function convertFileSrc(filePath: string) {
	const normalized = filePath.replace(/\\/g, "/");
	if (normalized.startsWith("file://")) return normalized;
	const prefix = normalized.startsWith("/") ? "file://" : "file:///";
	return `${prefix}${encodeURI(normalized)}`;
}
