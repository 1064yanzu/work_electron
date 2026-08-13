/**
 * WebdavSyncActions — WebDAV 自动备份设置 + 手动备份 / 恢复 + 多设备同步提示
 *
 * 同时包含两张卡片：
 *   1. 自动备份策略（开关、间隔、最大份数、精简备份、同步状态提示）
 *   2. 手动操作（备份到 WebDAV、从 WebDAV 恢复）
 *   3. 多设备同步说明 `SettingsHint`
 *
 * 所有 IO 动作透传给父组件，由父组件统一串联备份列表加载。
 */
import {
	AlertCircle,
	CheckCircle2,
	Clock,
	Download,
	RefreshCw,
	Upload,
	XCircle,
} from "lucide-react";
import type { SyncConfig } from "../../../../../lib/api";
import { Select } from "../../../../ui/Select";
import {
	SettingsButton,
	SettingsCardSection,
	SettingsHint,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
} from "../../../ui/SettingsPrimitives";

interface WebdavSyncActionsProps {
	syncConfig: SyncConfig;
	saveConfig: (patch: Partial<SyncConfig>) => Promise<void> | void;
	isSyncing: boolean;
	onBackupToWebdav: () => Promise<void> | void;
	onOpenBackupManager: () => Promise<void> | void;
}

export function WebdavSyncActions({
	syncConfig,
	saveConfig,
	isSyncing,
	onBackupToWebdav,
	onOpenBackupManager,
}: WebdavSyncActionsProps) {
	const enabled = !!syncConfig.webdav_enabled;
	const autoSync = !!syncConfig.webdav_auto_sync;

	return (
		<>
			<SettingsCardSection
				className={!enabled ? "opacity-50 pointer-events-none" : ""}
				title="自动备份策略"
				bodyClassName="p-5"
			>
				{autoSync && (
					<div className="flex items-center gap-2 text-xs bg-warm-50 rounded-lg px-3 py-2 mb-4">
						{isSyncing ? (
							<>
								<RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
								<span className="text-text-secondary">正在同步…</span>
							</>
						) : syncConfig.webdav_last_sync_error ? (
							<>
								<XCircle className="w-3.5 h-3.5 text-error" />
								<span className="text-error">
									同步失败: {syncConfig.webdav_last_sync_error}
								</span>
							</>
						) : syncConfig.webdav_last_sync_at ? (
							<>
								<CheckCircle2
									className="w-3.5 h-3.5 bai-icon-mint"
									strokeWidth={1.5}
								/>
								<span className="text-text-muted">
									上次同步:{" "}
									{new Date(syncConfig.webdav_last_sync_at).toLocaleString(
										"zh-CN",
									)}
								</span>
							</>
						) : (
							<>
								<Clock className="w-3.5 h-3.5 text-text-light" />
								<span className="text-text-light">尚未同步</span>
							</>
						)}
					</div>
				)}

				<SettingsRow
					label="自动备份"
					description="定期自动备份数据到 WebDAV"
					action={
						<SettingsSwitch
							checked={autoSync}
							onChange={(v) => void saveConfig({ webdav_auto_sync: v })}
							disabled={!enabled}
						/>
					}
				/>
				<SettingsRow
					label="备份间隔"
					action={
						<Select
							value={String(syncConfig.webdav_sync_interval ?? 0)}
							onChange={(e) =>
								void saveConfig({
									webdav_sync_interval: parseInt(e.target.value, 10),
								})
							}
							disabled={!enabled || !autoSync}
							variant="inline"
							containerClassName="w-auto"
							options={[
								{ value: "0", label: "关闭" },
								{ value: "1", label: "1 分钟" },
								{ value: "5", label: "5 分钟" },
								{ value: "15", label: "15 分钟" },
								{ value: "30", label: "30 分钟" },
								{ value: "60", label: "1 小时" },
								{ value: "120", label: "2 小时" },
								{ value: "360", label: "6 小时" },
								{ value: "720", label: "12 小时" },
								{ value: "1440", label: "24 小时" },
							]}
						/>
					}
				/>
				<SettingsRow
					label="最大备份数"
					description="超出后自动删除旧备份"
					action={
						<Select
							value={String(syncConfig.webdav_max_backups ?? 0)}
							onChange={(e) =>
								void saveConfig({
									webdav_max_backups: parseInt(e.target.value, 10),
								})
							}
							disabled={!enabled}
							variant="inline"
							containerClassName="w-auto"
							options={[
								{ value: "0", label: "无限制" },
								{ value: "1", label: "1 份" },
								{ value: "3", label: "3 份" },
								{ value: "5", label: "5 份" },
								{ value: "10", label: "10 份" },
								{ value: "20", label: "20 份" },
								{ value: "50", label: "50 份" },
							]}
						/>
					}
				/>
				<SettingsRow
					label="精简备份"
					description="仅备份设置和记录，不包含大文件"
					action={
						<SettingsSwitch
							checked={syncConfig.webdav_skip_backup_file ?? false}
							onChange={(v) => void saveConfig({ webdav_skip_backup_file: v })}
							disabled={!enabled}
						/>
					}
				/>
			</SettingsCardSection>

			<SettingsSectionCard
				className={!enabled ? "opacity-50 pointer-events-none" : ""}
			>
				<div
					className="p-5"
					id="data.backup.webdav_actions"
					data-settings-anchor="data.backup.webdav_actions"
				>
					<SettingsSectionTitle>数据备份与恢复</SettingsSectionTitle>
					<div className="flex gap-3">
						<SettingsButton
							variant="primary"
							icon={isSyncing ? undefined : Upload}
							loading={isSyncing}
							disabled={!enabled || isSyncing}
							onClick={() => void onBackupToWebdav()}
							pill={false}
							className="flex-1 py-3 text-sm"
						>
							备份到 WebDAV
						</SettingsButton>
						<SettingsButton
							icon={Download}
							disabled={
								!syncConfig.webdav_url ||
								!syncConfig.webdav_username ||
								!syncConfig.webdav_password
							}
							onClick={() => void onOpenBackupManager()}
							pill={false}
							className="flex-1 py-3 text-sm"
						>
							从 WebDAV 恢复
						</SettingsButton>
					</div>
					{syncConfig.last_sync_at && (
						<div className="text-xs text-text-light mt-3">
							上次同步:{" "}
							{new Date(syncConfig.last_sync_at).toLocaleString("zh-CN")}
						</div>
					)}
				</div>
			</SettingsSectionCard>

			<SettingsHint icon={AlertCircle} title="多设备同步">
				在多台设备上使用相同的 WebDAV 配置即可实现数据同步。建议每次使用前先从
				WebDAV 恢复最新数据，使用完毕再备份回去。
			</SettingsHint>
		</>
	);
}
