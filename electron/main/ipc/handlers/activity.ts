import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function formatDateKey(tsMs: number) {
	const d = new Date(tsMs);
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

export function createActivityHandlers(db: DbContext) {
	const getDailyActivity: Handler<"get_daily_activity"> = async (_event, input) => {
		const days = Math.max(1, Math.min(3650, Math.floor(input.days || 1)));
		const now = Date.now();
		const start = now - (days - 1) * 24 * 60 * 60 * 1000;
		const startKey = formatDateKey(start);

		const rows = await db.client.execute({
			sql: `
        SELECT d AS date, SUM(c) AS count
        FROM (
          SELECT date(created_at / 1000, 'unixepoch') AS d, COUNT(*) AS c FROM sources WHERE created_at >= ? GROUP BY d
          UNION ALL
          SELECT date(created_at / 1000, 'unixepoch') AS d, COUNT(*) AS c FROM notes WHERE created_at >= ? GROUP BY d
          UNION ALL
          SELECT date(created_at / 1000, 'unixepoch') AS d, COUNT(*) AS c FROM output_assets WHERE created_at >= ? GROUP BY d
          UNION ALL
          SELECT date(created_at / 1000, 'unixepoch') AS d, COUNT(*) AS c FROM cards WHERE created_at >= ? GROUP BY d
          UNION ALL
          SELECT date(created_at / 1000, 'unixepoch') AS d, COUNT(*) AS c FROM agent_messages WHERE created_at >= ? GROUP BY d
        )
        WHERE d >= ?
        GROUP BY d
        ORDER BY d ASC
      `,
			args: [start, start, start, start, start, startKey],
		});

		const countsByDate = new Map<string, number>();
		for (const r of rows.rows) {
			const date = String((r as any).date);
			const count = Number((r as any).count ?? 0);
			countsByDate.set(date, count);
		}

		const result: Array<{ date: string; count: number }> = [];
		for (let i = 0; i < days; i += 1) {
			const ts = start + i * 24 * 60 * 60 * 1000;
			const key = formatDateKey(ts);
			result.push({ date: key, count: countsByDate.get(key) ?? 0 });
		}

		return result;
	};

	return { get_daily_activity: getDailyActivity };
}

