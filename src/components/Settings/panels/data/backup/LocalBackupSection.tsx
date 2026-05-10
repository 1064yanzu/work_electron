/**
 * LocalBackupSection — 本地备份入口 + 数据备份恢复卡片
 *
 * 组合两张子卡片：
 *   1. 本地备份目录设置 `LocalBackupDirectoryCard`（已有组件复用）
 *   2. 本地备份 / 恢复 / 导出 JSON 卡片 `LocalBackupRestoreCard`（已有组件复用，危险区已剥离）
 *
 * 本组件只是 index 层的一个业务分组，不增加新的 UI。
 * 危险区（清空全部数据）被拆到 `data.danger`，这里不再渲染。
 */
import type { SyncConfig } from "../../../../../lib/api";
import { LocalBackupDirectoryCard } from "../LocalBackupDirectoryCard";
import { LocalBackupRestoreCard } from "../LocalBackupRestoreCard";
import { formatSize } from "../utils";

interface LocalBackupSectionProps {
	syncConfig: SyncConfig;
	saveConfig: (patch: Partial<SyncConfig>) => Promise<void> | void;
	isBackingUpToLocal: boolean;
	setIsBackingUpToLocal: (value: boolean) => void;
	loadData: () => Promise<void> | void;
	onLocalBackup: () => void;
	onImport: () => void;
	onExport: () => void;
	onOpenBackupManager: () => void;
}

export function LocalBackupSection({
	syncConfig,
	saveConfig,
	isBackingUpToLocal,
	setIsBackingUpToLocal,
	loadData,
	onLocalBackup,
	onImport,
	onExport,
	onOpenBackupManager,
}: LocalBackupSectionProps) {
	return (
		<>
			<LocalBackupDirectoryCard
				syncConfig={syncConfig}
				saveConfig={saveConfig}
				isBackingUpToLocal={isBackingUpToLocal}
				setIsBackingUpToLocal={setIsBackingUpToLocal}
				loadData={loadData}
				formatSize={formatSize}
				onOpenBackupManager={onOpenBackupManager}
			/>
			<LocalBackupRestoreCard
				onLocalBackup={onLocalBackup}
				onImport={onImport}
				onExport={onExport}
			/>
		</>
	);
}
