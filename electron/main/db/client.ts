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
	/** WAL 是否实际生效（网络卷等场景会被 SQLite 拒绝，自动降级为 DELETE 模式） */
	walEnabled: boolean;
};

/**
 * 连接建立后的 PRAGMA 序列（B7）。
 *
 * - busy_timeout：并发写等锁而不是立刻 SQLITE_BUSY。
 * - journal_mode=WAL：读写不互相阻塞；写返回值校验，网络卷/某些文件系统会拒绝
 *   WAL，此时 SQLite 自动落回 DELETE，必须读返回值判断是否真的生效并降级告警，
 *   不能假定设置成功。
 * - synchronous=NORMAL：WAL 模式下安全且比 FULL 快得多。
 * - foreign_keys=ON：libsql/sqlite 默认关闭，级联 ON DELETE CASCADE 依赖它生效。
 * - cache_size=-16000：约 16MB 页缓存，减少磁盘 IO。
 */
async function applyPragmas(client: Client): Promise<boolean> {
	await client.execute("PRAGMA busy_timeout = 5000");
	let walEnabled = false;
	try {
		const result = await client.execute("PRAGMA journal_mode = WAL");
		const mode = String(
			(result.rows[0] as Record<string, unknown> | undefined)?.journal_mode ??
				"",
		).toLowerCase();
		walEnabled = mode === "wal";
	} catch {
		walEnabled = false;
	}
	await client.execute(
		`PRAGMA synchronous = ${walEnabled ? "NORMAL" : "FULL"}`,
	);
	await client.execute("PRAGMA foreign_keys = ON");
	await client.execute("PRAGMA cache_size = -16000");
	return walEnabled;
}

export function createDbContext(): DbContext {
	const filePath = getDatabaseFilePath();
	const client = createClient({ url: `file:${filePath}` });
	const db = drizzle(client);
	return { client, db, filePath, walEnabled: false };
}

/**
 * 对已创建的 DbContext 应用 PRAGMA 序列，返回 WAL 是否实际生效。
 * 由 db/init.ts 在唯一入口调用一次；不在 createDbContext 内部做异步副作用，
 * 保持“创建连接”与“配置连接”解耦，方便测试/未来的多连接场景复用。
 */
export async function initializePragmas(ctx: DbContext): Promise<void> {
	ctx.walEnabled = await applyPragmas(ctx.client);
}

// 单例实例：全应用统一走这一个连接，避免 createDbContext() 被多处直接调用
// 产生并存的第二个连接（B7：并发写在无 WAL 时会直接 SQLITE_BUSY）。
let dbContextInstance: DbContext | null = null;

export function getDbContext(): DbContext {
	if (!dbContextInstance) {
		dbContextInstance = createDbContext();
	}
	return dbContextInstance;
}
