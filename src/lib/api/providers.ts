import type {
	ApiKeyCheckResult,
	Provider,
	UpsertProviderPayload,
} from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function listProviders(): Promise<Provider[]> {
	return await safeInvoke("list_providers");
}

export async function upsertProvider(
	payload: UpsertProviderPayload,
): Promise<Provider> {
	return await safeInvoke("upsert_provider", { payload });
}

export async function deleteProvider(providerId: string): Promise<void> {
	return await safeInvoke("delete_provider", { id: providerId });
}

export async function setActiveModel(model: string): Promise<void> {
	return await safeInvoke("set_active_model", { model });
}

export async function getActiveModel(): Promise<string | null> {
	return await safeInvoke("get_active_model");
}

export async function checkProviderApiKey(
	providerId: string,
): Promise<ApiKeyCheckResult> {
	return await safeInvoke("check_provider_api_key", {
		provider_id: providerId,
	});
}
