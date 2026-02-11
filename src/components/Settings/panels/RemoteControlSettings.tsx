import {
	Activity,
	Link2,
	RefreshCw,
	Shield,
	Smartphone,
	Wifi,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/Toast";
import {
	approveRemotePairing,
	getRemoteControlConfig,
	getRemoteControlRuntimeStatus,
	listRemotePairings,
	listRemoteSessions,
	rejectRemotePairing,
	revokeRemotePairing,
	setRemoteControlConfig,
	terminateRemoteSession,
	testRemoteChannel,
	type RemoteControlConfig,
	type RemotePairingRecord,
	type RemotePairingRequest,
	type RemoteRuntimeStatus,
	type RemoteSessionInfo,
} from "../../../lib/api";
import {
	SettingsPageContainer,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
} from "../ui/SettingsPrimitives";
import { PairingList } from "./remote-control/PairingList";
import { RemoteStatusBadge } from "./remote-control/RemoteStatusBadge";
import { SessionList } from "./remote-control/SessionList";
import { EventLogPanel } from "./remote-control/EventLogPanel";
import { ChannelConfigCard } from "./remote-control/ChannelConfigCard";

function splitAllowList(raw: string): string[] {
	return raw
		.split(/[\n,]/g)
		.map((v) => v.trim())
		.filter(Boolean);
}

function joinAllowList(items: string[]): string {
	return items.join("\n");
}

export function RemoteControlSettings() {
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
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
	const [busyTest, setBusyTest] = useState(false);

	const allowFromDraft = useMemo(
		() => joinAllowList(config?.channels.feishu.allowFrom ?? []),
		[config?.channels.feishu.allowFrom],
	);
	const groupAllowFromDraft = useMemo(
		() => joinAllowList(config?.channels.feishu.groupAllowFrom ?? []),
		[config?.channels.feishu.groupAllowFrom],
	);

	const loadData = useCallback(async () => {
		setLoading(true);
		try {
			const [nextConfig, nextRuntime, pairings, nextSessions] =
				await Promise.all([
					getRemoteControlConfig(),
					getRemoteControlRuntimeStatus(),
					listRemotePairings(),
					listRemoteSessions(20),
				]);
			setConfig(nextConfig);
			setRuntime(nextRuntime);
			setPendingPairings(pairings.pending_requests);
			setPairingRecords(pairings.records);
			setSessions(nextSessions);
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

	const refreshRuntime = useCallback(async () => {
		try {
			const [nextRuntime, nextSessions, pairings] = await Promise.all([
				getRemoteControlRuntimeStatus(),
				listRemoteSessions(20),
				listRemotePairings(),
			]);
			setRuntime(nextRuntime);
			setSessions(nextSessions);
			setPendingPairings(pairings.pending_requests);
			setPairingRecords(pairings.records);
		} catch (error) {
			toast.error(
				`刷新状态失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, []);

	// 自动刷新运行时状态（每 10 秒，仅当远程控制启用时）
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

	if (loading || !config) {
		return (
			<SettingsPageContainer contentClassName="max-w-4xl">
				<div className="flex h-52 items-center justify-center text-text-muted">
					加载远程控制配置中...
				</div>
			</SettingsPageContainer>
		);
	}

	const runtimeChannel =
		runtime?.channels.find((item) => item.channel_id === "feishu") ?? null;

	return (
		<SettingsPageContainer contentClassName="max-w-4xl space-y-8">
			<div className="border-b border-border pb-4">
				<h3 className="flex items-center gap-2 text-lg font-medium text-text-primary">
					<Smartphone className="h-5 w-5" />
					远程控制
				</h3>
				<p className="mt-1 text-sm text-text-secondary">
					多通道远控骨架，支持 Feishu、Telegram、Slack、Discord，
					预留移动端与通用 Webhook 扩展。
				</p>
			</div>

			<SettingsSectionCard className="p-5">
				<div className="mb-4 flex items-center justify-between">
					<div>
						<SettingsSectionTitle className="mb-1">
							全局开关
						</SettingsSectionTitle>
						<p className="text-sm text-text-secondary">
							关闭后会停止所有远控通道连接。
						</p>
					</div>
					<SettingsSwitch
						checked={config.enabled}
						onChange={(next) => {
							void saveConfig((draft) => ({ ...draft, enabled: next }));
						}}
						disabled={saving}
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
					<Button
						variant="outline"
						size="sm"
						onClick={() => void refreshRuntime()}
					>
						<RefreshCw className="h-3.5 w-3.5" />
						刷新状态
					</Button>
				</div>

				{/* 事件日志面板 */}
				{config.enabled && <EventLogPanel />}
			</SettingsSectionCard>

			<SettingsSectionCard className="p-5 space-y-5">
				<div className="flex items-center justify-between">
					<div>
						<SettingsSectionTitle className="mb-1">
							Feishu 通道
						</SettingsSectionTitle>
						<p className="text-sm text-text-secondary">
							首期完整通道，默认 WebSocket 长连接。
						</p>
					</div>
					<SettingsSwitch
						checked={config.channels.feishu.enabled}
						onChange={(next) => {
							void saveConfig((draft) => {
								draft.channels.feishu.enabled = next;
								return draft;
							});
						}}
						disabled={saving}
					/>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<label className="space-y-1 text-sm">
						<span className="text-text-secondary">App ID</span>
						<input
							value={config.channels.feishu.appId ?? ""}
							onChange={(e) => {
								const value = e.target.value;
								void saveConfig((draft) => {
									draft.channels.feishu.appId = value;
									return draft;
								});
							}}
							className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
							placeholder="cli_xxx"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-text-secondary">App Secret</span>
						<input
							type="password"
							value={config.channels.feishu.appSecret ?? ""}
							onChange={(e) => {
								const value = e.target.value;
								void saveConfig((draft) => {
									draft.channels.feishu.appSecret = value;
									return draft;
								});
							}}
							className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
							placeholder="请输入 Feishu App Secret"
						/>
					</label>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
					<div className="space-y-1">
						<span className="text-sm text-text-secondary">域名</span>
						<Select
							value={config.channels.feishu.domain}
							onChange={(e) => {
								const value = e.target.value as "feishu" | "lark";
								void saveConfig((draft) => {
									draft.channels.feishu.domain = value;
									return draft;
								});
							}}
							options={[
								{ label: "Feishu", value: "feishu" },
								{ label: "Lark", value: "lark" },
							]}
						/>
					</div>
					<div className="space-y-1">
						<span className="text-sm text-text-secondary">连接模式</span>
						<Select
							value={config.channels.feishu.connectionMode}
							onChange={(e) => {
								const value = e.target.value as "websocket" | "webhook";
								void saveConfig((draft) => {
									draft.channels.feishu.connectionMode = value;
									return draft;
								});
							}}
							options={[
								{ label: "WebSocket", value: "websocket" },
								{ label: "Webhook", value: "webhook" },
							]}
						/>
					</div>
					<div className="space-y-1">
						<span className="text-sm text-text-secondary">DM 策略</span>
						<Select
							value={config.channels.feishu.dmPolicy}
							onChange={(e) => {
								const value = e.target.value as
									| "pairing"
									| "allowlist"
									| "open";
								void saveConfig((draft) => {
									draft.channels.feishu.dmPolicy = value;
									return draft;
								});
							}}
							options={[
								{ label: "Pairing", value: "pairing" },
								{ label: "Allowlist", value: "allowlist" },
								{ label: "Open", value: "open" },
							]}
						/>
					</div>
					<div className="space-y-1">
						<span className="text-sm text-text-secondary">群策略</span>
						<Select
							value={config.channels.feishu.groupPolicy}
							onChange={(e) => {
								const value = e.target.value as
									| "disabled"
									| "allowlist"
									| "open";
								void saveConfig((draft) => {
									draft.channels.feishu.groupPolicy = value;
									return draft;
								});
							}}
							options={[
								{ label: "Disabled", value: "disabled" },
								{ label: "Allowlist", value: "allowlist" },
								{ label: "Open", value: "open" },
							]}
						/>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<label className="space-y-1 text-sm">
						<span className="text-text-secondary">
							DM allowlist（每行一个 open_id）
						</span>
						<textarea
							value={allowFromDraft}
							onChange={(e) => {
								const value = splitAllowList(e.target.value);
								void saveConfig((draft) => {
									draft.channels.feishu.allowFrom = value;
									return draft;
								});
							}}
							rows={4}
							className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-text-secondary">
							群 allowlist（每行一个群 ID 或用户 ID）
						</span>
						<textarea
							value={groupAllowFromDraft}
							onChange={(e) => {
								const value = splitAllowList(e.target.value);
								void saveConfig((draft) => {
									draft.channels.feishu.groupAllowFrom = value;
									return draft;
								});
							}}
							rows={4}
							className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
						/>
					</label>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<label className="space-y-1 text-sm">
						<span className="text-text-secondary">文本分片长度</span>
						<input
							type="number"
							min={300}
							value={config.channels.feishu.textChunkLimit}
							onChange={(e) => {
								const value = Math.max(300, Number(e.target.value || 1800));
								void saveConfig((draft) => {
									draft.channels.feishu.textChunkLimit = value;
									return draft;
								});
							}}
							className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-text-secondary">速率限制（次/分钟）</span>
						<input
							type="number"
							min={1}
							max={120}
							value={config.channels.feishu.rateLimitPerMinute}
							onChange={(e) => {
								const value = Math.max(1, Number(e.target.value || 20));
								void saveConfig((draft) => {
									draft.channels.feishu.rateLimitPerMinute = value;
									return draft;
								});
							}}
							className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
						/>
					</label>
					<div className="space-y-1">
						<span className="text-sm text-text-secondary">是否要求 @ 提及</span>
						<div className="flex h-[42px] items-center">
							<SettingsSwitch
								checked={config.channels.feishu.requireMention}
								onChange={(next) => {
									void saveConfig((draft) => {
										draft.channels.feishu.requireMention = next;
										return draft;
									});
								}}
								disabled={saving}
							/>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div className="space-y-1">
						<span className="text-sm text-text-secondary">附件与命令合并</span>
						<div className="flex h-[42px] items-center">
							<SettingsSwitch
								checked={config.channels.feishu.enableAttachmentMerge}
								onChange={(next) => {
									void saveConfig((draft) => {
										draft.channels.feishu.enableAttachmentMerge = next;
										return draft;
									});
								}}
								disabled={saving}
							/>
						</div>
					</div>
					<label className="space-y-1 text-sm">
						<span className="text-text-secondary">合并窗口（秒）</span>
						<input
							type="number"
							min={5}
							max={300}
							value={config.channels.feishu.attachmentMergeWindowSec}
							onChange={(e) => {
								const value = Math.max(5, Math.min(300, Number(e.target.value || 45)));
								void saveConfig((draft) => {
									draft.channels.feishu.attachmentMergeWindowSec = value;
									return draft;
								});
							}}
							disabled={!config.channels.feishu.enableAttachmentMerge}
							className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
						/>
					</label>
					<div className="space-y-1">
						<span className="text-sm text-text-secondary">文档链接预取（Docx/Wiki）</span>
						<div className="flex h-[42px] items-center">
							<SettingsSwitch
								checked={config.channels.feishu.enableDocLinkPrefetch}
								onChange={(next) => {
									void saveConfig((draft) => {
										draft.channels.feishu.enableDocLinkPrefetch = next;
										return draft;
									});
								}}
								disabled={saving}
							/>
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/60">
					<Wifi className="h-4 w-4 text-text-muted" />
					<span className="text-text-secondary">
						Feishu 运行状态：
						{runtimeChannel?.running ? "运行中" : "未运行"} /{" "}
						{runtimeChannel?.connected ? "已连接" : "未连接"}
					</span>
					{runtimeChannel?.last_error ? (
						<span className="text-red-500">
							错误：{runtimeChannel.last_error}
						</span>
					) : null}
					<Button
						variant="outline"
						size="sm"
						loading={busyTest}
						onClick={() => {
							void (async () => {
								setBusyTest(true);
								try {
									const result = await testRemoteChannel("feishu");
									if (result.ok) toast.success(result.message);
									else toast.warning(result.message);
								} catch (error) {
									toast.error(
										`连通性测试失败：${error instanceof Error ? error.message : String(error)}`,
									);
								} finally {
									setBusyTest(false);
								}
							})();
						}}
					>
						<Link2 className="h-3.5 w-3.5" />
						测试连通
					</Button>
				</div>
			</SettingsSectionCard>

			{/* ─── Telegram 通道 ─────────────────────────────── */}
				{config.channels.telegram && "dmPolicy" in config.channels.telegram && (
					<ChannelConfigCard
						channelId="telegram"
						title="Telegram 通道"
						description="使用 Telegram Bot API 长轮询，无需公网 IP。"
						icon={<Smartphone className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />}
						runtimeChannel={runtime?.channels?.find((c) => c.channel_id === "telegram")}
						channelConfig={config.channels.telegram}
					saving={saving}
					onSave={(updater) => void saveConfig(updater)}
					credentialFields={
						<div className="grid grid-cols-1 gap-4">
							<label className="space-y-1 text-sm">
								<span className="text-text-secondary">Bot Token</span>
								<input
									type="password"
									value={config.channels.telegram?.botToken ?? ""}
									onChange={(e) => {
										const value = e.target.value;
										void saveConfig((draft) => {
											draft.channels.telegram.botToken = value;
											return draft;
										});
									}}
									className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
									placeholder="从 @BotFather 获取的 Token"
								/>
							</label>
						</div>
					}
				/>
			)}

			{/* ─── Slack 通道 ─────────────────────────────── */}
				{config.channels.slack && "dmPolicy" in config.channels.slack && (
					<ChannelConfigCard
						channelId="slack"
						title="Slack 通道"
						description="使用 Slack Socket Mode（需要 App-Level Token），无需公网 URL。"
						icon={<Activity className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />}
						runtimeChannel={runtime?.channels?.find((c) => c.channel_id === "slack")}
						channelConfig={config.channels.slack}
					saving={saving}
					onSave={(updater) => void saveConfig(updater)}
					credentialFields={
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<label className="space-y-1 text-sm">
								<span className="text-text-secondary">Bot Token</span>
								<input
									type="password"
									value={config.channels.slack?.botToken ?? ""}
									onChange={(e) => {
										const value = e.target.value;
										void saveConfig((draft) => {
											draft.channels.slack.botToken = value;
											return draft;
										});
									}}
									className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
									placeholder="xoxb-..."
								/>
							</label>
							<label className="space-y-1 text-sm">
								<span className="text-text-secondary">App-Level Token</span>
								<input
									type="password"
									value={config.channels.slack?.appToken ?? ""}
									onChange={(e) => {
										const value = e.target.value;
										void saveConfig((draft) => {
											draft.channels.slack.appToken = value;
											return draft;
										});
									}}
									className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
									placeholder="xapp-..."
								/>
							</label>
						</div>
					}
				/>
			)}

			{/* ─── Discord 通道 ─────────────────────────────── */}
				{config.channels.discord && "dmPolicy" in config.channels.discord && (
					<ChannelConfigCard
						channelId="discord"
						title="Discord 通道"
						description="使用 Discord Gateway WebSocket，无需公网 IP。"
						icon={<Wifi className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />}
						runtimeChannel={runtime?.channels?.find((c) => c.channel_id === "discord")}
						channelConfig={config.channels.discord}
					saving={saving}
					onSave={(updater) => void saveConfig(updater)}
					credentialFields={
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<label className="space-y-1 text-sm">
								<span className="text-text-secondary">Bot Token</span>
								<input
									type="password"
									value={config.channels.discord?.botToken ?? ""}
									onChange={(e) => {
										const value = e.target.value;
										void saveConfig((draft) => {
											draft.channels.discord.botToken = value;
											return draft;
										});
									}}
									className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
									placeholder="从 Discord Developer Portal 获取"
								/>
							</label>
							<label className="space-y-1 text-sm">
								<span className="text-text-secondary">Application ID</span>
								<input
									value={config.channels.discord?.applicationId ?? ""}
									onChange={(e) => {
										const value = e.target.value;
										void saveConfig((draft) => {
											draft.channels.discord.applicationId = value;
											return draft;
										});
									}}
									className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
									placeholder="应用 ID（可选）"
								/>
							</label>
						</div>
					}
				/>
			)}

			<SettingsSectionCard className="p-5 space-y-4">
				<div>
					<SettingsSectionTitle className="mb-1">
						安全与协议预留
					</SettingsSectionTitle>
					<p className="text-sm text-text-secondary">
						移动端网关方法与作用域已预留，首期默认关闭。
					</p>
				</div>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<label className="space-y-1 text-sm">
						<span className="text-text-secondary">交互超时（秒）</span>
						<input
							type="number"
							min={10}
							max={300}
							value={config.security.interactionTimeoutSec}
							onChange={(e) => {
								const value = Math.max(10, Number(e.target.value || 55));
								void saveConfig((draft) => {
									draft.security.interactionTimeoutSec = value;
									return draft;
								});
							}}
							className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-text-secondary">移动网关 Host</span>
						<input
							value={config.mobileGateway.host}
							onChange={(e) => {
								const value = e.target.value;
								void saveConfig((draft) => {
									draft.mobileGateway.host = value;
									return draft;
								});
							}}
							className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-text-secondary">移动网关 Port</span>
						<input
							type="number"
							min={1024}
							max={65535}
							value={config.mobileGateway.port}
							onChange={(e) => {
								const value = Math.max(1024, Number(e.target.value || 28777));
								void saveConfig((draft) => {
									draft.mobileGateway.port = value;
									return draft;
								});
							}}
							className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
						/>
					</label>
				</div>
				<div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
					<div className="inline-flex items-center gap-2">
						<Shield className="h-4 w-4" />
						默认 scopes：{config.security.defaultScopes.join(", ") || "-"}
					</div>
					<div className="inline-flex items-center gap-2">
						<Activity className="h-4 w-4" />
						移动端网关：{config.mobileGateway.enabled ? "启用" : "关闭"}
					</div>
				</div>
			</SettingsSectionCard>

			<SettingsSectionCard className="p-5 space-y-4">
				<div>
					<SettingsSectionTitle className="mb-1">配对管理</SettingsSectionTitle>
					<p className="text-sm text-text-secondary">
						首连用户默认进入待审批队列，审批后才能远程控制。
					</p>
				</div>
				<PairingList
					pending={pendingPairings}
					records={pairingRecords}
					onApprove={(id) => void handleApprove(id)}
					onReject={(id) => void handleReject(id)}
					onRevoke={(channelId, peerId) => void handleRevoke(channelId, peerId)}
					busyRequestId={busyRequestId}
					busyRevokeKey={busyRevokeKey}
				/>
			</SettingsSectionCard>

			<SettingsSectionCard className="p-5 space-y-4">
				<div>
					<SettingsSectionTitle className="mb-1">远程会话</SettingsSectionTitle>
					<p className="text-sm text-text-secondary">
						可查看最近远程任务并主动中断运行中的会话。
					</p>
				</div>
				<SessionList
					sessions={sessions}
					onStop={(runId) => void handleStopRun(runId)}
					busyRunId={busyRunId}
				/>
			</SettingsSectionCard>
		</SettingsPageContainer>
	);
}
