import type { FileRecord, StorageSettings } from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function getStorageSettings(): Promise<StorageSettings> {
	return await safeInvoke("storage_get_settings");
}

export async function updateStorageSettings(payload: {
	settings: Partial<StorageSettings>;
	migrate_existing?: boolean;
}): Promise<{
	settings: StorageSettings;
	migration?: { backup_path: string; sources: number; outputs: number };
}> {
	return await safeInvoke("storage_update_settings", payload);
}

export async function pickStorageDirectory(): Promise<{ path: string | null }> {
	return await safeInvoke("storage_pick_directory");
}

export async function pickSystemDirectory(
	title?: string,
): Promise<{ path: string | null }> {
	return await safeInvoke("system_pick_directory", { title });
}

export async function revealVaultRoot(): Promise<{
	success: boolean;
	error?: string;
}> {
	return await safeInvoke("storage_reveal_vault_root");
}

export async function fileList(params?: {
	project_id?: string;
	scope?: "global" | "project";
	themes?: string[];
	tags?: string[];
	include_deleted?: boolean;
	entity_type?: "source" | "output" | "all";
}): Promise<FileRecord[]> {
	return await safeInvoke("file_list", params ?? {});
}

export async function fileMove(payload: {
	id: string;
	entity_type?: "source" | "output";
	destination: "project_docs" | "global_shared" | "global_webclips" | "theme";
	project_id?: string;
	theme_id?: string;
}): Promise<FileRecord> {
	return await safeInvoke("file_move", payload);
}

export async function fileDelete(payload: {
	id: string;
	entity_type?: "source" | "output";
}): Promise<{ success: boolean }> {
	return await safeInvoke("file_delete", payload);
}

export async function fileRestore(payload: {
	id: string;
	entity_type?: "source" | "output";
}): Promise<{ success: boolean }> {
	return await safeInvoke("file_restore", payload);
}

export async function fileRevealInFinder(payload: {
	id: string;
	entity_type?: "source" | "output";
}): Promise<{ success: boolean; path: string }> {
	return await safeInvoke("file_reveal_in_finder", payload);
}

export async function fileSetScope(payload: {
	id: string;
	entity_type?: "source" | "output";
	scope: "global" | "project";
	project_id?: string;
}): Promise<FileRecord> {
	return await safeInvoke("file_set_scope", payload);
}

export async function fileSetTags(payload: {
	id: string;
	entity_type?: "source" | "output";
	tags: string[];
}): Promise<FileRecord> {
	return await safeInvoke("file_set_tags", payload);
}

export async function moveFileSafe(payload: {
	src: string;
	dest: string;
	create_dirs?: boolean;
}): Promise<{ success: boolean }> {
	return await safeInvoke("move_file_safe", payload);
}

export async function deleteFileSafe(
	path: string,
): Promise<{ success: boolean }> {
	return await safeInvoke("delete_file_safe", { path });
}

export async function revealFileSafe(
	path: string,
): Promise<{ success: boolean }> {
	return await safeInvoke("reveal_file_safe", { path });
}
