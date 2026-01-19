import type { Logger } from "../logging/types";
import { createDbContext } from "./client";
import { runMigrations } from "./migrate";
import { seedCoreProviders } from "./seedCoreProviders";

export async function initDatabase({ logger }: { logger: Logger }) {
	const ctx = createDbContext();
	await runMigrations(ctx);
	await seedCoreProviders(ctx);
	logger.info({ msg: "db ready", filePath: ctx.filePath });
	return ctx;
}
