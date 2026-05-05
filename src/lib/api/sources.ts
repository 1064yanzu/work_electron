import type {
	CreateSourcePayload,
	SearchSourcePayload,
	Source,
	SourceDetail,
	UpdateSourcePayload,
	Uuid,
} from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function createSource(
	payload: CreateSourcePayload,
): Promise<Source> {
	return await safeInvoke("create_source", { payload });
}

export async function listSources(): Promise<Source[]> {
	return await safeInvoke("list_sources");
}

export async function searchSources(
	payload?: SearchSourcePayload,
): Promise<Source[]> {
	return await safeInvoke("search_sources", { payload });
}

export async function getSource(id: Uuid): Promise<Source> {
	return await safeInvoke("get_source", { id });
}

export async function getSourceDetail(id: Uuid): Promise<SourceDetail> {
	return await safeInvoke("get_source_detail", { id });
}

export async function updateSource(
	payload: UpdateSourcePayload,
): Promise<Source> {
	return await safeInvoke("update_source", { payload });
}

export async function deleteSource(id: Uuid): Promise<void> {
	return await safeInvoke("delete_source", { id });
}
