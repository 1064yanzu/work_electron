import type { Source } from "../../types";
import { safeInvoke } from "../tauriBridge";

export interface ArtifactMetadata {
	id: string;
	session_id: string;
	file_name: string;
	file_path: string;
	file_type: string;
	file_size: number;
	mime_type: string;
	tool_call_id?: string;
	description?: string;
	created_at: number;
	expires_at?: number;
}

export interface ArtifactSettings {
	storage_path: string;
	auto_cleanup: boolean;
	retention_days: number;
	max_per_session: number;
	max_total_size: number;
}

export interface ArtifactCleanupResult {
	deleted_count: number;
	freed_bytes: number;
	errors: string[];
}

export interface SaveArtifactPayload {
	session_id: string;
	file_name: string;
	content: string;
	encoding?: "utf-8" | "base64";
	tool_call_id?: string;
	description?: string;
}

export async function saveArtifact(
	payload: SaveArtifactPayload,
): Promise<ArtifactMetadata> {
	return await safeInvoke("artifact_save", { ...payload });
}

export async function listArtifacts(
	sessionId?: string,
	limit?: number,
): Promise<ArtifactMetadata[]> {
	return await safeInvoke("artifact_list", { session_id: sessionId, limit });
}

export async function getArtifact(
	id: string,
): Promise<ArtifactMetadata | null> {
	return await safeInvoke("artifact_get", { id });
}

export async function deleteArtifact(
	id: string,
): Promise<{ success: boolean }> {
	return await safeInvoke("artifact_delete", { id });
}

export async function revealArtifact(
	id: string,
): Promise<{ success: boolean }> {
	return await safeInvoke("artifact_reveal", { id });
}

export async function downloadArtifact(
	id: string,
	destPath?: string,
): Promise<{ path: string }> {
	return await safeInvoke("artifact_download", { id, dest_path: destPath });
}

export async function importArtifactToLibrary(
	id: string,
	folderId?: string,
): Promise<Source> {
	return await safeInvoke("artifact_import_to_library", {
		id,
		folder_id: folderId,
	});
}

export async function cleanupArtifacts(
	force?: boolean,
): Promise<ArtifactCleanupResult> {
	return await safeInvoke("artifact_cleanup", { force });
}

export async function getArtifactSettings(): Promise<ArtifactSettings> {
	return await safeInvoke("artifact_get_settings");
}

export async function updateArtifactSettings(
	settings: Partial<ArtifactSettings>,
): Promise<ArtifactSettings> {
	return await safeInvoke("artifact_update_settings", settings);
}
