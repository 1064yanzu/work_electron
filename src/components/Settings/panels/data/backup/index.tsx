/**
 * panels/data/backup/index.tsx — 「备份与同步」二级 Tab 主入口
 *
 * 承载：
 *   - 本地备份目录设置 + 立即备份（`LocalBackupSection`）
 *   - 本地备份文件管理（`BackupsManagerModal`）
 *   - 数据备份 / 恢复 / 导出 JSON（`LocalBackupRestoreCard`，`LocalBackupSection` 内部）
 *   - WebDAV 状态卡片（`WebdavStatusCard`）
 *   - WebDAV 连接表单 + 测试连接（`WebdavConnectionForm`）
 *   - WebDAV 自动备份策略 + 手动备份 / 恢复（`WebdavSyncActions`）
 *   - WebDAV 备份列表弹窗（`WebdavBackupListModal`）
 *
 * 危险区（清空全部数据）被拆到 `data.danger`，此处不再渲染。
 */
import { Blocks, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	backupToWebdav,
	deleteWebdavBackup,
	exportAllData,
	exportAllDataToFile,
	deleteFileSafe,
	getSyncConfig,
	importDataFromJson,
	listWebdavBackups,
	restoreFromWebdav,
	type SyncConfig,
	type WebDavConfig,
	type WebdavBackupFile,
	updateSyncConfig,
	backupToLocalDir,
	selectBackupDirectory,
} from "../../../../../lib/api";
import { safeInvoke } from "../../../../../lib/tauriBridge";
import { confirmDialog as confirmUI } from "../../../../ui/ConfirmDialog";
import { toast } from "../../../../ui/Toast";
import { SettingsPanelHeader } from "../../../components/SettingsPanelHeader";
import { BackupsManagerModal } from "./BackupsManagerModal";
import { LocalBackupSection } from "./LocalBackupSection";
import { WebdavBackupListModal } from "./WebdavBackupListModal";
import { WebdavConnectionForm } from "./WebdavConnectionForm";
import { WebdavStatusCard } from "./WebdavStatusCard";
import { WebdavSyncActions } from "./WebdavSyncActions";

export function DataBackupSettings() {
	const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
	const [webdavBackups, setWebdavBackups] = useState<WebdavBackupFile[]>([]);
	const [isSyncing, setIsSyncing] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [isBackupManagerOpen, setIsBackupManagerOpen] = useState(false);
	const [isLoadingBackups, setIsLoadingBackups] = useState(false);
	const [isDeletingBackup, setIsDeletingBackup] = useState<string | null>(null);
	const [isBackingUpToLocal, setIsBackingUpToLocal] = useState(false);
	const [isLocalBackupManagerOpen, setIsLocalBackupManagerOpen] =
		useState(false);

	const loadData = useCallback(async () => {
		try {
			const config = await getSyncConfig();
			setSyncConfig(config);
		} catch (error) {
			console.error("加载同步配置失败:", error);
			toast.error(
				`加载失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, []);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const saveConfig = useCallback(
		async (patch: Partial<SyncConfig>) => {
			if (!syncConfig) return;
			const next = { ...syncConfig, ...patch };
			setSyncConfig(next);
			try {
				await updateSyncConfig(next);
			} catch (error) {
				console.error("保存同步配置失败:", error);
				toast.error(
					`保存失败：${error instanceof Error ? error.message : String(error)}`,
				);
				// 回滚到上一个已保存值
				await loadData();
			}
		},
		[syncConfig, loadData],
	);

	const buildWebdavConfig = useCallback(
		(fileName?: string): WebDavConfig => ({
			webdavHost: syncConfig?.webdav_url || "",
			webdavUser: syncConfig?.webdav_username || undefined,
			webdavPass: syncConfig?.webdav_password || undefined,
			webdavPath: syncConfig?.webdav_path || "/",
			fileName,
		}),
		[syncConfig],
	);

	// WebDAV 备份
	const handleBackupToWebdav = useCallback(async () => {
		setIsSyncing(true);
		let exportedPath: string | null = null;
		try {
			// D9：导出内容落在主进程临时文件，IPC 只传 { path, bytes }；
			// 上传需要 JSON 内容时再按路径读取（backup_to_webdav 协议仍接收 data 字符串）
			const exported = await exportAllData();
			exportedPath = exported.path;
			const file = await safeInvoke<{ content: string }>("read_file_safe", {
				path: exported.path,
			});
			const config = buildWebdavConfig(
				`backup_${new Date().toISOString().replace(/[:.]/g, "-")}.zip`,
			);
			await backupToWebdav(file.content, config);
			toast.success("备份成功！");
			await loadData();
			try {
				const backups = await listWebdavBackups(buildWebdavConfig());
				setWebdavBackups(backups);
			} catch {
				// 列出备份失败不阻塞备份成功结果
			}
		} catch (error) {
			toast.error(
				`备份失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			// 上传完成后清理临时导出文件（失败不影响主流程）
			if (exportedPath) {
				void deleteFileSafe(exportedPath).catch(() => {});
			}
			setIsSyncing(false);
		}
	}, [buildWebdavConfig, loadData]);

	// 打开 WebDAV 备份管理器
	const handleOpenWebdavBackups = useCallback(async () => {
		setIsBackupManagerOpen(true);
		setIsLoadingBackups(true);
		setWebdavBackups([]);
		try {
			const backups = await listWebdavBackups(buildWebdavConfig());
			setWebdavBackups(backups);
		} catch (error) {
			console.error("加载备份列表失败:", error);
			toast.error(
				`加载备份列表失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setIsLoadingBackups(false);
		}
	}, [buildWebdavConfig]);

	// 从 WebDAV 恢复
	const handleRestoreFromWebdav = useCallback(
		async (fileName: string) => {
			const confirmed = await confirmUI.danger(
				`确定要从备份 "${fileName}" 恢复数据吗？\n\n这将覆盖当前所有数据！\n\n此操作不可撤销。`,
				"恢复数据",
			);
			if (!confirmed) return;
			setIsRestoring(true);
			try {
				await restoreFromWebdav(buildWebdavConfig(fileName));
				toast.success("数据恢复成功！页面即将刷新", 2000);
				setIsBackupManagerOpen(false);
				setTimeout(() => window.location.reload(), 2000);
			} catch (error) {
				toast.error(
					`恢复失败：${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				setIsRestoring(false);
			}
		},
		[buildWebdavConfig],
	);

	// 删除 WebDAV 备份
	const handleDeleteWebdavBackup = useCallback(
		async (fileName: string) => {
			const confirmed = await confirmUI.danger(
				`确定要删除备份 "${fileName}" 吗？\n\n此操作不可撤销！`,
				"删除备份",
			);
			if (!confirmed) return;
			setIsDeletingBackup(fileName);
			try {
				await deleteWebdavBackup(fileName, buildWebdavConfig());
				setWebdavBackups((prev) => prev.filter((f) => f.fileName !== fileName));
				toast.success("备份删除成功");
			} catch (error) {
				toast.error(
					`删除失败：${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				setIsDeletingBackup(null);
			}
		},
		[buildWebdavConfig],
	);

	// 本地备份（立即备份到已配置的本地备份目录）
	//
	// 目录未配置时先唤起原生目录选择器并记住选择，避免这个按钮变成一个
	// 「点了没反应」的死按钮——它和「本地备份目录」卡片里的「立即备份」
	// 共用同一个目录配置与同一条后端链路（backup_to_local_dir）。
	const handleLocalBackup = useCallback(async () => {
		setIsBackingUpToLocal(true);
		try {
			let dir = syncConfig?.local_backup_dir ?? null;
			if (!dir) {
				const picked = await selectBackupDirectory();
				if (!picked.path) return;
				dir = picked.path;
				await saveConfig({ local_backup_dir: dir });
			}
			const result = await backupToLocalDir(dir);
			toast.success(`备份已保存到：${result.path}`, 5000);
			await loadData();
		} catch (error) {
			toast.error(
				`备份失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setIsBackingUpToLocal(false);
		}
	}, [loadData, saveConfig, syncConfig?.local_backup_dir]);

	// 导出 JSON（D9：主进程保存对话框 + 直接写盘，整串 JSON 不再经过渲染端）
	const handleExport = useCallback(async () => {
		try {
			const result = await exportAllDataToFile();
			if (result.canceled) return;
			toast.success(`数据已导出到：${result.path}`, 5000);
		} catch (error) {
			toast.error(
				`导出失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, []);

	// 导入 JSON
	const handleImport = useCallback(() => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;
			try {
				const text = await file.text();
				const data = JSON.parse(text);

				if (!data.version) {
					toast.error("数据格式无效");
					return;
				}

				const statsText = [
					(data.sources?.length || data?.data?.sources?.length) &&
						`${data.sources?.length || data?.data?.sources?.length} 条资料`,
					(data.notes?.length || data?.data?.notes?.length) &&
						`${data.notes?.length || data?.data?.notes?.length} 条笔记`,
					(data.outputs?.length ||
						data.output_assets?.length ||
						data?.data?.outputs?.length ||
						data?.data?.output_assets?.length) &&
						`${
							data.outputs?.length ||
							data.output_assets?.length ||
							data?.data?.outputs?.length ||
							data?.data?.output_assets?.length
						} 篇文稿`,
				]
					.filter(Boolean)
					.join("、");

				const confirmed = await confirmUI.warning(
					`确认恢复数据吗？\n\n包含：${statsText || "无数据"}\n\n将先清空当前数据，再按备份内容全量覆盖。`,
					"导入数据",
				);
				if (!confirmed) return;

				await importDataFromJson(text, {
					overwrite: true,
					clear_all_first: true,
				});
				toast.success("数据导入成功！页面即将刷新", 2000);
				setTimeout(() => window.location.reload(), 2000);
			} catch (error) {
				toast.error(
					`导入失败：${error instanceof Error ? error.message : String(error)}`,
				);
			}
		};
		input.click();
	}, []);

	if (!syncConfig) {
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
					icon={Blocks}
					title="备份与同步"
					description="配置本地备份与 WebDAV 远程同步，确保数据的多地冗余。"
				/>

				<LocalBackupSection
					syncConfig={syncConfig}
					saveConfig={saveConfig}
					isBackingUpToLocal={isBackingUpToLocal}
					setIsBackingUpToLocal={setIsBackingUpToLocal}
					loadData={loadData}
					onLocalBackup={handleLocalBackup}
					onImport={handleImport}
					onExport={handleExport}
					onOpenBackupManager={() => setIsLocalBackupManagerOpen(true)}
				/>

				<WebdavStatusCard
					syncConfig={syncConfig}
					onToggle={(v) => void saveConfig({ webdav_enabled: v })}
				/>

				<WebdavConnectionForm
					syncConfig={syncConfig}
					saveConfig={saveConfig}
					buildWebdavConfig={buildWebdavConfig}
				/>

				<WebdavSyncActions
					syncConfig={syncConfig}
					saveConfig={saveConfig}
					isSyncing={isSyncing}
					onBackupToWebdav={handleBackupToWebdav}
					onOpenBackupManager={handleOpenWebdavBackups}
				/>
			</div>

			<WebdavBackupListModal
				isOpen={isBackupManagerOpen}
				onClose={() => setIsBackupManagerOpen(false)}
				backups={webdavBackups}
				isLoading={isLoadingBackups}
				isRestoring={isRestoring}
				isDeletingFile={isDeletingBackup}
				onRefresh={handleOpenWebdavBackups}
				onRestore={handleRestoreFromWebdav}
				onDelete={handleDeleteWebdavBackup}
			/>

			{syncConfig.local_backup_dir && (
				<BackupsManagerModal
					isOpen={isLocalBackupManagerOpen}
					onClose={() => setIsLocalBackupManagerOpen(false)}
					backupDir={syncConfig.local_backup_dir}
					onRestoreSuccess={loadData}
				/>
			)}
		</div>
	);
}

export default DataBackupSettings;
