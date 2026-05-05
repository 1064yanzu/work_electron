import type { NoteChunkSearchHit, Uuid } from "../../types";
import { safeInvoke } from "../tauriBridge";

export interface KbSearchChunksPayload {
	query: string;
	limit?: number;
	source_id?: Uuid;
}

export async function kbSearchChunks(
	payload: KbSearchChunksPayload,
): Promise<NoteChunkSearchHit[]> {
	return await safeInvoke("kb_search_chunks", { payload });
}

export interface KbEmbeddingStats {
	embedding_model: string | null;
	total_chunks: number;
	embedded_chunks: number;
	missing_chunks: number;
}

export async function kbGetEmbeddingStats(): Promise<KbEmbeddingStats> {
	return await safeInvoke("kb_get_embedding_stats");
}

export interface KbEmbeddingsRebuildPayload {
	embedding_model: string;
	note_id?: Uuid;
	force?: boolean;
	batch_size?: number;
}

export async function kbEmbeddingsRebuild(
	payload: KbEmbeddingsRebuildPayload,
): Promise<number> {
	return await safeInvoke("kb_embeddings_rebuild", { payload });
}
