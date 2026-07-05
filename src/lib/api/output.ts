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

/**
 * 列表瘦身版：content 只带前 200 字符摘要（附 content_length），不拉全文。
 * 列表/预览场景用这个；需要全文时用 getOutputAsset / listOutputAssets。
 */
export async function listOutputAssetsMeta(): Promise<OutputAsset[]> {
	return await safeInvoke("list_output_assets", { meta_only: true });
}

/** 按 id 拉取单个产物全文（详情/注入上下文场景） */
export async function getOutputAsset(id: Uuid): Promise<OutputAsset | null> {
	const rows = await safeInvoke<OutputAsset[]>("list_output_assets", { id });
	return rows[0] ?? null;
}

export async function updateOutputAsset(
	payload: UpdateOutputPayload,
): Promise<OutputAsset> {
	return await safeInvoke("update_output_asset", { payload });
}

export async function deleteOutputAsset(id: Uuid): Promise<void> {
	return await safeInvoke("delete_output_asset", { id });
}
