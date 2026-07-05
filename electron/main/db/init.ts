import type { Logger } from "../logging/types";
import { getDbContext, initializePragmas } from "./client";
import { runMigrations } from "./migrate";
import { seedCoreProviders } from "./seedCoreProviders";

export async function initDatabase({ logger }: { logger: Logger }) {
	// 全应用统一走单例连接（B7：消除 createDbContext() 被直接调用产生的双连接并存问题）。
	const ctx = getDbContext();
	await initializePragmas(ctx);
	if (!ctx.walEnabled) {
		logger.warn({
			msg: "SQLite WAL mode not enabled, falling back to DELETE journal mode (possible network volume or unsupported filesystem)",
			filePath: ctx.filePath,
		});
	}
	await runMigrations(ctx);
	await seedCoreProviders(ctx);
	logger.info({
		msg: "db ready",
		filePath: ctx.filePath,
		walEnabled: ctx.walEnabled,
	});
	return ctx;
}
