/**
 * 版本 8：DROP 高可信孤儿表 workflow_nodes / workflow_run_logs。
 *
 * 依据《docs/代码分析/精简决策方案.md》A4：这两张表是早期「工作流节点」
 * 概念的遗留，全仓仅在初始化 SQL / v2 索引 / 备份表清单中被引用，
 * 无任何业务代码读写；前端仅剩的 `src/lib/api/workflow.ts` 调用的
 * `*_workflow_*` IPC 命令在主进程从未注册过（死封装，同批一并删除）。
 *
 * 处理范围：
 * - 老库：在这里 DROP（idx_workflow_run_logs_node 随表自动删除）。
 * - 新装：initSql.ts 已不再创建这两张表；v2Migrations 里残留的
 *   `CREATE INDEX ... ON workflow_run_logs` 语句本身有逐条 try/catch，
 *   目标表不存在时静默跳过，不影响。
 * - 备份兼容：backupPayload 的导入逻辑只写入「当前存在的表」，
 *   旧备份包中残留的 workflow_* 数据会被安全跳过，不会报错。
 *
 * 本版本只做 DROP、没有独占新表，故不设置哨兵表（同 v3 的处理方式；
 * 漏检的代价仅是孤儿表残留，无任何运行时影响）。
 */
import type { DbContext } from "../client";

export async function runV8Migrations(ctx: DbContext): Promise<void> {
	const statements = [
		// 先删子表（workflow_run_logs.node_id 外键引用 workflow_nodes）
		"DROP TABLE IF EXISTS workflow_run_logs",
		"DROP TABLE IF EXISTS workflow_nodes",
	];
	for (const sql of statements) {
		await ctx.client.execute({ sql, args: [] });
	}
}
