import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import { resolveProviderApiKey } from "../../llm/invoke";
import {
	getOpenAICompatibleAuthHeaders,
	normalizeOpenAICompatibleBaseUrl,
} from "../../llm/providerHttp";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

async function getConfigValue(
	db: DbContext,
	key: string,
): Promise<string | null> {
	const rows = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: [key],
	});
	if (rows.rows.length === 0) return null;
	const v = rows.rows[0]?.value;
	return v === null || v === undefined ? null : String(v);
}

async function findProviderForModel(
	db: DbContext,
	model: string,
): Promise<{
	id: string;
	provider_type: string;
	api_key?: string;
	api_base?: string;
	template_id?: string;
	metadata?: Record<string, unknown>;
} | null> {
	const providerRows = await db.client.execute(
		`SELECT * FROM providers WHERE is_enabled = 1`,
	);
	for (const row of providerRows.rows as Array<Record<string, unknown>>) {
		let models: string[] = [];
		try {
			models = JSON.parse(String(row.models ?? "[]")) as string[];
		} catch {
			continue;
		}
		if (!models.includes(model)) continue;
		let metadata: Record<string, unknown> = {};
		try {
			metadata = JSON.parse(String(row.metadata ?? "{}")) as Record<
				string,
				unknown
			>;
		} catch {
			metadata = {};
		}
		return {
			id: String(row.id),
			provider_type: String(row.provider_type),
			api_key: row.api_key ? String(row.api_key) : undefined,
			api_base: row.api_base ? String(row.api_base) : undefined,
			template_id: row.template_id ? String(row.template_id) : undefined,
			metadata,
		};
	}
	return null;
}

async function callEmbeddings(
	db: DbContext,
	provider: {
		id: string;
		provider_type: string;
		api_key?: string;
		api_base?: string;
		template_id?: string;
		metadata?: Record<string, unknown>;
	},
	model: string,
	inputs: string[],
): Promise<number[][]> {
	if (provider.provider_type === "anthropic") {
		throw new Error("当前 Provider 不支持 embeddings（anthropic）");
	}
	const apiKey = await resolveProviderApiKey(db, provider.id, provider.api_key);
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		provider,
		"https://api.openai.com",
	);
	const resp = await fetch(`${baseUrl}/embeddings`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...getOpenAICompatibleAuthHeaders(provider, apiKey),
		},
		body: JSON.stringify({ model, input: inputs }),
	});
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`Embeddings 请求失败: ${resp.status} - ${text}`);
	}
	const data = (await resp.json()) as {
		data: Array<{ embedding: number[] }>;
	};
	return data.data.map((d) => d.embedding);
}

export function createKbEmbeddingHandlers(db: DbContext) {
	const kb_get_embedding_stats: Handler<
		"kb_get_embedding_stats"
	> = async () => {
		const embeddingModelRaw = await getConfigValue(db, "kb.embedding_model");
		const embedding_model =
			embeddingModelRaw && embeddingModelRaw.trim()
				? embeddingModelRaw.trim()
				: null;

		const totalRows = await db.client.execute({
			sql: `SELECT COUNT(1) AS c FROM note_chunks`,
			args: [],
		});
		const total_chunks = Number((totalRows.rows[0] as any)?.c ?? 0);

		if (!embedding_model) {
			return {
				embedding_model: null,
				total_chunks,
				embedded_chunks: 0,
				missing_chunks: total_chunks,
			};
		}

		const embeddedRows = await db.client.execute({
			sql: `SELECT COUNT(1) AS c FROM note_chunk_embeddings WHERE model = ?`,
			args: [embedding_model],
		});
		const embedded_chunks = Number((embeddedRows.rows[0] as any)?.c ?? 0);
		const missing_chunks = Math.max(0, total_chunks - embedded_chunks);

		return { embedding_model, total_chunks, embedded_chunks, missing_chunks };
	};

	const kb_embeddings_rebuild: Handler<"kb_embeddings_rebuild"> = async (
		_event,
		input,
	) => {
		const embedding_model = String(input.embedding_model ?? "").trim();
		if (!embedding_model) throw new Error("embedding_model 不能为空");

		const noteId = input.note_id ? String(input.note_id) : null;
		const force = Boolean(input.force);
		const batchSize =
			typeof input.batch_size === "number" && Number.isFinite(input.batch_size)
				? Math.max(1, Math.min(128, Math.floor(input.batch_size)))
				: 32;

		const maxCharsRaw = await getConfigValue(db, "kb.embedding_max_chars");
		const maxChars = Math.max(
			32,
			Math.min(4096, Number.parseInt(maxCharsRaw || "", 10) || 480),
		);

		const provider = await findProviderForModel(db, embedding_model);
		if (!provider) throw new Error(`未找到可用 Provider: ${embedding_model}`);

		let updated = 0;
		let cursorCreatedAt: number | null = null;
		let cursorId: string | null = null;

		for (;;) {
			const args: Array<string | number> = [embedding_model];
			let sql = `
        SELECT nc.id AS chunk_id, nc.content AS content, nc.created_at AS created_at
        FROM note_chunks nc
      `;

			if (!force) {
				sql += `
          LEFT JOIN note_chunk_embeddings e
            ON e.chunk_id = nc.id AND e.model = ?
        `;
				args.push(embedding_model);
			}

			sql += ` WHERE 1=1 `;

			if (noteId) {
				sql += ` AND nc.note_id = ? `;
				args.push(noteId);
			}
			if (!force) {
				sql += ` AND e.chunk_id IS NULL `;
			}

			if (cursorCreatedAt !== null && cursorId !== null) {
				sql += ` AND (nc.created_at > ? OR (nc.created_at = ? AND nc.id > ?)) `;
				args.push(cursorCreatedAt, cursorCreatedAt, cursorId);
			}

			sql += ` ORDER BY nc.created_at ASC, nc.id ASC LIMIT ?`;
			args.push(batchSize);

			const rows = await db.client.execute({ sql, args });
			const chunks = rows.rows as unknown as Array<{
				chunk_id: unknown;
				content: unknown;
				created_at: unknown;
			}>;
			if (chunks.length === 0) break;

			const last = chunks[chunks.length - 1];
			cursorCreatedAt = Number(last.created_at ?? cursorCreatedAt ?? 0);
			cursorId = String(last.chunk_id ?? cursorId ?? "");

			const inputs = chunks.map((c) =>
				String(c.content ?? "")
					.replace(/\0/g, "")
					.slice(0, maxChars),
			);
			const vectors = await callEmbeddings(
				db,
				provider,
				embedding_model,
				inputs,
			);

			const now = Date.now();
			for (let i = 0; i < chunks.length; i++) {
				const chunkId = String(chunks[i].chunk_id);
				const embedding = vectors[i] || [];
				const dims = embedding.length;
				const embedding_json = JSON.stringify(embedding);
				// Float32Array → Buffer（BLOB 列），约省 80% 空间
				const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);

				if (force) {
					await db.client.execute({
						sql: `INSERT INTO note_chunk_embeddings (chunk_id, model, dims, embedding_json, embedding, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(chunk_id, model) DO UPDATE SET
                dims = excluded.dims,
                embedding_json = excluded.embedding_json,
                embedding = excluded.embedding,
                updated_at = excluded.updated_at`,
						args: [chunkId, embedding_model, dims, embedding_json, embeddingBlob, now, now],
					});
				} else {
					await db.client.execute({
						sql: `INSERT OR IGNORE INTO note_chunk_embeddings (chunk_id, model, dims, embedding_json, embedding, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
						args: [chunkId, embedding_model, dims, embedding_json, embeddingBlob, now, now],
					});
				}
				updated++;
			}
		}

		return updated;
	};

	return { kb_get_embedding_stats, kb_embeddings_rebuild };
}
