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
import {
	getRecentPerfEvents,
	recordPerfEvent,
} from "../../services/perfEvents";

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

	const perf_get_recent_events: Handler<"perf_get_recent_events"> = async (
		_event,
		input,
	) => {
		const events = await getRecentPerfEvents(deps.db, {
			kind: input.kind,
			limit: input.limit,
		});
		events.reverse();
		return { events };
	};

	const perf_report_renderer_longtasks: Handler<
		"perf_report_renderer_longtasks"
	> = async (_event, input) => {
		await recordPerfEvent(deps.db, {
			kind: "renderer_longtask",
			name: "longtask_summary",
			durationMs: input.totalDurationMs,
			meta: { count: input.count, windowMs: input.windowMs },
		});
		return { success: true };
	};

	return {
		perf_get_recent_metrics,
		perf_get_recent_events,
		perf_report_renderer_longtasks,
	};
}
