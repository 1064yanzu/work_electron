/**
 * 主进程性能 telemetry IPC handler
 *
 * 渲染端 Settings → About 通过 `perf_get_recent_metrics` 拉最近 N 条样本，
 * 展示折线图帮助排查内存/句柄异常增长。
 */
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import { getRecentPerfMetrics } from "../../services/perfTelemetry";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createPerfHandlers(deps: { db: DbContext }) {
	const perf_get_recent_metrics: Handler<"perf_get_recent_metrics"> = async (
		_event,
		input,
	) => {
		const limit = Math.max(1, Math.min(1440, input.limit ?? 360));
		const samples = await getRecentPerfMetrics(deps.db, limit);
		// 表里按 DESC 拉取，给 UI 升序方便绘图
		samples.reverse();
		return { samples };
	};

	return { perf_get_recent_metrics };
}
