import type { DbContext } from "./client";
import { initSql } from "./migrations/initSql";

export async function runMigrations(ctx: DbContext) {
	await ctx.client.executeMultiple(initSql);
}
