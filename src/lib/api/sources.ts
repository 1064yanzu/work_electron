import type { Card, Folder, OutputAsset, Source, SourceDetail, Uuid } from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function listFolders(projectId?: Uuid | null): Promise<Folder[]> {
	return await safeInvoke("list_folders", { projectId: projectId ?? null });
}

export async function listSources(): Promise<Source[]> {
	return await safeInvoke("list_sources");
}

export async function listOutputAssets(): Promise<OutputAsset[]> {
	return await safeInvoke("list_output_assets");
}

export async function listCards(): Promise<Card[]> {
	return await safeInvoke("list_cards");
}

export async function getSourceDetail(id: Uuid): Promise<SourceDetail> {
	return await safeInvoke("get_source_detail", { id });
}

export async function getCardImagePath(relativePath: string): Promise<string> {
	return await safeInvoke("get_card_image_path", { relativePath });
}
