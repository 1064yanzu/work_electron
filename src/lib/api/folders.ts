import type {
	CreateFolderPayload,
	Folder,
	MoveSourcesToFolderPayload,
	UpdateFolderPayload,
	Uuid,
} from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function listFolders(projectId?: Uuid | null): Promise<Folder[]> {
	return await safeInvoke("list_folders", { projectId: projectId ?? null });
}

export async function createFolder(
	payload: CreateFolderPayload,
): Promise<Folder> {
	return await safeInvoke("create_folder", { payload });
}

export async function updateFolder(
	payload: UpdateFolderPayload,
): Promise<Folder> {
	return await safeInvoke("update_folder", { payload });
}

export async function deleteFolder(id: Uuid): Promise<void> {
	return await safeInvoke("delete_folder", { id });
}

export async function moveSourcesToFolder(
	payload: MoveSourcesToFolderPayload,
): Promise<number> {
	return await safeInvoke("move_sources_to_folder", { payload });
}
