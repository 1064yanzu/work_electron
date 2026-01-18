/**
 * Notes IPC Handlers
 */
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { Note } from "../../../shared/types";
import type { DbContext } from "../../db/client";
import { buildChunks } from "../../kb/chunking";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function parseNote(row: Record<string, unknown>): Note {
	return {
		id: row.id as string,
		source_id: row.source_id as string | undefined,
		content: row.content as string,
		content_html: row.content_html as string | undefined,
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
	};
}

export function createNoteHandlers(db: DbContext) {
	const now = () => Date.now();

	const listNotes: Handler<"list_notes"> = async (_event, input) => {
		let sql = `SELECT * FROM notes`;
		const args: (string | number)[] = [];

		if (input.source_id) {
			sql += ` WHERE source_id = ?`;
			args.push(input.source_id);
		}
		sql += ` ORDER BY updated_at DESC`;

		const rows = await db.client.execute({ sql, args });
		return rows.rows.map((row) => parseNote(row as Record<string, unknown>));
	};

	const createNote: Handler<"create_note"> = async (_event, input) => {
		const id = randomUUID();
		const timestamp = now();

		await db.client.execute({
			sql: `INSERT INTO notes (id, source_id, content, content_html, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.source_id ?? null,
				input.content,
				input.content_html ?? null,
				timestamp,
				timestamp,
			],
		});

		// 异步构建 chunks（简化版，同步执行）
		await rebuildNoteChunks(db, id, input.source_id ?? null, input.content);

		return {
			id,
			source_id: input.source_id,
			content: input.content,
			content_html: input.content_html,
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const updateNote: Handler<"update_note"> = async (_event, input) => {
		const updates: string[] = [];
		const args: (string | number | null)[] = [];
		let shouldRebuildChunks = false;
		let newContent: string | undefined;

		if (input.content !== undefined) {
			updates.push("content = ?");
			args.push(input.content);
			shouldRebuildChunks = true;
			newContent = input.content;
		}
		if (input.content_html !== undefined) {
			updates.push("content_html = ?");
			args.push(input.content_html ?? null);
		}

		const timestamp = now();
		updates.push("updated_at = ?");
		args.push(timestamp);
		args.push(input.id);

		await db.client.execute({
			sql: `UPDATE notes SET ${updates.join(", ")} WHERE id = ?`,
			args,
		});

		// 如果 content 变化，重建 chunks
		if (shouldRebuildChunks && newContent !== undefined) {
			const noteRows = await db.client.execute({
				sql: `SELECT source_id FROM notes WHERE id = ?`,
				args: [input.id],
			});
			const sourceId =
				noteRows.rows.length > 0
					? (noteRows.rows[0].source_id as string | null)
					: null;
			await rebuildNoteChunks(db, input.id, sourceId, newContent);
		}

		const rows = await db.client.execute({
			sql: `SELECT * FROM notes WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0) throw new Error(`Note not found: ${input.id}`);
		return parseNote(rows.rows[0] as Record<string, unknown>);
	};

	const deleteNote: Handler<"delete_note"> = async (_event, input) => {
		// chunks 通过外键级联删除
		await db.client.execute({
			sql: `DELETE FROM notes WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	const kbChunkRebuild: Handler<"kb_chunk_rebuild"> = async (_event, input) => {
		const noteRows = await db.client.execute({
			sql: `SELECT * FROM notes WHERE id = ?`,
			args: [input.note_id],
		});
		if (noteRows.rows.length === 0) {
			throw new Error(`Note not found: ${input.note_id}`);
		}

		const note = noteRows.rows[0];
		const sourceId = note.source_id as string | null;
		const content = note.content as string;

		const count = await rebuildNoteChunks(db, input.note_id, sourceId, content);
		return { success: true, chunk_count: count };
	};

	return {
		list_notes: listNotes,
		create_note: createNote,
		update_note: updateNote,
		delete_note: deleteNote,
		kb_chunk_rebuild: kbChunkRebuild,
	};
}

/**
 * 重建笔记分块
 */
async function rebuildNoteChunks(
	db: DbContext,
	noteId: string,
	sourceId: string | null,
	content: string,
): Promise<number> {
	const now = Date.now();

	// 删除旧 chunks
	await db.client.execute({
		sql: `DELETE FROM note_chunks WHERE note_id = ?`,
		args: [noteId],
	});

	// 切分内容
	const chunks = buildChunks(content.trim());

	// 写入新 chunks
	for (let i = 0; i < chunks.length; i++) {
		const chunkId = randomUUID();
		await db.client.execute({
			sql: `INSERT INTO note_chunks (id, note_id, source_id, chunk_index, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
			args: [chunkId, noteId, sourceId, i, chunks[i], now, now],
		});
	}

	return chunks.length;
}
