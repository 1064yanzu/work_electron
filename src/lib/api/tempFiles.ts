import { safeInvoke } from "../tauriBridge";

export interface SaveTempFilePayload {
	content: string;
	extension?: string;
	prefix?: string;
	encoding?: "utf-8" | "base64";
}

export interface TempFileResult {
	path: string;
	size: number;
}

export async function saveTempFile(
	payload: SaveTempFilePayload,
): Promise<TempFileResult> {
	return safeInvoke<TempFileResult>("save_temp_file", { payload });
}

export async function getAgentSandboxDir(
	taskId: string,
): Promise<{ path: string }> {
	return safeInvoke<{ path: string }>("agent_get_sandbox_dir", { taskId });
}
