import { Gauge, Trash2, Activity } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	getPerformanceTuning,
	setPerformanceTuning,
	type PerformanceTuning,
} from "../../../lib/config";
import { invoke } from "../../../lib/tauriCompat";
import { toast } from "../../ui/Toast";
import Select from "../../ui/Select";
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

function formatBytes(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "0 B";
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
	return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface JanitorScope {
	key: string;
	label: string;
	root: string;
	files: number;
	bytes: number;
}

interface PerfSample {
	ts: number;
	rss: number;
	heap_used: number;
	heap_total: number;
	external: number;
	active_handles: number;
	active_requests: number;
	event_loop_lag_ms?: number;
}

export function PerformanceSettings() {
	const [settings, setSettings] = useState<PerformanceTuning>({
		sourceAutoRefreshMs: 10000,
		remoteSyncIntervalMs: 20000,
		enableUiDebugLogs: false,
	});
	const [isSaving, setIsSaving] = useState(false);

	// 缓存清理（janitor）
	const [janitorScopes, setJanitorScopes] = useState<JanitorScope[]>([]);
	const [janitorTotal, setJanitorTotal] = useState(0);
	const [janitorLoading, setJanitorLoading] = useState(false);
	const [janitorExecuting, setJanitorExecuting] = useState(false);

	// 主进程性能样本
	const [perfSamples, setPerfSamples] = useState<PerfSample[]>([]);
	const [perfLoading, setPerfLoading] = useState(false);

	const reloadJanitor = useCallback(async () => {
		setJanitorLoading(true);
		try {
			const result = await invoke<{
				scopes: JanitorScope[];
				total_bytes: number;
			}>("userdata_janitor_scan", {});
			setJanitorScopes(result.scopes || []);
			setJanitorTotal(result.total_bytes || 0);
		} catch (error) {
			console.error("[Settings] janitor scan failed:", error);
			toast.error("扫描失败，请稍后重试");
		} finally {
			setJanitorLoading(false);
		}
	}, []);

	const executeJanitor = useCallback(
		async (scopes?: string[]) => {
			setJanitorExecuting(true);
			try {
				const result = await invoke<{
					removed: number;
					bytes: number;
					errors: Array<{ path: string; error: string }>;
				}>("userdata_janitor_execute", { scopes });
				toast.success(
					`已清理 ${result.removed} 个文件，释放 ${formatBytes(result.bytes)}` +
						(result.errors.length > 0
							? `（${result.errors.length} 个失败）`
							: ""),
				);
				await reloadJanitor();
			} catch (error) {
				console.error("[Settings] janitor execute failed:", error);
				toast.error("清理失败，请稍后重试");
			} finally {
				setJanitorExecuting(false);
			}
		},
		[reloadJanitor],
	);

	const reloadPerf = useCallback(async () => {
		setPerfLoading(true);
		try {
			const result = await invoke<{ samples: PerfSample[] }>(
				"perf_get_recent_metrics",
				{ limit: 120 },
			);
			setPerfSamples(result.samples || []);
		} catch (error) {
			console.error("[Settings] perf metrics failed:", error);
		} finally {
			setPerfLoading(false);
		}
	}, []);

	useEffect(() => {
		void reloadJanitor();
		void reloadPerf();
	}, [reloadJanitor, reloadPerf]);

	const latestSample =
		perfSamples.length > 0 ? perfSamples[perfSamples.length - 1] : null;
	const peakRss = perfSamples.reduce((m, s) => Math.max(m, s.rss), 0);

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

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
			<div
				id="data.performance.overview"
				data-settings-anchor="data.performance.overview"
			>
				<SettingsPanelHeader
					icon={Gauge}
					title="性能优化"
					description="控制刷新、同步与调试。"
				/>
			</div>

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

			{/* 缓存清理 */}
			<SettingsSectionCard>
				<div className="p-5">
					<div className="flex items-center justify-between mb-2">
						<SettingsSectionTitle>
							<span className="inline-flex items-center gap-2">
								<Trash2 className="w-4 h-4 text-text-muted" />
								缓存清理
							</span>
						</SettingsSectionTitle>
						<button
							type="button"
							onClick={() => void reloadJanitor()}
							disabled={janitorLoading}
							className="text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
						>
							{janitorLoading ? "扫描中…" : "重新扫描"}
						</button>
					</div>
					<p className="text-xs text-text-muted mb-3">
						阅读器、Agent 沙盒、TTS 等会在 userData 留下缓存。下面只展示
						<b>超出保留期</b>的文件，点击「清理」前不会删任何东西。
					</p>
					{janitorScopes.length === 0 ? (
						<p className="text-xs text-text-light">
							{janitorLoading ? "正在扫描…" : "没有可清理项"}
						</p>
					) : (
						<ul className="space-y-2">
							{janitorScopes.map((scope) => (
								<li
									key={scope.key}
									className="flex items-center justify-between rounded-lg border border-border bg-cream-50 px-3 py-2"
								>
									<div className="min-w-0">
										<div className="text-sm text-text-primary">
											{scope.label}
										</div>
										<div className="text-xs text-text-muted truncate">
											{scope.root}
										</div>
									</div>
									<div className="flex items-center gap-3 shrink-0">
										<div className="text-right">
											<div className="text-sm tabular-nums text-text-primary">
												{formatBytes(scope.bytes)}
											</div>
											<div className="text-[10px] text-text-muted">
												{scope.files} 个文件
											</div>
										</div>
										<button
											type="button"
											onClick={() => void executeJanitor([scope.key])}
											disabled={scope.bytes === 0 || janitorExecuting}
											className="text-xs rounded-md border border-border bg-surface px-2 py-1 hover:bg-warm-200 disabled:opacity-50"
										>
											清理
										</button>
									</div>
								</li>
							))}
						</ul>
					)}
					{janitorTotal > 0 && (
						<div className="mt-3 flex items-center justify-between">
							<span className="text-sm text-text-secondary">
								合计可释放：{formatBytes(janitorTotal)}
							</span>
							<button
								type="button"
								onClick={() => void executeJanitor()}
								disabled={janitorExecuting || janitorLoading}
								className="text-xs rounded-md bg-peach-500/10 border border-peach-500/40 text-peach-500 px-3 py-1.5 hover:bg-peach-500/20 disabled:opacity-50"
							>
								{janitorExecuting ? "清理中…" : "全部清理"}
							</button>
						</div>
					)}
				</div>
			</SettingsSectionCard>

			{/* 主进程性能监控 */}
			<SettingsSectionCard>
				<div className="p-5">
					<div className="flex items-center justify-between mb-2">
						<SettingsSectionTitle>
							<span className="inline-flex items-center gap-2">
								<Activity className="w-4 h-4 text-text-muted" />
								主进程性能监控
							</span>
						</SettingsSectionTitle>
						<button
							type="button"
							onClick={() => void reloadPerf()}
							disabled={perfLoading}
							className="text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
						>
							{perfLoading ? "加载中…" : "刷新"}
						</button>
					</div>
					{latestSample ? (
						<div className="grid grid-cols-2 gap-3 text-xs">
							<div className="rounded-lg border border-border bg-cream-50 px-3 py-2">
								<div className="text-text-muted">当前 RSS</div>
								<div className="text-base tabular-nums text-text-primary">
									{formatBytes(latestSample.rss)}
								</div>
							</div>
							<div className="rounded-lg border border-border bg-cream-50 px-3 py-2">
								<div className="text-text-muted">7 天峰值 RSS</div>
								<div className="text-base tabular-nums text-text-primary">
									{formatBytes(peakRss)}
								</div>
							</div>
							<div className="rounded-lg border border-border bg-cream-50 px-3 py-2">
								<div className="text-text-muted">Heap 已用</div>
								<div className="text-base tabular-nums text-text-primary">
									{formatBytes(latestSample.heap_used)} /{" "}
									{formatBytes(latestSample.heap_total)}
								</div>
							</div>
							<div className="rounded-lg border border-border bg-cream-50 px-3 py-2">
								<div className="text-text-muted">活跃句柄 / 请求</div>
								<div className="text-base tabular-nums text-text-primary">
									{latestSample.active_handles} / {latestSample.active_requests}
								</div>
							</div>
							{typeof latestSample.event_loop_lag_ms === "number" && (
								<div className="rounded-lg border border-border bg-cream-50 px-3 py-2 col-span-2">
									<div className="text-text-muted">
										Event loop 延迟（最近 1 分钟均值）
									</div>
									<div className="text-base tabular-nums text-text-primary">
										{latestSample.event_loop_lag_ms.toFixed(2)} ms
									</div>
								</div>
							)}
						</div>
					) : (
						<p className="text-xs text-text-light">
							{perfLoading
								? "正在加载样本…"
								: "暂无样本（启动 30s 后开始采集）"}
						</p>
					)}
					<p className="text-[10px] text-text-light mt-3">
						采样频率每分钟一次，保留最近 7 天。仅本地展示，不上报。
					</p>
				</div>
			</SettingsSectionCard>
		</SettingsPageContainer>
	);
}
