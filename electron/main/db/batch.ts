/**
 * SQLite 批量写入封装（B6）
 *
 * libsql 的 `client.batch()` 会把整组语句包裹在一个事务里一次性提交，
 * 相比逐条 execute() 各自隐式提交，能把 N 次事务开销降为 1 次。
 * 用于知识库分块重建 / embedding 回填等"一次操作产生大量 INSERT"的场景。
 *
 * 注意：libsql file 模式下事务是同步执行的——单批不宜过大（建议 ≤500 条），
 * 否则大事务本身会造成主进程停顿；调用方应按批次拆分并在批间 `setImmediate` 让路。
 */
import type { InStatement } from "@libsql/client";
import type { DbContext } from "./client";

export async function withBatch(
	ctx: DbContext,
	statements: InStatement[],
	mode: "write" | "read" | "deferred" = "write",
): Promise<void> {
	if (statements.length === 0) return;
	await ctx.client.batch(statements, mode);
}

/** 让出一次事件循环 tick，避免大批量回填任务长时间占用主线程 */
export function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

/** 将数组按固定大小切片，用于分批批量写入 */
export function chunkArray<T>(items: T[], size: number): T[][] {
	if (size <= 0) return [items];
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}
