/**
 * ArtifactSettings - 产物管理设置面板
 * 配置 Agent 产物的存储路径、清理策略等
 */
import { AlertCircle, Archive, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	cleanupArtifacts,
	getArtifactSettings,
	listArtifacts,
	updateArtifactSettings,
	type ArtifactCleanupResult,
	type ArtifactMetadata,
	type ArtifactSettings as ArtifactSettingsType,
} from "../../../lib/api";
import { confirmDialog as confirmUI } from "../../ui/ConfirmDialog";
import { toast } from "../../ui/Toast";
import { useSettingsExperience } from "../context/SettingsExperienceContext";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
} from "../ui/SettingsPrimitives";

// 格式化文件大小
function formatSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function ArtifactSettings() {
	const { showTechnicalSummaries } = useSettingsExperience();
	const [settings, setSettings] = useState<ArtifactSettingsType | null>(null);
	const [artifacts, setArtifacts] = useState<ArtifactMetadata[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isCleaning, setIsCleaning] = useState(false);
	const [cleanupResult, setCleanupResult] =
		useState<ArtifactCleanupResult | null>(null);

	// 加载数据
	const loadData = useCallback(async () => {
		try {
			setIsLoading(true);
			const [settingsData, artifactsList] = await Promise.all([
				getArtifactSettings(),
				listArtifacts(),
			]);
			setSettings(settingsData);
			setArtifacts(artifactsList);
		} catch (error) {
			console.error("加载产物设置失败:", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	// 保存设置
	const saveSettings = async (updates: Partial<ArtifactSettingsType>) => {
		if (!settings) return;
		const newSettings = { ...settings, ...updates };
		setSettings(newSettings);
		try {
			await updateArtifactSettings(updates);
		} catch (error) {
			console.error("保存设置失败:", error);
		}
	};

	// 清理产物
	const handleCleanup = async (force = false) => {
		const message = force
			? "确定要清理所有产物吗？此操作不可撤销！"
			: "确定要清理过期产物吗？";
		const confirmed = force
			? await confirmUI.danger(message, "清理全部产物")
			: await confirmUI.warning(message, "清理过期产物");
		if (!confirmed) return;

		setIsCleaning(true);
		try {
			const result = await cleanupArtifacts(force);
			setCleanupResult(result);
			await loadData();
			if (result.deleted_count > 0) {
				toast.success(
					`已清理 ${result.deleted_count} 个产物，释放 ${formatSize(result.freed_bytes)}`,
				);
			} else {
				toast.info("没有需要清理的产物");
			}
		} catch (error) {
			toast.error(`清理失败: ${error}`);
		} finally {
			setIsCleaning(false);
		}
	};

	// 计算统计信息
	const totalSize = artifacts.reduce((sum, a) => sum + a.file_size, 0);
	const sessionCount = new Set(artifacts.map((a) => a.session_id)).size;

	if (isLoading || !settings) {
		return (
			<div className="flex-1 h-full bg-background flex items-center justify-center">
				<RefreshCw className="w-5 h-5 animate-spin text-text-light" />
			</div>
		);
	}

	if (showTechnicalSummaries) {
		return (
			<SettingsPageContainer
				className="p-6"
				contentClassName="max-w-2xl mx-auto space-y-6"
			>
				<SettingsPanelHeader
					icon={Archive}
					title="产物管理"
					description="管理 Agent 产物。"
				/>

				<div className="grid gap-4 sm:grid-cols-3">
					<div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
						<div className="text-xs text-text-muted">产物数量</div>
						<div className="mt-2 text-2xl font-semibold text-text-primary">
							{artifacts.length}
						</div>
					</div>
					<div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
						<div className="text-xs text-text-muted">涉及会话</div>
						<div className="mt-2 text-2xl font-semibold text-text-primary">
							{sessionCount}
						</div>
					</div>
					<div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
						<div className="text-xs text-text-muted">总占用</div>
						<div className="mt-2 text-lg font-semibold text-text-primary">
							{formatSize(totalSize)}
						</div>
					</div>
				</div>

				<div className="rounded-2xl border border-border/80 bg-warm-50/90 p-4/80">
					<div className="text-sm font-medium text-text-primary">当前策略</div>
					<div className="mt-2 space-y-2 text-xs leading-6 text-text-secondary">
						<div>存储路径：{settings.storage_path || "默认路径"}</div>
						<div>
							自动清理：
							{settings.auto_cleanup
								? `开启，保留 ${settings.retention_days} 天`
								: "关闭"}
						</div>
					</div>
				</div>
			</SettingsPageContainer>
		);
	}

	return (
		<SettingsPageContainer
			className="p-6"
			contentClassName="max-w-2xl mx-auto space-y-6"
		>
			<SettingsPanelHeader
				icon={Archive}
				title="产物管理"
				description="管理 Agent 产物。"
			/>

			{/* 产物统计 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>产物概览</SettingsSectionTitle>
					<div className="grid grid-cols-3 gap-4">
						<div className="text-center p-4 bg-warm-50 rounded-xl">
							<div className="text-2xl font-semibold text-text-primary">
								{artifacts.length}
							</div>
							<div className="text-xs text-text-light mt-1">产物数量</div>
						</div>
						<div className="text-center p-4 bg-warm-50 rounded-xl">
							<div className="text-2xl font-semibold text-text-primary">
								{sessionCount}
							</div>
							<div className="text-xs text-text-light mt-1">会话数</div>
						</div>
						<div className="text-center p-4 bg-warm-50 rounded-xl">
							<div className="text-2xl font-semibold text-text-primary">
								{formatSize(totalSize)}
							</div>
							<div className="text-xs text-text-light mt-1">总占用</div>
						</div>
					</div>
				</div>
			</SettingsSectionCard>

			{/* 存储设置 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>存储设置</SettingsSectionTitle>
					<SettingsRow
						label="存储路径"
						description={settings.storage_path || "默认路径"}
						action={
							<button
								onClick={() => {
									navigator.clipboard.writeText(settings.storage_path);
									toast.success("路径已复制");
								}}
								className="text-xs text-primary hover:underline"
							>
								复制路径
							</button>
						}
					/>
					<SettingsRow
						label="单会话最大产物数"
						description="每个会话最多保存的产物数量"
						action={
							<input
								type="number"
								value={settings.max_per_session}
								onChange={(e) =>
									saveSettings({
										max_per_session: parseInt(e.target.value) || 50,
									})
								}
								min={1}
								max={500}
								className="w-20 px-3 py-1.5 bg-warm-50 border-0 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary/20"
							/>
						}
					/>
					<SettingsRow
						label="总容量限制"
						description="所有产物的最大总大小（MB）"
						action={
							<div className="flex items-center gap-2">
								<input
									type="number"
									value={Math.round(settings.max_total_size / (1024 * 1024))}
									onChange={(e) =>
										saveSettings({
											max_total_size:
												(parseInt(e.target.value) || 1024) * 1024 * 1024,
										})
									}
									min={100}
									max={10240}
									className="w-20 px-3 py-1.5 bg-warm-50 border-0 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary/20"
								/>
								<span className="text-xs text-text-light">MB</span>
							</div>
						}
					/>
				</div>
			</SettingsSectionCard>

			{/* 自动清理设置 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>自动清理</SettingsSectionTitle>
					<SettingsRow
						label="启用自动清理"
						description="自动清理过期的产物文件"
						action={
							<SettingsSwitch
								checked={settings.auto_cleanup}
								onChange={(v) => saveSettings({ auto_cleanup: v })}
							/>
						}
					/>
					{settings.auto_cleanup && (
						<SettingsRow
							label="保留天数"
							description="产物超过指定天数后将被清理"
							action={
								<div className="flex items-center gap-2">
									<input
										type="number"
										value={settings.retention_days}
										onChange={(e) =>
											saveSettings({
												retention_days: parseInt(e.target.value) || 7,
											})
										}
										min={1}
										max={365}
										className="w-20 px-3 py-1.5 bg-warm-50 border-0 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary/20"
									/>
									<span className="text-xs text-text-light">天</span>
								</div>
							}
						/>
					)}
				</div>
			</SettingsSectionCard>

			{/* 手动清理 */}
			<SettingsSectionCard className="ring-orange-100">
				<div className="p-5">
					<SettingsSectionTitle className="text-orange-500">
						手动清理
					</SettingsSectionTitle>
					<div className="flex gap-3">
						<button
							onClick={() => handleCleanup(false)}
							disabled={isCleaning}
							className="flex-1 flex items-center justify-center gap-2 py-3 bg-warm-200 hover:bg-warm-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
						>
							{isCleaning ? (
								<RefreshCw className="w-4 h-4 animate-spin" />
							) : (
								<Trash2 className="w-4 h-4" />
							)}
							清理过期产物
						</button>
						<button
							onClick={() => handleCleanup(true)}
							disabled={isCleaning}
							className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
						>
							<AlertCircle className="w-4 h-4" />
							清理全部产物
						</button>
					</div>
					{cleanupResult && cleanupResult.errors.length > 0 && (
						<div className="mt-3 p-3 bg-red-50 rounded-lg text-xs text-red-600">
							<div className="font-medium mb-1">清理过程中出现错误：</div>
							{cleanupResult.errors.map((err, i) => (
								<div key={i}>• {err}</div>
							))}
						</div>
					)}
				</div>
			</SettingsSectionCard>
		</SettingsPageContainer>
	);
}
