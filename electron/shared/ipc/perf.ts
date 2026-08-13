// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：perf（共 3 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

export interface PerfIpcSchema {
	/**
	 * 主进程性能 telemetry：渲染端 Settings → About 面板获取最近 N 条 perf_metrics 样本。
	 */
	perf_get_recent_metrics: {
		input: { limit?: number };
		output: {
			samples: Array<{
				ts: number;
				rss: number;
				heap_used: number;
				heap_total: number;
				external: number;
				active_handles: number;
				active_requests: number;
				event_loop_lag_ms?: number;
			}>;
		};
	};
	/**
	 * M0 度量基建：获取 perf_events 表中的事件（启动里程碑 / 渲染端 longtask / 慢 IPC 调用），
	 * 给 Settings → About 面板绘制 startup/longtask/slow_ipc 曲线。
	 */
	perf_get_recent_events: {
		input: { kind?: string; limit?: number };
		output: {
			events: Array<{
				id: number;
				ts: number;
				kind: string;
				name: string;
				duration_ms: number | null;
				meta_json: string | null;
			}>;
		};
	};
	/**
	 * M0.2：渲染端 PerformanceObserver('longtask') 每分钟汇总一次，上报长任务计数 + 总时长，
	 * 主进程批量写入 perf_events（kind='renderer_longtask'）。
	 */
	perf_report_renderer_longtasks: {
		input: { count: number; totalDurationMs: number; windowMs: number };
		output: { success: boolean };
	};
}
