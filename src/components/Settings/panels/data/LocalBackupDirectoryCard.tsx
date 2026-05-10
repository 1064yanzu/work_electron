// 本地备份目录设置卡片 — 选择目录、间隔、最大保留数、立即备份、管理备份
//
// 从 DataSettings 主文件抽出。承担本地备份相关的 UI；备份执行委托给 props 回调。

import { Archive, FolderOpen, HardDrive, RefreshCw } from "lucide-react";
import type { SyncConfig } from "../../../../lib/api";
import { backupToLocalDir, selectBackupDirectory } from "../../../../lib/api";
import { Select } from "../../../ui/Select";
import {
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
} from "../../ui/SettingsPrimitives";
import { toast } from "../../../ui/Toast";

interface LocalBackupDirectoryCardProps {
	syncConfig: SyncConfig;
	saveConfig: (patch: Partial<SyncConfig>) => Promise<void> | void;
	isBackingUpToLocal: boolean;
	setIsBackingUpToLocal: (value: boolean) => void;
	loadData: () => Promise<void> | void;
	formatSize: (bytes: number) => string;
	onOpenBackupManager: () => void;
}

export function LocalBackupDirectoryCard({
	syncConfig,
	saveConfig,
	isBackingUpToLocal,
	setIsBackingUpToLocal,
	loadData,
	formatSize,
	onOpenBackupManager,
}: LocalBackupDirectoryCardProps) {
	const handleSelectDirectory = async () => {
		const result = await selectBackupDirectory();
		if (result.path) {
			saveConfig({ local_backup_dir: result.path });
		}
	};

	const handleBackupNow = async () => {
		if (!syncConfig.local_backup_dir) return;
		setIsBackingUpToLocal(true);
		try {
			const result = await backupToLocalDir(syncConfig.local_backup_dir);
			toast.success(`备份成功，文件大小 ${formatSize(result.size)}`);
			await loadData();
		} catch (error) {
			toast.error(`备份失败: ${error}`);
		} finally {
			setIsBackingUpToLocal(false);
		}
	};

	return (
		<SettingsSectionCard>
			<div
				className="p-5"
				id="data.backup.local_dir"
				data-settings-anchor="data.backup.local_dir"
			>
				<SettingsSectionTitle>本地备份目录</SettingsSectionTitle>
				<SettingsRow
					label="备份目录"
					description={syncConfig.local_backup_dir || "未设置"}
					action={
						<button
							onClick={handleSelectDirectory}
							className="flex items-center gap-2 px-3 py-1.5 text-xs bg-warm-200 hover:bg-warm-300 rounded-lg transition-colors"
						>
							<FolderOpen className="w-3.5 h-3.5" />
							选择目录
						</button>
					}
				/>
				{syncConfig.local_backup_dir && (
					<>
						<SettingsRow
							label="自动备份"
							description="定期自动备份到本地目录"
							action={
								<SettingsSwitch
									checked={syncConfig.local_backup_auto_sync ?? false}
									onChange={(v) => saveConfig({ local_backup_auto_sync: v })}
								/>
							}
						/>
						<SettingsRow
							label="备份间隔"
							action={
								<Select
									value={String(syncConfig.local_backup_interval ?? 60)}
									onChange={(e) =>
										saveConfig({
											local_backup_interval: parseInt(e.target.value),
										})
									}
									disabled={!syncConfig.local_backup_auto_sync}
									variant="inline"
									containerClassName="w-auto"
									options={[
										{ value: "5", label: "5 分钟" },
										{ value: "15", label: "15 分钟" },
										{ value: "30", label: "30 分钟" },
										{ value: "60", label: "1 小时" },
										{ value: "180", label: "3 小时" },
									]}
								/>
							}
						/>
						<SettingsRow
							label="最大备份数"
							description="超出后自动删除旧备份"
							action={
								<Select
									value={String(syncConfig.local_backup_max_count ?? 10)}
									onChange={(e) =>
										saveConfig({
											local_backup_max_count: parseInt(e.target.value),
										})
									}
									variant="inline"
									containerClassName="w-auto"
									options={[
										{ value: "5", label: "5 份" },
										{ value: "10", label: "10 份" },
										{ value: "20", label: "20 份" },
										{ value: "50", label: "50 份" },
									]}
								/>
							}
						/>
						<div className="flex gap-3 mt-4">
							<button
								onClick={handleBackupNow}
								disabled={isBackingUpToLocal}
								className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
							>
								{isBackingUpToLocal ? (
									<RefreshCw className="w-4 h-4 animate-spin" />
								) : (
									<Archive className="w-4 h-4" />
								)}
								立即备份
							</button>
							<button
								onClick={onOpenBackupManager}
								className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-warm-200 hover:bg-warm-300 rounded-xl text-sm font-medium transition-colors"
							>
								<HardDrive className="w-4 h-4" />
								管理备份
							</button>
						</div>
						{syncConfig.local_backup_last_sync_at && (
							<div className="text-xs text-text-light mt-3">
								上次备份:{" "}
								{new Date(
									syncConfig.local_backup_last_sync_at,
								).toLocaleString()}
							</div>
						)}
					</>
				)}
			</div>
		</SettingsSectionCard>
	);
}
