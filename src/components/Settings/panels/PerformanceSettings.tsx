import { Gauge } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	getPerformanceTuning,
	setPerformanceTuning,
	type PerformanceTuning,
} from "../../../lib/config";
import { toast } from "../../ui/Toast";
import Select from "../../ui/Select";
import { useSettingsExperience } from "../context/SettingsExperienceContext";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
} from "../ui/SettingsPrimitives";

const SOURCE_REFRESH_OPTIONS = [
	2000, 5000, 10000, 15000, 30000, 60000,
] as const;
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
					<div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
						<div className="text-xs text-text-muted">资料刷新</div>
						<div className="mt-2 text-lg font-semibold text-text-primary">
							{formatMs(settings.sourceAutoRefreshMs)}
						</div>
					</div>
					<div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
						<div className="text-xs text-text-muted">远程同步</div>
						<div className="mt-2 text-lg font-semibold text-text-primary">
							{formatMs(settings.remoteSyncIntervalMs)}
						</div>
					</div>
					<div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
						<div className="text-xs text-text-muted">调试日志</div>
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
					className="min-h-[44px] rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-warm-50 disabled:opacity-60 dark:text-zinc-200"
				>
					恢复推荐值
				</button>
			</SettingsPageContainer>
		);
	}

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
			<SettingsPanelHeader
				icon={Gauge}
				title="性能优化"
				description="控制刷新、同步与调试。"
			/>

			{/* 刷新与同步 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>刷新与同步</SettingsSectionTitle>
					<SettingsRow
						label="资料自动刷新间隔"
						description="值越小越实时，但会增加 IPC 压力。"
						action={
							<Select
								value={settings.sourceAutoRefreshMs}
								onChange={(event) => {
									void patchSettings({
										sourceAutoRefreshMs: Number(event.target.value),
									});
								}}
								disabled={isSaving}
								variant="inline"
								containerClassName="w-auto min-w-[120px]"
							>
								{SOURCE_REFRESH_OPTIONS.map((option) => (
									<option key={option} value={option}>
										{formatMs(option)}
									</option>
								))}
							</Select>
						}
					/>
					<SettingsRow
						label="远程会话同步间隔"
						description="值越小越实时，但会增加后台同步开销。"
						action={
							<Select
								value={settings.remoteSyncIntervalMs}
								onChange={(event) => {
									void patchSettings({
										remoteSyncIntervalMs: Number(event.target.value),
									});
								}}
								disabled={isSaving}
								variant="inline"
								containerClassName="w-auto min-w-[120px]"
							>
								{REMOTE_SYNC_OPTIONS.map((option) => (
									<option key={option} value={option}>
										{formatMs(option)}
									</option>
								))}
							</Select>
						}
					/>
				</div>
			</SettingsSectionCard>

			{/* 调试 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>调试</SettingsSectionTitle>
					<SettingsRow
						label="启用 UI 热路径日志"
						description="仅建议排查拖拽或交互问题时临时开启。"
						action={
							<SettingsSwitch
								checked={settings.enableUiDebugLogs}
								onChange={() => {
									void patchSettings({
										enableUiDebugLogs: !settings.enableUiDebugLogs,
									});
								}}
							/>
						}
					/>
				</div>
			</SettingsSectionCard>
		</SettingsPageContainer>
	);
}
