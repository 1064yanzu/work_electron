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

export async function listNotes(): Promise<Note[]> {
	return await safeInvoke("list_notes");
}

export async function updateNote(payload: UpdateNotePayload): Promise<Note> {
	return await safeInvoke("update_note", { payload });
}

export async function deleteNote(id: Uuid): Promise<void> {
	return await safeInvoke("delete_note", { id });
}
