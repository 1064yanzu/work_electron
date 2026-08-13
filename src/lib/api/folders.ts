import type {
	CreateFolderPayload,
	Folder,
	MoveSourcesToFolderPayload,
	UpdateFolderPayload,
	Uuid,
} from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function listFolders(projectId?: Uuid | null): Promise<Folder[]> {
	// schema 的 project_id 是可选字段，缺省即「全部」；显式传 null 会被后端当成值，
	// 所以这里省略键而不是传 null（原先靠 tauriCompat 的魔法映射做这层转换）。
	return await safeInvoke(
		"list_folders",
		projectId ? { project_id: projectId } : {},
	);
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
