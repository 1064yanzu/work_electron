import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { Card } from "../../../shared/types";
import type { DbContext } from "../../db/client";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function parseCard(row: Record<string, unknown>): Card {
	return {
		id: row.id as string,
		title: row.title as string,
		text: row.text as string,
		image_path: row.image_path as string,
		source_url: (row.source_url as string) || undefined,
		theme_id: (row.theme_id as string) || undefined,
		font_id: (row.font_id as string) || undefined,
		aspect_ratio: (row.aspect_ratio as string) || undefined,
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
	};
}

function resolveCardImageAbsolutePath(imagePath: string) {
	if (!imagePath) return "";
	if (path.isAbsolute(imagePath)) return imagePath;
	const userData = app.getPath("userData");
	return path.join(userData, "cards", imagePath);
}

export function createCardHandlers(db: DbContext) {
	const listCards: Handler<"list_cards"> = async () => {
		const rows = await db.client.execute(
			`SELECT * FROM cards ORDER BY created_at DESC`,
		);
		return rows.rows.map((r) => parseCard(r as Record<string, unknown>));
	};

	const getCard: Handler<"get_card"> = async (_event, input) => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM cards WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0) {
			throw new Error("Card not found");
		}
		return parseCard(rows.rows[0] as Record<string, unknown>);
	};

	const deleteCard: Handler<"delete_card"> = async (_event, input) => {
		// D6：删除卡片时同步删除其图片文件。
		// 安全约束：仅删除本应用受管目录（userData/cards）内的文件，绝不触碰目录外的任意路径。
		try {
			const rows = await db.client.execute({
				sql: `SELECT image_path FROM cards WHERE id = ?`,
				args: [input.id],
			});
			const imagePath = rows.rows[0]?.image_path as string | undefined;
			if (imagePath) {
				const absolutePath = resolveCardImageAbsolutePath(imagePath);
				const managedDir = path.join(app.getPath("userData"), "cards");
				const relative = path.relative(managedDir, absolutePath);
				const insideManagedDir =
					relative.length > 0 &&
					!relative.startsWith("..") &&
					!path.isAbsolute(relative);
				if (insideManagedDir) {
					await fs.unlink(absolutePath).catch(() => {
						// 图片可能已不存在，忽略
					});
				}
			}
		} catch {
			// 删图片失败不阻断删卡片
		}

		await db.client.execute({
			sql: `DELETE FROM cards WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	const getCardImagePath: Handler<"get_card_image_path"> = async (
		_event,
		input,
	) => {
		return { path: resolveCardImageAbsolutePath(input.image_path) };
	};

	return {
		list_cards: listCards,
		get_card: getCard,
		delete_card: deleteCard,
		get_card_image_path: getCardImagePath,
	};
}
