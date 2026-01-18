import type { Logger } from "../logging/types";
import { createDbContext } from "./client";
import { runMigrations } from "./migrate";

export async function initDatabase({ logger }: { logger: Logger }) {
	const ctx = createDbContext();
	await runMigrations(ctx);
	logger.info({ msg: "db ready", filePath: ctx.filePath });
	return ctx;
}
