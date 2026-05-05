import type {
	CreateOutputPayload,
	OutputAsset,
	UpdateOutputPayload,
	Uuid,
} from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function createOutputAsset(
	payload: CreateOutputPayload,
): Promise<OutputAsset> {
	return await safeInvoke("create_output_asset", { payload });
}

export async function listOutputAssets(): Promise<OutputAsset[]> {
	return await safeInvoke("list_output_assets");
}

export async function updateOutputAsset(
	payload: UpdateOutputPayload,
): Promise<OutputAsset> {
	return await safeInvoke("update_output_asset", { payload });
}

export async function deleteOutputAsset(id: Uuid): Promise<void> {
	return await safeInvoke("delete_output_asset", { id });
}
