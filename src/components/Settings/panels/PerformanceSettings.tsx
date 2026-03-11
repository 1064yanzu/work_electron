import { Gauge } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	getPerformanceTuning,
	setPerformanceTuning,
	type PerformanceTuning,
} from "../../../lib/config";
import { toast } from "../../ui/Toast";
import { useSettingsExperience } from "../context/SettingsExperienceContext";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import { Toggle } from "../components/Toggle";
import { SettingsPageContainer } from "../ui/SettingsPrimitives";

const SOURCE_REFRESH_OPTIONS = [2000, 5000, 10000, 15000, 30000, 60000] as const;
const REMOTE_SYNC_OPTIONS = [5000, 10000, 15000, 30000, 60000, 120000] as const;

function formatMs(ms: number) {
	if (ms < 1000) return `${ms} ms`;
	if (ms < 60_000) return `${Math.round(ms / 100) / 10} 秒`;
	return `${Math.round(ms / 6000) / 10} 分钟`;
}

export function PerformanceSettings() {
	const { showTechnicalSummaries } = useSettingsExperience();
	const [settings, setSettings] = useState<PerformanceTuning>({
		sourceAutoRefreshMs: 10000,
		remoteSyncIntervalMs: 20000,
		enableUiDebugLogs: false,
	});
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void getPerformanceTuning()
			.then((next) => {
				if (cancelled) return;
				setSettings(next);
			})
			.catch((error) => {
				console.error("加载性能设置失败:", error);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const patchSettings = useCallback(
		async (patch: Partial<PerformanceTuning>) => {
			setIsSaving(true);
			const optimistic = { ...settings, ...patch };
			setSettings(optimistic);
			try {
				const saved = await setPerformanceTuning(patch);
				setSettings(saved);
			} catch (error) {
				console.error("保存性能设置失败:", error);
				toast.error("保存失败，请重试");
				setSettings(settings);
			} finally {
				setIsSaving(false);
			}
		},
		[settings],
	);

	if (showTechnicalSummaries) {
		return (
			<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
				<SettingsPanelHeader
					icon={Gauge}
					title="性能优化"
					description="刷新、同步与调试。"
				/>

				<div className="grid gap-4 sm:grid-cols-3">
					<div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<div className="text-xs text-zinc-500 dark:text-zinc-400">资料刷新</div>
						<div className="mt-2 text-lg font-semibold text-text-primary">
							{formatMs(settings.sourceAutoRefreshMs)}
						</div>
					</div>
					<div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<div className="text-xs text-zinc-500 dark:text-zinc-400">远程同步</div>
						<div className="mt-2 text-lg font-semibold text-text-primary">
							{formatMs(settings.remoteSyncIntervalMs)}
						</div>
					</div>
					<div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<div className="text-xs text-zinc-500 dark:text-zinc-400">调试日志</div>
						<div className="mt-2 text-lg font-semibold text-text-primary">
							{settings.enableUiDebugLogs ? "已启用" : "默认关闭"}
						</div>
					</div>
				</div>

				<button
					type="button"
					onClick={() =>
						void patchSettings({
							sourceAutoRefreshMs: 10000,
							remoteSyncIntervalMs: 20000,
							enableUiDebugLogs: false,
						})
					}
					disabled={isSaving}
					className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
				>
					恢复推荐值
				</button>
			</SettingsPageContainer>
		);
	}

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-8">
			<SettingsPanelHeader
				icon={Gauge}
				title="性能优化"
				description="控制刷新、同步与调试。"
			/>

			<div className="space-y-4">
				<h4 className="font-medium text-text-primary">资料自动刷新间隔</h4>
				<select
					value={settings.sourceAutoRefreshMs}
					onChange={(event) => {
						void patchSettings({
							sourceAutoRefreshMs: Number(event.target.value),
						});
					}}
					className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
					disabled={isSaving}
				>
					{SOURCE_REFRESH_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{formatMs(option)}
						</option>
					))}
				</select>
				<p className="text-xs text-text-muted">
					当前值：{formatMs(settings.sourceAutoRefreshMs)}。值越小越实时，但会增加 IPC 压力。
				</p>
			</div>

			<div className="space-y-4">
				<h4 className="font-medium text-text-primary">远程会话同步间隔</h4>
				<select
					value={settings.remoteSyncIntervalMs}
					onChange={(event) => {
						void patchSettings({
							remoteSyncIntervalMs: Number(event.target.value),
						});
					}}
					className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
					disabled={isSaving}
				>
					{REMOTE_SYNC_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{formatMs(option)}
						</option>
					))}
				</select>
				<p className="text-xs text-text-muted">
					当前值：{formatMs(settings.remoteSyncIntervalMs)}。值越小越实时，但会增加后台同步开销。
				</p>
			</div>

			<div className="space-y-3">
				<h4 className="font-medium text-text-primary">调试日志</h4>
				<div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
					<div>
						<div className="text-sm text-text-primary">启用 UI 热路径日志</div>
						<div className="text-xs text-text-muted">
							仅建议排查拖拽或交互问题时临时开启。
						</div>
					</div>
					<Toggle
						checked={settings.enableUiDebugLogs}
						onChange={() => {
							void patchSettings({
								enableUiDebugLogs: !settings.enableUiDebugLogs,
							});
						}}
					/>
				</div>
			</div>
		</SettingsPageContainer>
	);
}
