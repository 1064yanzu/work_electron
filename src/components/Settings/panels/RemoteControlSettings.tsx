/**
 * RemoteControlSettings — 远程控制设置面板外壳
 *
 * 负责：
 *   - 数据装载（config / runtime / pairings / sessions / cloud node）
 *   - 统一的保存与刷新回调
 *   - Tab 路由切换四个分区（概览 / 通道 / 配对与会话 / 高级）
 *
 * 各分区具体 UI 见 `./remote-control/sections/*`。
 */

import {
	Gauge,
	LayoutList,
	Settings as SettingsIcon,
	Smartphone,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	approveRemotePairing,
	bindCloudNode,
	getCloudNodeStatus,
	getRemoteControlConfig,
	getRemoteControlRuntimeStatus,
	listRemotePairings,
	listRemoteSessions,
	rejectRemotePairing,
	revokeRemotePairing,
	setCloudNodeConfig,
	setRemoteControlConfig,
	terminateRemoteSession,
	unbindCloudNode,
	type CloudNodeConfig,
	type CloudNodeRuntimeStatus,
	type RemoteControlConfig,
	type RemotePairingRecord,
	type RemotePairingRequest,
	type RemoteRuntimeStatus,
	type RemoteSessionInfo,
} from "../../../lib/api";
import { toast } from "../../ui/Toast";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import { useSettingsExperience } from "../context/SettingsExperienceContext";
import {
	SettingsPageContainer,
	SettingsSectionCard,
	SettingsSwitch,
} from "../ui/SettingsPrimitives";
import { RemoteStatusBadge } from "./remote-control/RemoteStatusBadge";
import { RemoteTabNav, type RemoteTabKey } from "./remote-control/RemoteTabNav";
import { OverviewSection } from "./remote-control/sections/OverviewSection";
import { ChannelsSection } from "./remote-control/sections/ChannelsSection";
import { PairingSessionsSection } from "./remote-control/sections/PairingSessionsSection";
import { AdvancedSection } from "./remote-control/sections/AdvancedSection";

export function RemoteControlSettings() {
	const { showTechnicalSummaries } = useSettingsExperience();
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [config, setConfig] = useState<RemoteControlConfig | null>(null);
	const [runtime, setRuntime] = useState<RemoteRuntimeStatus | null>(null);
	const [pendingPairings, setPendingPairings] = useState<
		RemotePairingRequest[]
	>([]);
	const [pairingRecords, setPairingRecords] = useState<RemotePairingRecord[]>(
		[],
	);
	const [sessions, setSessions] = useState<RemoteSessionInfo[]>([]);
	const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
	const [busyRevokeKey, setBusyRevokeKey] = useState<string | null>(null);
	const [busyRunId, setBusyRunId] = useState<string | null>(null);
	const [busyCloudBind, setBusyCloudBind] = useState(false);
	const [busyCloudUnbind, setBusyCloudUnbind] = useState(false);
	const [cloudNodeConfig, setCloudNodeConfigState] =
		useState<CloudNodeConfig | null>(null);
	const [cloudNodeRuntime, setCloudNodeRuntime] =
		useState<CloudNodeRuntimeStatus | null>(null);
	const [cloudBindForm, setCloudBindForm] = useState({
		relay_url: "",
		email: "",
		password: "",
		node_name: "",
	});
	const [activeTab, setActiveTab] = useState<RemoteTabKey>("overview");

	const loadData = useCallback(async () => {
		setLoading(true);
		try {
			const [nextConfig, nextRuntime, pairings, nextSessions, cloudNode] =
				await Promise.all([
					getRemoteControlConfig(),
					getRemoteControlRuntimeStatus(),
					listRemotePairings(),
					listRemoteSessions(20),
					getCloudNodeStatus(),
				]);
			setConfig(nextConfig);
			setRuntime(nextRuntime);
			setPendingPairings(pairings.pending_requests);
			setPairingRecords(pairings.records);
			setSessions(nextSessions);
			setCloudNodeConfigState(cloudNode.config);
			setCloudNodeRuntime(cloudNode.status);
			setCloudBindForm((prev) => ({
				...prev,
				relay_url: cloudNode.config.relayUrl || prev.relay_url,
				node_name: cloudNode.config.nodeName || prev.node_name,
			}));
		} catch (error) {
			toast.error(
				`加载远程控制配置失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const saveConfig = useCallback(
		async (updater: (draft: RemoteControlConfig) => RemoteControlConfig) => {
			if (!config) return;
			const previous = config;
			const next = updater(structuredClone(config));
			setConfig(next);
			setSaving(true);
			try {
				await setRemoteControlConfig(next);
				setRuntime(await getRemoteControlRuntimeStatus());
			} catch (error) {
				setConfig(previous);
				toast.error(
					`保存失败：${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				setSaving(false);
			}
		},
		[config],
	);

	const saveCloudConfig = useCallback(
		async (updater: (draft: CloudNodeConfig) => CloudNodeConfig) => {
			if (!cloudNodeConfig) return;
			const previous = cloudNodeConfig;
			const next = updater(structuredClone(cloudNodeConfig));
			setCloudNodeConfigState(next);
			setSaving(true);
			try {
				await setCloudNodeConfig(next);
				const latest = await getCloudNodeStatus();
				setCloudNodeConfigState(latest.config);
				setCloudNodeRuntime(latest.status);
			} catch (error) {
				setCloudNodeConfigState(previous);
				toast.error(
					`云节点配置保存失败：${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				setSaving(false);
			}
		},
		[cloudNodeConfig],
	);

	const refreshRuntime = useCallback(async () => {
		setRefreshing(true);
		try {
			const [nextRuntime, nextSessions, pairings, cloudNode] =
				await Promise.all([
					getRemoteControlRuntimeStatus(),
					listRemoteSessions(20),
					listRemotePairings(),
					getCloudNodeStatus(),
				]);
			setRuntime(nextRuntime);
			setSessions(nextSessions);
			setPendingPairings(pairings.pending_requests);
			setPairingRecords(pairings.records);
			setCloudNodeConfigState(cloudNode.config);
			setCloudNodeRuntime(cloudNode.status);
		} catch (error) {
			toast.error(
				`刷新状态失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setRefreshing(false);
		}
	}, []);

	// 自动刷新（每 10 秒，仅当启用时）
	const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
	useEffect(() => {
		if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
		if (config?.enabled) {
			autoRefreshRef.current = setInterval(() => void refreshRuntime(), 10_000);
		}
		return () => {
			if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
		};
	}, [config?.enabled, refreshRuntime]);

	const handleApprove = useCallback(
		async (requestId: string) => {
			setBusyRequestId(requestId);
			try {
				await approveRemotePairing(requestId, "settings");
				toast.success("已批准配对请求");
				await refreshRuntime();
			} catch (error) {
				toast.error(
					`批准失败：${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				setBusyRequestId(null);
			}
		},
		[refreshRuntime],
	);

	const handleReject = useCallback(
		async (requestId: string) => {
			setBusyRequestId(requestId);
			try {
				await rejectRemotePairing(requestId, "Rejected in settings");
				toast.success("已拒绝配对请求");
				await refreshRuntime();
			} catch (error) {
				toast.error(
					`拒绝失败：${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				setBusyRequestId(null);
			}
		},
		[refreshRuntime],
	);

	const handleRevoke = useCallback(
		async (channelId: string, peerId: string) => {
			const key = `${channelId}:${peerId}`;
			setBusyRevokeKey(key);
			try {
				await revokeRemotePairing({
					channel_id: channelId,
					peer_id: peerId,
					reason: "Revoked in settings",
				});
				toast.success("已撤销配对授权");
				await refreshRuntime();
			} catch (error) {
				toast.error(
					`撤销失败：${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				setBusyRevokeKey(null);
			}
		},
		[refreshRuntime],
	);

	const handleStopRun = useCallback(
		async (runId: string) => {
			setBusyRunId(runId);
			try {
				await terminateRemoteSession(runId);
				toast.success(`已发送停止指令：${runId}`);
				await refreshRuntime();
			} catch (error) {
				toast.error(
					`停止失败：${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				setBusyRunId(null);
			}
		},
		[refreshRuntime],
	);

	const handleCloudBind = useCallback(async () => {
		setBusyCloudBind(true);
		try {
			const relay = cloudBindForm.relay_url.trim();
			const email = cloudBindForm.email.trim();
			const password = cloudBindForm.password.trim();
			if (!relay || !email || !password) {
				toast.warning("请填写 Relay URL、邮箱和密码");
				return;
			}
			await bindCloudNode({
				relay_url: relay,
				email,
				password,
				node_name: cloudBindForm.node_name.trim() || undefined,
			});
			toast.success("云节点绑定成功");
			setCloudBindForm((prev) => ({ ...prev, password: "" }));
			await refreshRuntime();
		} catch (error) {
			toast.error(
				`云节点绑定失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setBusyCloudBind(false);
		}
	}, [cloudBindForm, refreshRuntime]);

	const handleCloudUnbind = useCallback(async () => {
		setBusyCloudUnbind(true);
		try {
			await unbindCloudNode();
			toast.success("已解绑云节点");
			await refreshRuntime();
		} catch (error) {
			toast.error(
				`解绑失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setBusyCloudUnbind(false);
		}
	}, [refreshRuntime]);

	const activeRuns = runtime?.active_runs ?? 0;
	const pendingCount =
		(runtime?.pending_pairings ?? 0) || pendingPairings.length;

	const tabItems = useMemo(
		() => [
			{
				key: "overview" as const,
				label: "概览",
				icon: Gauge,
			},
			{
				key: "channels" as const,
				label: "通道",
				icon: LayoutList,
				badge: runtime?.channels.filter((c) => c.connected).length ?? 0,
				badgeTone: "emerald" as const,
			},
			{
				key: "pairing" as const,
				label: "配对与会话",
				icon: Users,
				badge: pendingCount + activeRuns,
				badgeTone:
					pendingCount > 0
						? ("rose" as const)
						: activeRuns > 0
							? ("amber" as const)
							: undefined,
			},
			{
				key: "advanced" as const,
				label: "高级",
				icon: SettingsIcon,
			},
		],
		[runtime, pendingCount, activeRuns],
	);

	if (loading || !config) {
		return (
			<SettingsPageContainer contentClassName="max-w-5xl">
				<div className="flex h-52 items-center justify-center text-text-muted">
					加载远程控制配置中...
				</div>
			</SettingsPageContainer>
		);
	}

	// 精简视图（showTechnicalSummaries）保留：只展示总开关 + 仪表盘
	if (showTechnicalSummaries) {
		const enabledChannels = Object.values(config.channels).filter(
			(channel) => channel && "enabled" in channel && channel.enabled,
		).length;
		return (
			<SettingsPageContainer contentClassName="max-w-4xl space-y-6">
				<SettingsPanelHeader
					icon={Smartphone}
					title="远程控制"
					description="远程控制与通道配置。"
				/>

				<SettingsSectionCard className="p-5">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div className="text-sm font-medium text-text-primary">总开关</div>
						<SettingsSwitch
							checked={config.enabled}
							onChange={(next) => {
								void saveConfig((draft) => ({ ...draft, enabled: next }));
							}}
							disabled={saving}
						/>
					</div>
				</SettingsSectionCard>

				<div className="grid gap-4 sm:grid-cols-4">
					<MiniStat
						label="状态"
						value={
							runtime?.enabled ? "运行中" : config.enabled ? "待启动" : "已关闭"
						}
					/>
					<MiniStat label="已启用通道" value={String(enabledChannels)} />
					<MiniStat
						label="待配对"
						value={String(runtime?.pending_pairings ?? 0)}
					/>
					<MiniStat
						label="活跃运行"
						value={String(runtime?.active_runs ?? 0)}
					/>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<RemoteStatusBadge
						text={runtime?.enabled ? "已启用" : "已禁用"}
						tone={runtime?.enabled ? "green" : "zinc"}
					/>
					<RemoteStatusBadge
						text={`活跃运行 ${runtime?.active_runs ?? 0}`}
						tone={(runtime?.active_runs ?? 0) > 0 ? "green" : "zinc"}
					/>
					<RemoteStatusBadge
						text={`待配对 ${runtime?.pending_pairings ?? 0}`}
						tone={(runtime?.pending_pairings ?? 0) > 0 ? "amber" : "zinc"}
					/>
				</div>
			</SettingsPageContainer>
		);
	}

	return (
		<SettingsPageContainer contentClassName="max-w-5xl space-y-6">
			<SettingsPanelHeader
				icon={Smartphone}
				title="远程控制"
				description="通过飞书、Telegram、Slack 等渠道远程操控 Agent。"
			/>

			{/* Tabs */}
			<div className="sticky top-0 z-10 -mx-1 px-1 pt-1 pb-2 backdrop-blur-md">
				<RemoteTabNav
					tabs={tabItems}
					active={activeTab}
					onChange={setActiveTab}
				/>
			</div>

			{/* 内容 */}
			{activeTab === "overview" ? (
				<OverviewSection
					enabled={config.enabled}
					saving={saving}
					runtime={runtime}
					onToggleEnabled={(next) => {
						void saveConfig((draft) => ({ ...draft, enabled: next }));
					}}
					onRefresh={() => void refreshRuntime()}
					refreshing={refreshing}
				/>
			) : null}
			{activeTab === "channels" ? (
				<ChannelsSection
					config={config}
					runtime={runtime}
					saving={saving}
					onSave={(updater) => void saveConfig(updater)}
				/>
			) : null}
			{activeTab === "pairing" ? (
				<PairingSessionsSection
					pendingPairings={pendingPairings}
					pairingRecords={pairingRecords}
					sessions={sessions}
					busyRequestId={busyRequestId}
					busyRevokeKey={busyRevokeKey}
					busyRunId={busyRunId}
					onApprove={(id) => void handleApprove(id)}
					onReject={(id) => void handleReject(id)}
					onRevoke={(channelId, peerId) => void handleRevoke(channelId, peerId)}
					onStop={(runId) => void handleStopRun(runId)}
				/>
			) : null}
			{activeTab === "advanced" ? (
				<AdvancedSection
					config={config}
					saving={saving}
					onSave={(updater) => void saveConfig(updater)}
					cloudNodeConfig={cloudNodeConfig}
					cloudNodeRuntime={cloudNodeRuntime}
					onSaveCloud={(updater) => void saveCloudConfig(updater)}
					cloudBindForm={cloudBindForm}
					onCloudBindFormChange={(patch) =>
						setCloudBindForm((prev) => ({ ...prev, ...patch }))
					}
					busyCloudBind={busyCloudBind}
					busyCloudUnbind={busyCloudUnbind}
					onCloudBind={() => void handleCloudBind()}
					onCloudUnbind={() => void handleCloudUnbind()}
				/>
			) : null}
		</SettingsPageContainer>
	);
}

function MiniStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
			<div className="text-xs text-text-muted">{label}</div>
			<div className="mt-2 text-sm font-semibold text-text-primary">
				{value}
			</div>
		</div>
	);
}
