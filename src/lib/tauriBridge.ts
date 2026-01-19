import type { InvokeArgs } from "./tauriCompat";
import { isDesktopEnvironment, invoke as rawInvoke } from "./tauriCompat";

export const isTauriEnvironment = (): boolean => isDesktopEnvironment();

export async function safeInvoke<T>(
	command: string,
	args?: InvokeArgs,
): Promise<T> {
	if (!isDesktopEnvironment()) {
		throw new Error("TAURI_UNAVAILABLE");
	}
	return rawInvoke<T>(command, args);
}

export function isTauriUnavailableError(error: unknown): boolean {
	if (error instanceof Error) {
		return error.message.includes("TAURI_UNAVAILABLE");
	}
	return false;
}
