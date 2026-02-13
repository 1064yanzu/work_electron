import type { SourceDetail, Uuid } from "../../types";
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

export async function getSourceDetail(id: Uuid): Promise<SourceDetail> {
	return await safeInvoke("get_source_detail", { id });
}
