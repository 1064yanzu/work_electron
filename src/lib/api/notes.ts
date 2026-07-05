import type {
	CreateNotePayload,
	Note,
	UpdateNotePayload,
	Uuid,
} from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function createNote(payload: CreateNotePayload): Promise<Note> {
	return await safeInvoke("create_note", { payload });
}

/**
 * 笔记列表。默认瘦身：不返回 content_html 大字段；
 * 详情/编辑等需要 html 的场景传 { include_html: true }。
 */
export async function listNotes(options?: {
	source_id?: Uuid;
	include_html?: boolean;
}): Promise<Note[]> {
	return await safeInvoke("list_notes", {
		...(options?.source_id ? { source_id: options.source_id } : {}),
		...(options?.include_html ? { include_html: true } : {}),
	});
}

export async function updateNote(payload: UpdateNotePayload): Promise<Note> {
	return await safeInvoke("update_note", { payload });
}

export async function deleteNote(id: Uuid): Promise<void> {
	return await safeInvoke("delete_note", { id });
}
