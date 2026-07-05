/**
 * panels/data/storage/index.tsx — 「存储目录」二级 Tab 主入口
 *
 * 承载：
 *   - Vault 根目录 + 打开目录（`StorageSection`）
 *   - Obsidian 互通 / 冲突策略（`StorageSection` 内部 Disclosure）
 *   - 数据目录概览（`DataOverview`）
 *   - 数据目录路径 + 迁移数据库 + 清除缓存（`DataDirectories`）
 *   - 主题目录 CRUD（`ThemesManagerSection`）
 *
 * 不承载：本地备份 / WebDAV / 危险区（分别在 `data.backup` 与 `data.danger`）。
 */
import { HardDrive, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	clearCache,
	getDatabasePath,
	getDataDirectory,
	getDataStats,
	getStorageSettings,
	listThemes,
	pickStorageDirectory,
	updateStorageSettings,
	type DataStats,
	type StorageSettings,
	type Theme,
} from "../../../../../lib/api";
import { confirmDialog as confirmUI } from "../../../../ui/ConfirmDialog";
import { toast } from "../../../../ui/Toast";
import { SettingsPanelHeader } from "../../../components/SettingsPanelHeader";
import { DataDirectories } from "../DataDirectories";
import { DataOverview } from "../DataOverview";
import { SoftDeleteRetentionCard } from "../SoftDeleteRetentionCard";
import { formatSize } from "../utils";
import { StorageSection } from "./StorageSection";
import { ThemesManagerSection } from "./ThemesManagerSection";

export function DataStorageSettings() {
	const [dataStats, setDataStats] = useState<DataStats | null>(null);
	const [dataDir, setDataDir] = useState<string>("");
	const [dbPath, setDbPath] = useState<string>("");
	const [storageSettings, setStorageSettings] =
		useState<StorageSettings | null>(null);
	const [themes, setThemes] = useState<Theme[]>([]);
	const [isUpdatingStorage, setIsUpdatingStorage] = useState(false);

	const loadData = useCallback(async () => {
		try {
			const [stats, dir, path, storage, themeList] = await Promise.all([
				getDataStats(),
				getDataDirectory(),
				getDatabasePath(),
				getStorageSettings(),
				listThemes(),
			]);
			setDataStats(stats);
			setDataDir(dir);
			setDbPath(path);
			setStorageSettings(storage);
			setThemes(themeList);
		} catch (error) {
			console.error("加载存储设置失败:", error);
			toast.error(
				`加载失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, []);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const saveStorageConfig = useCallback(
		async (
			updates: Partial<StorageSettings>,
			options?: { migrate_existing?: boolean },
		) => {
			if (!storageSettings) return;
			setIsUpdatingStorage(true);
			try {
				const result = await updateStorageSettings({
					settings: updates,
					migrate_existing: options?.migrate_existing,
				});
				setStorageSettings(result.settings);
				if (result.migration) {
					toast.success(
						`迁移完成：资料 ${result.migration.sources}，文档 ${result.migration.outputs}`,
					);
				}
			} catch (error) {
				console.error("更新存储设置失败:", error);
				toast.error(
					`更新存储设置失败：${error instanceof Error ? error.message : String(error)}`,
				);
				throw error;
			} finally {
				setIsUpdatingStorage(false);
			}
		},
		[storageSettings],
	);

	const handleMigrateDatabase = useCallback(async () => {
		try {
			const picked = await pickStorageDirectory();
			if (!picked.path) return;
			const confirmed = await confirmUI.warning(
				`确定要迁移到新的 Vault 目录吗？\n\n${picked.path}\n\n将自动备份并迁移资料与文档。`,
				"迁移 Vault",
			);
			if (!confirmed) return;
			await saveStorageConfig(
				{ vault_root: picked.path },
				{ migrate_existing: true },
			);
			toast.success("Vault 迁移完成");
			await loadData();
		} catch (error) {
			toast.error(
				`迁移失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [loadData, saveStorageConfig]);

	const handleClearCache = useCallback(async () => {
		const confirmed = await confirmUI.warning(
			"确定要清除缓存吗？\n\n这将删除所有分享卡片图片。",
			"清除缓存",
		);
		if (!confirmed) return;
		try {
			const size = await clearCache();
			toast.success(`已清除 ${formatSize(size)} 缓存`);
			await loadData();
		} catch (error) {
			toast.error(
				`清除失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [loadData]);

	if (!storageSettings || !dataStats) {
		return (
			<div className="flex-1 h-full bg-background flex items-center justify-center">
				<RefreshCw className="w-5 h-5 animate-spin text-text-light" />
			</div>
		);
	}

	return (
		<div className="flex-1 h-full bg-background overflow-y-auto p-6 text-text-primary">
			<div className="max-w-2xl mx-auto space-y-6">
				<SettingsPanelHeader
					icon={HardDrive}
					title="存储目录"
					description="配置 Vault 根目录、Obsidian 互通与主题目录，保障本地数据的可迁移性。"
				/>

				<StorageSection
					storageSettings={storageSettings}
					onUpdate={saveStorageConfig}
					isUpdating={isUpdatingStorage}
				/>

				<DataOverview dataStats={dataStats} formatSize={formatSize} />

				<SoftDeleteRetentionCard />

				<DataDirectories
					dataDir={dataDir}
					dbPath={dbPath}
					dataStats={dataStats}
					formatSize={formatSize}
					onMigrateDatabase={handleMigrateDatabase}
					onClearCache={handleClearCache}
				/>

				<ThemesManagerSection themes={themes} onThemesChange={setThemes} />
			</div>
		</div>
	);
}

export default DataStorageSettings;
