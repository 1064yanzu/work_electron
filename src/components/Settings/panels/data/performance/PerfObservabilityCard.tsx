/**
 * PerfObservabilityCard — 「性能观测」卡片（P2-31）
 *
 * 数据源：IPC `perf_get_recent_events`（perf_events 表，7 天滚动保留）。
 * 三块观测视图：
 *   1. 冷启动耗时趋势 — kind='startup_milestone'，取 name='boot_total'
 *      （缺失时回退 ready_to_show），最近 7 天，纯 CSS 条形图；
 *   2. 渲染端长任务   — kind='renderer_longtask'，最近 24h 次数 / 累计时长；
 *   3. 慢 IPC Top 10  — kind='slow_ipc'，最近 24h 按 channel 聚合次数 / p95 / 最大耗时。
 *
 * 全部本地展示、不上报；数据为空时给友好空态。
 */
import { LineChart } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "../../../../../lib/tauriCompat";
import {
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../../../ui/SettingsPrimitives";

interface PerfEventRow {
	id: number;
	ts: number;
	kind: string;
	name: string;
	duration_ms: number | null;
	meta_json: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** 条形图最多展示的启动次数（太多会挤成细丝，取最近 N 次即可看清趋势） */
const MAX_STARTUP_BARS = 20;

function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)} ms`;
	return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

function formatTime(ts: number): string {
	const d = new Date(ts);
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const mi = String(d.getMinutes()).padStart(2, "0");
	return `${mm}-${dd} ${hh}:${mi}`;
}

function percentile(sortedAsc: number[], p: number): number {
	if (sortedAsc.length === 0) return 0;
	const idx = Math.min(
		sortedAsc.length - 1,
		Math.max(0, Math.ceil(p * sortedAsc.length) - 1),
	);
	return sortedAsc[idx];
}

interface SlowIpcAgg {
	channel: string;
	count: number;
	p95: number;
	max: number;
}

async function fetchEvents(
	kind: string,
	limit: number,
): Promise<PerfEventRow[]> {
	const result = await invoke<{ events: PerfEventRow[] }>(
		"perf_get_recent_events",
		{ kind, limit },
	);
	return result.events || [];
}

export function PerfObservabilityCard() {
	const [startupEvents, setStartupEvents] = useState<PerfEventRow[]>([]);
	const [longtaskEvents, setLongtaskEvents] = useState<PerfEventRow[]>([]);
	const [slowIpcEvents, setSlowIpcEvents] = useState<PerfEventRow[]>([]);
	const [loading, setLoading] = useState(true);

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			const [startup, longtask, slowIpc] = await Promise.all([
				fetchEvents("startup_milestone", 500),
				fetchEvents("renderer_longtask", 2000),
				fetchEvents("slow_ipc", 2000),
			]);
			setStartupEvents(startup);
			setLongtaskEvents(longtask);
			setSlowIpcEvents(slowIpc);
		} catch (error) {
			console.error("[Settings] perf events load failed:", error);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	// ---- 1. 冷启动耗时趋势（最近 7 天，boot_total 优先，缺失回退 ready_to_show）----
	const startupBars = useMemo(() => {
		const cutoff = Date.now() - WEEK_MS;
		const pick = (name: string) =>
			startupEvents.filter(
				(e) =>
					e.name === name &&
					e.ts >= cutoff &&
					typeof e.duration_ms === "number" &&
					e.duration_ms > 0,
			);
		const boots = pick("boot_total");
		const rows = boots.length > 0 ? boots : pick("ready_to_show");
		return rows.slice(-MAX_STARTUP_BARS).map((e) => ({
			ts: e.ts,
			ms: e.duration_ms as number,
		}));
	}, [startupEvents]);

	const startupMax = useMemo(
		() => startupBars.reduce((m, b) => Math.max(m, b.ms), 0),
		[startupBars],
	);
	const startupLatest =
		startupBars.length > 0 ? startupBars[startupBars.length - 1] : null;

	// ---- 2. 最近 24h 渲染端长任务汇总 ----
	const longtaskSummary = useMemo(() => {
		const cutoff = Date.now() - DAY_MS;
		let count = 0;
		let totalMs = 0;
		for (const e of longtaskEvents) {
			if (e.ts < cutoff) continue;
			totalMs += e.duration_ms ?? 0;
			if (e.meta_json) {
				try {
					const meta = JSON.parse(e.meta_json) as { count?: number };
					count += typeof meta.count === "number" ? meta.count : 0;
				} catch {
					// 忽略坏行
				}
			}
		}
		return { count, totalMs };
	}, [longtaskEvents]);

	// ---- 3. 最近 24h 慢 IPC Top 10（按 channel 聚合） ----
	const slowIpcTop = useMemo<SlowIpcAgg[]>(() => {
		const cutoff = Date.now() - DAY_MS;
		const byChannel = new Map<string, number[]>();
		for (const e of slowIpcEvents) {
			if (e.ts < cutoff || typeof e.duration_ms !== "number") continue;
			const list = byChannel.get(e.name);
			if (list) list.push(e.duration_ms);
			else byChannel.set(e.name, [e.duration_ms]);
		}
		const aggs: SlowIpcAgg[] = [];
		for (const [channel, durations] of byChannel) {
			durations.sort((a, b) => a - b);
			aggs.push({
				channel,
				count: durations.length,
				p95: percentile(durations, 0.95),
				max: durations[durations.length - 1],
			});
		}
		aggs.sort((a, b) => b.count - a.count);
		return aggs.slice(0, 10);
	}, [slowIpcEvents]);

	const hasAnyData =
		startupBars.length > 0 ||
		longtaskSummary.count > 0 ||
		longtaskSummary.totalMs > 0 ||
		slowIpcTop.length > 0;

	return (
		<SettingsSectionCard>
			<div
				className="p-5"
				id="data.performance.observability"
				data-settings-anchor="data.performance.observability"
			>
				<div className="flex items-center justify-between mb-2">
					<SettingsSectionTitle>
						<span className="inline-flex items-center gap-2">
							<LineChart className="w-4 h-4 text-text-muted" />
							性能观测
						</span>
					</SettingsSectionTitle>
					<button
						type="button"
						onClick={() => void reload()}
						disabled={loading}
						className="text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
					>
						{loading ? "加载中…" : "刷新"}
					</button>
				</div>

				{!hasAnyData ? (
					<p className="text-xs text-text-light py-2">
						{loading
							? "正在加载观测数据…"
							: "暂无观测数据，运行几天后这里会出现数据。"}
					</p>
				) : (
					<div className="space-y-5">
						{/* 冷启动耗时趋势 */}
						<div>
							<div className="flex items-baseline justify-between mb-1.5">
								<div className="text-xs font-medium text-text-secondary">
									冷启动耗时 · 最近 7 天
								</div>
								{startupLatest && (
									<div className="text-[11px] tabular-nums text-text-muted">
										最新 {formatDuration(startupLatest.ms)} · 最慢{" "}
										{formatDuration(startupMax)}
									</div>
								)}
							</div>
							{startupBars.length === 0 ? (
								<p className="text-xs text-text-light">
									暂无启动记录，重启应用后会出现数据。
								</p>
							) : (
								<div className="rounded-lg border border-border bg-cream-50 px-3 pt-3 pb-2">
									<div className="flex items-end gap-1 h-16">
										{startupBars.map((bar) => (
											<div
												key={bar.ts}
												title={`${formatTime(bar.ts)} · ${formatDuration(bar.ms)}`}
												className="flex-1 max-w-[22px] rounded-t bg-peach-500/55 hover:bg-peach-500/80 transition-colors"
												style={{
													height: `${Math.max(6, (bar.ms / Math.max(1, startupMax)) * 100)}%`,
												}}
											/>
										))}
									</div>
									<div className="flex items-center justify-between mt-1.5 text-[10px] text-text-light tabular-nums">
										<span>
											{startupBars.length > 1
												? formatTime(startupBars[0].ts)
												: ""}
										</span>
										<span>
											最近 {startupBars.length} 次启动（悬停查看明细）
										</span>
										<span>
											{startupLatest ? formatTime(startupLatest.ts) : ""}
										</span>
									</div>
								</div>
							)}
						</div>

						{/* 渲染端长任务 24h 汇总 */}
						<div>
							<div className="text-xs font-medium text-text-secondary mb-1.5">
								渲染端长任务 · 最近 24 小时
							</div>
							<div className="grid grid-cols-2 gap-3 text-xs">
								<div className="rounded-lg border border-border bg-cream-50 px-3 py-2">
									<div className="text-text-muted">长任务次数（&gt;50ms）</div>
									<div className="text-base tabular-nums text-text-primary">
										{longtaskSummary.count}
									</div>
								</div>
								<div className="rounded-lg border border-border bg-cream-50 px-3 py-2">
									<div className="text-text-muted">累计阻塞时长</div>
									<div className="text-base tabular-nums text-text-primary">
										{formatDuration(longtaskSummary.totalMs)}
									</div>
								</div>
							</div>
						</div>

						{/* 慢 IPC Top 10 */}
						<div>
							<div className="text-xs font-medium text-text-secondary mb-1.5">
								慢 IPC 调用 Top 10 · 最近 24 小时（&gt;100ms）
							</div>
							{slowIpcTop.length === 0 ? (
								<p className="text-xs text-text-light">
									最近 24 小时没有慢 IPC 调用，一切正常。
								</p>
							) : (
								<div className="rounded-lg border border-border bg-cream-50 overflow-hidden">
									<table className="w-full text-xs">
										<thead>
											<tr className="text-left text-[11px] text-text-muted border-b border-border">
												<th className="font-medium px-3 py-1.5">Channel</th>
												<th className="font-medium px-2 py-1.5 text-right w-14">
													次数
												</th>
												<th className="font-medium px-2 py-1.5 text-right w-20">
													p95
												</th>
												<th className="font-medium px-3 py-1.5 text-right w-20">
													最大
												</th>
											</tr>
										</thead>
										<tbody>
											{slowIpcTop.map((row) => (
												<tr
													key={row.channel}
													className="border-b border-border/50 last:border-b-0"
												>
													<td className="px-3 py-1.5 font-mono text-[11px] text-text-primary truncate max-w-0 w-full">
														{row.channel}
													</td>
													<td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
														{row.count}
													</td>
													<td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
														{formatDuration(row.p95)}
													</td>
													<td className="px-3 py-1.5 text-right tabular-nums text-text-secondary">
														{formatDuration(row.max)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</div>
				)}

				<p className="text-[10px] text-text-light mt-3">
					启动里程碑保留最近 7 天；长任务与慢 IPC 统计最近 24
					小时。数据仅本地存储，不上报。
				</p>
			</div>
		</SettingsSectionCard>
	);
}
