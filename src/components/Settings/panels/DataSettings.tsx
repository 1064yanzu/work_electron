import {
	AlertCircle,
	CheckCircle2,
	Clock,
	Cloud,
	CloudOff,
	Download,
	Eye,
	EyeOff,
	HardDrive,
	RefreshCw,
	ShieldAlert,
	Trash2,
	Upload,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	backupToLocal,
	backupToWebdav,
	clearAllData,
	clearCache,
	type DataStats,
	deleteWebdavBackup,
	exportAllData,
	getDatabasePath,
	getDataDirectory,
	getDataStats,
	getSyncConfig,
	importDataFromJson,
	listWebdavBackups,
	restoreFromWebdav,
	type SyncConfig,
	setDatabasePath,
	testWebdavConnection,
	updateSyncConfig,
} from "../../../lib/api";
import { confirmDialog, saveFilePath } from "../../../lib/dialogCompat";
import { Modal } from "../components";

// 格式化文件大小
function formatSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / k ** i).toFixed(2)) + " " + sizes[i];
}

// 格式化时间
function formatTime(dateStr: string | null): string {
	if (!dateStr) return "从未";
	const date = new Date(dateStr);
	const now = new Date();
	const diff = now.getTime() - date.getTime();

	if (diff < 60000) return "刚刚";
	if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;

	return date.toLocaleString("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

// 切换开关组件
function Toggle({
	checked,
	onChange,
	disabled,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			onClick={() => !disabled && onChange(!checked)}
			className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${checked ? "bg-primary" : "bg-zinc-200"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
		>
			<span
				className={`
          inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform
          ${checked ? "translate-x-6" : "translate-x-1"}
        `}
			/>
		</button>
	);
}

// 设置行组件
function SettingRow({
	label,
	description,
	value,
	action,
}: {
	label: string;
	description?: string;
	value?: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between py-4 border-b border-zinc-100 last:border-0">
			<div className="flex-1 min-w-0">
				<div className="text-sm font-medium text-zinc-800">{label}</div>
				{description && (
					<div className="text-xs text-zinc-400 mt-0.5 truncate">
						{description}
					</div>
				)}
			</div>
			<div className="flex items-center gap-3 ml-4">
				{value && <div className="text-sm text-zinc-500">{value}</div>}
				{action}
			</div>
		</div>
	);
}

// 分区标题组件
function SectionTitle({
	children,
	className = "",
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<h4
			className={`text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3 ${className}`}
		>
			{children}
		</h4>
	);
}

// 分区卡片组件
function SectionCard({
	children,
	className = "",
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={`bg-white rounded-2xl ring-1 ring-black/[0.03] shadow-[0_2px_8px_rgb(0,0,0,0.04)] ${className}`}
		>
			{children}
		</div>
	);
}

export function DataSettings() {
	// 同步配置状态
	const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
	const [dataStats, setDataStats] = useState<DataStats | null>(null);
	const [dataDir, setDataDir] = useState<string>("");
	const [dbPath, setDbPath] = useState<string>("");

	// UI 状态
	const [activeSection, setActiveSection] = useState<"storage" | "webdav">(
		"storage",
	);
	const [isTestingConnection, setIsTestingConnection] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<
		"idle" | "success" | "error"
	>("idle");
	const [isSyncing, setIsSyncing] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [webdavBackups, setWebdavBackups] = useState<string[]>([]);

	// 危险操作
	const [isDangerOpen, setIsDangerOpen] = useState(false);
	const [confirmPhrase, setConfirmPhrase] = useState("");
	const [isClearing, setIsClearing] = useState(false);

	// 备份管理弹窗
	const [isBackupManagerOpen, setIsBackupManagerOpen] = useState(false);
	const [isLoadingBackups, setIsLoadingBackups] = useState(false);
	const [isDeletingBackup, setIsDeletingBackup] = useState<string | null>(null);

	// 加载数据
	const loadData = useCallback(async () => {
		try {
			const [config, stats, dir, path] = await Promise.all([
				getSyncConfig(),
				getDataStats(),
				getDataDirectory(),
				getDatabasePath(),
			]);
			setSyncConfig(config);
			setDataStats(stats);
			setDataDir(dir);
			setDbPath(path);
		} catch (error) {
			console.error("加载数据设置失败:", error);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	// 保存配置
	const saveConfig = async (updates: Partial<SyncConfig>) => {
		if (!syncConfig) return;
		const newConfig = { ...syncConfig, ...updates };
		setSyncConfig(newConfig);
		try {
			await updateSyncConfig(newConfig);
		} catch (error) {
			console.error("保存配置失败:", error);
		}
	};

	// 测试 WebDAV 连接
	const handleTestConnection = async () => {
		if (
			!syncConfig?.webdav_url ||
			!syncConfig?.webdav_username ||
			!syncConfig?.webdav_password
		) {
			alert("请填写完整的 WebDAV 配置");
			return;
		}

		setIsTestingConnection(true);
		setConnectionStatus("idle");

		try {
			const result = await testWebdavConnection(
				syncConfig.webdav_url,
				syncConfig.webdav_username,
				syncConfig.webdav_password,
			);

			if (result.success) {
				setConnectionStatus("success");
				// 连接成功后尝试加载备份列表（但不影响连接状态）
				if (syncConfig.webdav_enabled) {
					try {
						const backups = await listWebdavBackups();
						setWebdavBackups(backups);
					} catch {
						// 备份列表加载失败不影响连接测试结果
						console.log("备份列表加载失败，可能是同步目录尚未创建");
					}
				}
			} else {
				setConnectionStatus("error");
				alert(result.message);
			}
		} catch (error) {
			setConnectionStatus("error");
			alert(`测试失败: ${error}`);
		} finally {
			setIsTestingConnection(false);
		}
	};

	// 备份到 WebDAV
	const handleBackupToWebdav = async () => {
		setIsSyncing(true);
		try {
			const filename = await backupToWebdav();
			alert(`✅ 备份成功: ${filename}`);
			await loadData();
			const backups = await listWebdavBackups();
			setWebdavBackups(backups);
		} catch (error) {
			alert(`备份失败: ${error}`);
		} finally {
			setIsSyncing(false);
		}
	};

	// 本地备份
	const handleLocalBackup = async () => {
		try {
			const path = await backupToLocal();
			alert(`✅ 备份已保存到:\n${path}`);
			await loadData();
		} catch (error) {
			alert(`备份失败: ${error}`);
		}
	};

	// 导出数据
	const handleExport = async () => {
		try {
			const data = await exportAllData();
			const blob = new Blob([data], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `workbench-backup-${new Date().toISOString().split("T")[0]}.json`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			alert(`导出失败: ${error}`);
		}
	};

	// 导入数据
	const handleImport = () => {
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
					alert("❌ 数据格式无效");
					return;
				}

				const stats = [
					data.sources?.length && `${data.sources.length} 条资料`,
					data.notes?.length && `${data.notes.length} 条笔记`,
					data.outputs?.length && `${data.outputs.length} 篇文稿`,
				]
					.filter(Boolean)
					.join("、");

				if (
					confirm(
						`确认导入数据吗？\n\n包含: ${stats || "无数据"}\n\n⚠️ 导入会合并到现有数据`,
					)
				) {
					await importDataFromJson(text);
					alert("✅ 数据导入成功！");
					window.location.reload();
				}
			} catch (error) {
				alert(`❌ 导入失败: ${error}`);
			}
		};
		input.click();
	};

	// 清除缓存
	const handleClearCache = async () => {
		if (!confirm("确定要清除缓存吗？这将删除所有分享卡片图片。")) return;
		try {
			const size = await clearCache();
			alert(`✅ 已清除 ${formatSize(size)} 缓存`);
			await loadData();
		} catch (error) {
			alert(`清除失败: ${error}`);
		}
	};

	// 迁移数据库
	const handleMigrateDatabase = async () => {
		try {
			// 使用 Tauri 文件对话框选择保存位置
			const newPath = await saveFilePath({
				title: "选择新的数据库保存位置",
				defaultPath: dbPath,
			});

			if (!newPath) return;

			const confirmed = await confirmDialog(
				`确定要将数据库迁移到以下位置吗？\n\n${newPath}\n\n迁移后应用将使用新位置的数据库。`,
			);
			if (!confirmed) return;

			await setDatabasePath(newPath);
			alert(`✅ 数据库已成功迁移到:\n${newPath}\n\n请重启应用以使用新数据库。`);
			await loadData();
		} catch (error) {
			alert(`迁移失败: ${error}`);
		}
	};

	// 打开备份管理器
	const handleOpenBackupManager = async () => {
		setIsBackupManagerOpen(true);
		setIsLoadingBackups(true);
		setWebdavBackups([]); // 先清空
		try {
			const backups = await listWebdavBackups();
			console.log("获取到的备份列表:", backups);
			setWebdavBackups(backups);
		} catch (error) {
			console.error("加载备份列表失败:", error);
			alert(`加载备份列表失败: ${error}`);
		} finally {
			setIsLoadingBackups(false);
		}
	};

	// 从备份恢复
	const handleRestoreFromBackup = async (filename: string) => {
		if (
			!confirm(
				`确定要从备份 "${filename}" 恢复数据吗？\n\n这将覆盖当前所有数据！`,
			)
		)
			return;

		setIsRestoring(true);
		try {
			await restoreFromWebdav(filename);
			alert("✅ 数据恢复成功！");
			setIsBackupManagerOpen(false);
			await loadData();
		} catch (error) {
			alert(`恢复失败: ${error}`);
		} finally {
			setIsRestoring(false);
		}
	};

	// 删除备份
	const handleDeleteBackup = async (filename: string) => {
		if (!confirm(`确定要删除备份 "${filename}" 吗？\n\n此操作不可撤销！`))
			return;

		setIsDeletingBackup(filename);
		try {
			await deleteWebdavBackup(filename);
			setWebdavBackups((prev) => prev.filter((f) => f !== filename));
		} catch (error) {
			alert(`删除失败: ${error}`);
		} finally {
			setIsDeletingBackup(null);
		}
	};

	// 解析备份文件名获取时间
	const parseBackupTime = (filename: string): string => {
		// backup_20251130_132758.json -> 2025-11-30 13:27:58
		const match = filename.match(
			/backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/,
		);
		if (match) {
			const [, year, month, day, hour, min, sec] = match;
			return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
		}
		return filename;
	};

	if (!syncConfig || !dataStats) {
		return (
			<div className="flex-1 h-full bg-[#F7F7F5] flex items-center justify-center">
				<RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
			</div>
		);
	}

	return (
		<div className="flex-1 h-full bg-[#F7F7F5] overflow-hidden">
			<div className="h-full flex">
				{/* 左侧导航 */}
				<div className="w-52 border-r border-zinc-200/60 bg-white/50 p-4">
					<nav className="space-y-1">
						<button
							onClick={() => setActiveSection("storage")}
							className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeSection === "storage"
									? "bg-primary/10 text-primary"
									: "text-zinc-600 hover:bg-zinc-100"
								}`}
						>
							<HardDrive className="w-4 h-4" />
							数据目录
						</button>
						<button
							onClick={() => setActiveSection("webdav")}
							className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeSection === "webdav"
									? "bg-primary/10 text-primary"
									: "text-zinc-600 hover:bg-zinc-100"
								}`}
						>
							<Cloud className="w-4 h-4" />
							WebDAV
						</button>
					</nav>
				</div>

				{/* 右侧内容 */}
				<div className="flex-1 overflow-y-auto p-6">
					<div className="max-w-2xl mx-auto space-y-6">
						{activeSection === "storage" && (
							<>
								{/* 数据统计 */}
								<SectionCard>
									<div className="p-5">
										<SectionTitle>数据概览</SectionTitle>
										<div className="grid grid-cols-3 gap-4">
											<div className="text-center p-4 bg-zinc-50 rounded-xl">
												<div className="text-2xl font-semibold text-zinc-800">
													{(dataStats.sources_count ?? 0) + (dataStats.notes_count ?? 0)}
												</div>
												<div className="text-xs text-zinc-400 mt-1">
													资料与笔记
												</div>
											</div>
											<div className="text-center p-4 bg-zinc-50 rounded-xl">
												<div className="text-2xl font-semibold text-zinc-800">
													{dataStats.outputs_count ?? 0}
												</div>
												<div className="text-xs text-zinc-400 mt-1">
													输出文稿
												</div>
											</div>
											<div className="text-center p-4 bg-zinc-50 rounded-xl">
												<div className="text-2xl font-semibold text-zinc-800">
													{formatSize(
														(dataStats.database_size ?? 0) + (dataStats.media_size ?? 0),
													)}
												</div>
												<div className="text-xs text-zinc-400 mt-1">总占用</div>
											</div>
										</div>
									</div>
								</SectionCard>

								{/* 数据目录 */}
								<SectionCard>
									<div className="p-5">
										<SectionTitle>数据目录</SectionTitle>
										<SettingRow
											label="应用数据"
											description={dataDir}
											action={
												<button
													onClick={() => {
														navigator.clipboard.writeText(dataDir);
														alert("路径已复制");
													}}
													className="text-xs text-primary hover:underline"
												>
													复制路径
												</button>
											}
										/>
										<SettingRow
											label="数据库文件"
											description={dbPath}
											action={
												<button
													onClick={handleMigrateDatabase}
													className="px-3 py-1.5 text-xs bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
												>
													迁移数据库
												</button>
											}
										/>
										<SettingRow
											label="数据库大小"
											value={formatSize(dataStats.database_size)}
										/>
										<SettingRow
											label="媒体文件"
											value={formatSize(dataStats.media_size)}
										/>
										<SettingRow
											label="缓存"
											description="分享卡片等临时文件"
											value={formatSize(dataStats.cache_size)}
											action={
												<button
													onClick={handleClearCache}
													className="px-3 py-1.5 text-xs bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
												>
													清除缓存
												</button>
											}
										/>
									</div>
								</SectionCard>

								{/* 备份与恢复 */}
								<SectionCard>
									<div className="p-5">
										<SectionTitle>数据备份与恢复</SectionTitle>
										<div className="flex gap-3 mb-4">
											<button
												onClick={handleLocalBackup}
												className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-medium transition-colors"
											>
												<Download className="w-4 h-4" />
												备份
											</button>
											<button
												onClick={handleImport}
												className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-medium transition-colors"
											>
												<Upload className="w-4 h-4" />
												恢复
											</button>
										</div>
										<SettingRow
											label="导出为 JSON"
											description="导出所有数据，可用于迁移或分享"
											action={
												<button
													onClick={handleExport}
													className="px-3 py-1.5 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
												>
													导出
												</button>
											}
										/>
									</div>
								</SectionCard>

								{/* 危险区域 */}
								<SectionCard className="ring-red-100">
									<div className="p-5">
										<SectionTitle className="text-red-400">
											危险操作
										</SectionTitle>
										<SettingRow
											label="重置数据"
											description="删除所有数据，恢复到初始状态"
											action={
												<button
													onClick={() => setIsDangerOpen(true)}
													className="px-3 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
												>
													重置数据
												</button>
											}
										/>
									</div>
								</SectionCard>
							</>
						)}

						{activeSection === "webdav" && (
							<>
								{/* WebDAV 状态 */}
								<SectionCard>
									<div className="p-5">
										<div className="flex items-center justify-between mb-4">
											<div className="flex items-center gap-3">
												{syncConfig.webdav_enabled ? (
													<div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
														<Cloud className="w-5 h-5 text-green-600" />
													</div>
												) : (
													<div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center">
														<CloudOff className="w-5 h-5 text-zinc-400" />
													</div>
												)}
												<div>
													<div className="font-medium text-zinc-800">
														WebDAV 云同步
													</div>
													<div className="text-xs text-zinc-400">
														{syncConfig.webdav_enabled ? "已启用" : "未启用"}
													</div>
												</div>
											</div>
											<Toggle
												checked={syncConfig.webdav_enabled}
												onChange={(v) => saveConfig({ webdav_enabled: v })}
											/>
										</div>

										{syncConfig.webdav_enabled && syncConfig.last_sync_at && (
											<div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-50 rounded-lg px-3 py-2">
												<Clock className="w-3.5 h-3.5" />
												上次备份: {formatTime(syncConfig.last_backup_at)}
											</div>
										)}
									</div>
								</SectionCard>

								{/* WebDAV 配置 */}
								<SectionCard
									className={!syncConfig.webdav_enabled ? "opacity-50" : ""}
								>
									<div className="p-5">
										<SectionTitle>连接配置</SectionTitle>
										<div className="space-y-4">
											<div>
												<label className="block text-xs text-zinc-500 mb-1.5">
													WebDAV 地址
												</label>
												<input
													type="text"
													value={syncConfig.webdav_url || ""}
													onChange={(e) =>
														saveConfig({ webdav_url: e.target.value })
													}
													placeholder="https://dav.example.com/dav/"
													disabled={!syncConfig.webdav_enabled}
													className="w-full px-4 py-2.5 bg-zinc-50 border-0 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
												/>
											</div>
											<div className="grid grid-cols-2 gap-4">
												<div>
													<label className="block text-xs text-zinc-500 mb-1.5">
														用户名
													</label>
													<input
														type="text"
														value={syncConfig.webdav_username || ""}
														onChange={(e) =>
															saveConfig({ webdav_username: e.target.value })
														}
														placeholder="用户名"
														disabled={!syncConfig.webdav_enabled}
														className="w-full px-4 py-2.5 bg-zinc-50 border-0 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
													/>
												</div>
												<div>
													<label className="block text-xs text-zinc-500 mb-1.5">
														密码
													</label>
													<div className="relative">
														<input
															type={showPassword ? "text" : "password"}
															value={syncConfig.webdav_password || ""}
															onChange={(e) =>
																saveConfig({ webdav_password: e.target.value })
															}
															placeholder="密码"
															disabled={!syncConfig.webdav_enabled}
															className="w-full px-4 py-2.5 bg-zinc-50 border-0 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 disabled:opacity-50 pr-10"
														/>
														<button
															type="button"
															onClick={() => setShowPassword(!showPassword)}
															className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
														>
															{showPassword ? (
																<EyeOff className="w-4 h-4" />
															) : (
																<Eye className="w-4 h-4" />
															)}
														</button>
													</div>
												</div>
											</div>
											<div>
												<label className="block text-xs text-zinc-500 mb-1.5">
													同步路径
												</label>
												<input
													type="text"
													value={syncConfig.webdav_path}
													onChange={(e) =>
														saveConfig({ webdav_path: e.target.value })
													}
													placeholder="/workbench-sync"
													disabled={!syncConfig.webdav_enabled}
													className="w-full px-4 py-2.5 bg-zinc-50 border-0 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
												/>
											</div>

											<div className="flex items-center gap-3 pt-2">
												<button
													onClick={handleTestConnection}
													disabled={
														!syncConfig.webdav_enabled || isTestingConnection
													}
													className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
												>
													<RefreshCw
														className={`w-4 h-4 ${isTestingConnection ? "animate-spin" : ""}`}
													/>
													测试连接
												</button>
												{connectionStatus === "success" && (
													<span className="flex items-center gap-1 text-xs text-green-600">
														<CheckCircle2 className="w-4 h-4" />
														连接成功
													</span>
												)}
												{connectionStatus === "error" && (
													<span className="flex items-center gap-1 text-xs text-red-600">
														<XCircle className="w-4 h-4" />
														连接失败
													</span>
												)}
											</div>
										</div>
									</div>
								</SectionCard>

								{/* 备份设置 */}
								<SectionCard
									className={
										!syncConfig.webdav_enabled
											? "opacity-50 pointer-events-none"
											: ""
									}
								>
									<div className="p-5">
										<SectionTitle>备份设置</SectionTitle>
										<SettingRow
											label="自动备份"
											description="定期自动备份数据到 WebDAV"
											action={
												<Toggle
													checked={syncConfig.auto_backup_enabled}
													onChange={(v) =>
														saveConfig({ auto_backup_enabled: v })
													}
													disabled={!syncConfig.webdav_enabled}
												/>
											}
										/>
										<SettingRow
											label="备份间隔"
											action={
												<select
													value={syncConfig.auto_backup_interval}
													onChange={(e) =>
														saveConfig({
															auto_backup_interval: parseInt(e.target.value),
														})
													}
													disabled={
														!syncConfig.webdav_enabled ||
														!syncConfig.auto_backup_enabled
													}
													className="px-3 py-1.5 bg-zinc-50 border-0 rounded-lg text-sm"
												>
													<option value={15}>15 分钟</option>
													<option value={30}>30 分钟</option>
													<option value={60}>1 小时</option>
													<option value={180}>3 小时</option>
													<option value={360}>6 小时</option>
													<option value={720}>12 小时</option>
													<option value={1440}>24 小时</option>
												</select>
											}
										/>
										<SettingRow
											label="最大备份数"
											description="超出后自动删除旧备份"
											action={
												<select
													value={syncConfig.max_backup_count}
													onChange={(e) =>
														saveConfig({
															max_backup_count: parseInt(e.target.value),
														})
													}
													disabled={!syncConfig.webdav_enabled}
													className="px-3 py-1.5 bg-zinc-50 border-0 rounded-lg text-sm"
												>
													<option value={5}>5 份</option>
													<option value={10}>10 份</option>
													<option value={20}>20 份</option>
													<option value={50}>50 份</option>
													<option value={0}>无限制</option>
												</select>
											}
										/>
										<SettingRow
											label="精简备份"
											description="仅备份设置和记录，不包含大文件"
											action={
												<Toggle
													checked={syncConfig.compact_backup}
													onChange={(v) => saveConfig({ compact_backup: v })}
													disabled={!syncConfig.webdav_enabled}
												/>
											}
										/>
									</div>
								</SectionCard>

								{/* 手动操作 */}
								<SectionCard
									className={
										!syncConfig.webdav_enabled
											? "opacity-50 pointer-events-none"
											: ""
									}
								>
									<div className="p-5">
										<SectionTitle>数据备份与恢复</SectionTitle>
										<div className="flex gap-3 mb-4">
											<button
												onClick={handleBackupToWebdav}
												disabled={!syncConfig.webdav_enabled || isSyncing}
												className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
											>
												{isSyncing ? (
													<RefreshCw className="w-4 h-4 animate-spin" />
												) : (
													<Upload className="w-4 h-4" />
												)}
												备份到 WebDAV
											</button>
											<button
												onClick={handleOpenBackupManager}
												disabled={
													!syncConfig.webdav_url ||
													!syncConfig.webdav_username ||
													!syncConfig.webdav_password
												}
												className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
											>
												<Download className="w-4 h-4" />从 WebDAV 恢复
											</button>
										</div>

										{syncConfig.last_sync_at && (
											<div className="text-xs text-zinc-400 mt-2">
												上次同步:{" "}
												{new Date(syncConfig.last_sync_at).toLocaleString()}
											</div>
										)}
									</div>
								</SectionCard>

								{/* 多设备同步说明 */}
								<div className="bg-blue-50 rounded-2xl p-4 text-sm text-blue-700">
									<div className="flex items-start gap-3">
										<AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
										<div>
											<div className="font-medium mb-1">多设备同步</div>
											<div className="text-xs text-blue-600">
												在多台设备上使用相同的 WebDAV 配置，即可实现数据同步。
												建议在每次使用前先从 WebDAV 恢复最新数据，使用后再备份。
											</div>
										</div>
									</div>
								</div>
							</>
						)}
					</div>
				</div>
			</div>

			{/* 危险操作确认弹窗 */}
			<Modal
				isOpen={isDangerOpen}
				onClose={() => {
					if (!isClearing) {
						setIsDangerOpen(false);
						setConfirmPhrase("");
					}
				}}
				title="重置所有数据"
			>
				<div className="space-y-4">
					<div className="flex items-center gap-3 text-red-600">
						<ShieldAlert className="w-5 h-5" />
						<p className="text-sm font-medium">此操作将永久删除以下内容：</p>
					</div>
					<ul className="text-sm text-red-600 bg-red-50 rounded-xl p-4 space-y-2">
						<li>• 所有资料、笔记与同步配置</li>
						<li>• 所有工作流与输出文稿</li>
						<li>• 所有模型服务商配置</li>
						<li>• 应用内的个性化设置</li>
					</ul>
					<div className="space-y-2">
						<label className="text-xs text-zinc-500">
							请输入{" "}
							<span className="font-mono font-semibold text-red-600">
								DELETE ALL
							</span>{" "}
							以确认
						</label>
						<input
							type="text"
							value={confirmPhrase}
							onChange={(e) => setConfirmPhrase(e.target.value)}
							placeholder="DELETE ALL"
							className="w-full px-4 py-2.5 border border-red-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-200 bg-white text-sm"
							disabled={isClearing}
						/>
					</div>
					<div className="text-xs text-red-500">
						⚠️ 操作无法撤销，建议先导出备份。
					</div>
				</div>
				<div className="flex justify-end gap-3 mt-6">
					<button
						onClick={() => {
							if (!isClearing) {
								setIsDangerOpen(false);
								setConfirmPhrase("");
							}
						}}
						className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors"
						disabled={isClearing}
					>
						取消
					</button>
					<button
						onClick={async () => {
							if (confirmPhrase.trim().toUpperCase() !== "DELETE ALL") return;
							setIsClearing(true);
							try {
								await clearAllData();
								alert("✅ 所有数据已删除，页面即将刷新");
								window.location.reload();
							} catch (error) {
								alert(`重置失败: ${error}`);
								setIsClearing(false);
							}
						}}
						disabled={
							confirmPhrase.trim().toUpperCase() !== "DELETE ALL" || isClearing
						}
						className="px-4 py-2 text-sm font-medium rounded-xl text-white bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors"
					>
						{isClearing ? "重置中…" : "确认重置"}
					</button>
				</div>
			</Modal>

			{/* 备份数据管理弹窗 */}
			<Modal
				isOpen={isBackupManagerOpen}
				onClose={() => setIsBackupManagerOpen(false)}
				title="备份数据管理"
			>
				<div className="space-y-4">
					{/* 表头 */}
					<div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-zinc-400 border-b border-zinc-100">
						<div className="col-span-5">文件名</div>
						<div className="col-span-4">修改时间</div>
						<div className="col-span-3 text-right">操作</div>
					</div>

					{/* 备份列表 */}
					<div className="max-h-80 overflow-y-auto space-y-1">
						{isLoadingBackups ? (
							<div className="flex items-center justify-center py-8">
								<RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
							</div>
						) : webdavBackups.length === 0 ? (
							<div className="text-center py-8 text-sm text-zinc-400">
								暂无备份文件
							</div>
						) : (
							webdavBackups.map((backup) => (
								<div
									key={backup}
									className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 bg-zinc-50 hover:bg-zinc-100 rounded-lg transition-colors"
								>
									<div
										className="col-span-5 text-xs font-mono text-zinc-600 truncate"
										title={backup}
									>
										{backup}
									</div>
									<div className="col-span-4 text-xs text-zinc-500">
										{parseBackupTime(backup)}
									</div>
									<div className="col-span-3 flex items-center justify-end gap-2">
										<button
											onClick={() => handleRestoreFromBackup(backup)}
											disabled={isRestoring}
											className="px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
										>
											{isRestoring ? "恢复中..." : "恢复"}
										</button>
										<button
											onClick={() => handleDeleteBackup(backup)}
											disabled={isDeletingBackup === backup}
											className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
											title="删除备份"
										>
											{isDeletingBackup === backup ? (
												<RefreshCw className="w-3.5 h-3.5 animate-spin" />
											) : (
												<Trash2 className="w-3.5 h-3.5" />
											)}
										</button>
									</div>
								</div>
							))
						)}
					</div>
				</div>

				<div className="flex justify-between items-center mt-6 pt-4 border-t border-zinc-100">
					<button
						onClick={handleOpenBackupManager}
						className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
					>
						<RefreshCw className="w-4 h-4" />
						刷新
					</button>
					<button
						onClick={() => setIsBackupManagerOpen(false)}
						className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors"
					>
						关闭
					</button>
				</div>
			</Modal>
		</div>
	);
}
