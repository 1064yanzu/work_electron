/**
 * styleProfile/feedback.ts — 风格反馈收集
 */
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema, StyleFeedback } from "../../../../shared/ipc-schema";
import type { DbContext } from "../../../db/client";
import { randomUUID } from "node:crypto";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createStyleFeedbackHandlers(db: DbContext) {
	const submitFeedback: Handler<"style_feedback_submit"> = async (
		_event,
		input,
	) => {
		const id = randomUUID();
		const now = Date.now();

		await db.client.execute({
			sql: `INSERT INTO style_feedback (id, profile_id, feedback_type, session_context, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.profile_id,
				input.feedback_type,
				input.session_context ?? null,
				input.note ?? null,
				now,
			],
		});

		return {
			id,
			profile_id: input.profile_id,
			feedback_type: input.feedback_type,
			session_context: input.session_context ?? null,
			note: input.note ?? null,
			created_at: now,
		} satisfies StyleFeedback;
	};

	const listFeedback: Handler<"style_feedback_list"> = async (
		_event,
		input,
	) => {
		const limit = input.limit ?? 50;
		const rows = await db.client.execute({
			sql: `SELECT * FROM style_feedback WHERE profile_id = ? ORDER BY created_at DESC LIMIT ?`,
			args: [input.profile_id, limit],
		});

		return rows.rows.map((r) => {
			const row = r as Record<string, unknown>;
			return {
				id: row.id as string,
				profile_id: row.profile_id as string,
				feedback_type: row.feedback_type as StyleFeedback["feedback_type"],
				session_context: (row.session_context as string | null) ?? null,
				note: (row.note as string | null) ?? null,
				created_at: row.created_at as number,
			} satisfies StyleFeedback;
		});
	};

	return {
		style_feedback_submit: submitFeedback,
		style_feedback_list: listFeedback,
	};
}
