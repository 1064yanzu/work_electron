/**
 * 运行态订阅 hook —— 拉一次全量，之后靠事件增量合并。
 *
 * 抽出来是因为有两个地方要用同一份数据：运行监视面板（列表）与入口轨道
 * （每个入口上的实时状态点）。两处各写一遍合并逻辑，迟早出现「面板显示在跑、
 * 轨道上却是灰的」这种自相矛盾的画面。
 *
 * 用增量合并而不是每次事件都整表重拉：TUI 刷屏时事件频率不低，
 * 整表重拉会让列表持续抖动，也白白多出一堆 IPC 往返。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	listHarnessRuntimes,
	type HarnessRuntimeRow,
	type HarnessRuntimeState,
} from "../../../lib/api/harnessAutomation";
import { useIpcListen } from "../../../hooks/useIpcListen";

/** 正在占用资源的状态（用于「有几个在跑」这类计数）。 */
const BUSY_STATES: HarnessRuntimeState[] = ["starting", "working"];

export function useHarnessRuntimes() {
	const [runtimes, setRuntimes] = useState<HarnessRuntimeRow[]>([]);
	const [loading, setLoading] = useState(true);

	const reload = useCallback(async () => {
		try {
			setRuntimes(await listHarnessRuntimes());
		} catch {
			// 读不到就保持上一次的结果，不把界面清空——
			// 一次 IPC 抖动不该让用户以为所有任务都停了
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	useIpcListen<{ runtimes: HarnessRuntimeRow[] }>(
		"harness-runtime-changed",
		(payload) => {
			if (!payload?.runtimes?.length) return;
			setRuntimes((prev) => {
				const next = new Map(prev.map((r) => [r.id, r]));
				for (const incoming of payload.runtimes) {
					// harness 与 label 同时为空是监测层给出的「条目已移除」占位
					if (!incoming.harness && !incoming.label) {
						next.delete(incoming.id);
						continue;
					}
					next.set(incoming.id, incoming);
				}
				return [...next.values()].sort((a, b) => b.started_at - a.started_at);
			});
		},
	);

	/** 正在运行的执行体数量。 */
	const busyCount = useMemo(
		() => runtimes.filter((r) => BUSY_STATES.includes(r.state)).length,
		[runtimes],
	);

	/**
	 * 每个入口当前最值得关注的状态。
	 *
	 * 一个入口可能同时有好几个执行体（两个 pty 加一个后台调用）。取哪个？
	 * 按「用户最需要知道的」排：出错 > 无响应 > 在跑 > 空闲。
	 * 一个报错的执行体被两个正常的盖住，是最不该发生的情况。
	 */
	const stateByHarness = useMemo(() => {
		const PRIORITY: HarnessRuntimeState[] = [
			"error",
			"stalled",
			"working",
			"starting",
			"idle",
		];
		const map = new Map<string, HarnessRuntimeState>();
		for (const runtime of runtimes) {
			if (runtime.state === "exited") continue;
			const current = map.get(runtime.harness);
			if (
				!current ||
				PRIORITY.indexOf(runtime.state) < PRIORITY.indexOf(current)
			) {
				map.set(runtime.harness, runtime.state);
			}
		}
		return map;
	}, [runtimes]);

	return { runtimes, loading, busyCount, stateByHarness, reload };
}
