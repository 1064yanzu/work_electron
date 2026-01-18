import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql";
import { getDatabaseFilePath } from "./paths";

export type AppDb = LibSQLDatabase;

export type DbContext = {
	client: Client;
	db: AppDb;
	filePath: string;
};

export function createDbContext(): DbContext {
	const filePath = getDatabaseFilePath();
	const client = createClient({ url: `file:${filePath}` });
	const db = drizzle(client);
	return { client, db, filePath };
}
