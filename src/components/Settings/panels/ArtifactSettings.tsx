/**
 * ArtifactSettings - 产物管理设置面板
 *
 * Phase 7.4：手写 button / input 全部替换为 SettingsButton / SettingsNumberInput；
 * 数字字段改用 SettingsRow 标准 action，避免再写自定义 focus ring 与边框样式。
 */
import { AlertCircle, Archive, Copy, RefreshCw, Trash2 } from "lucide-react";
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
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsButton,
	SettingsCardSection,
	SettingsHint,
	SettingsNumberInput,
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
	const [settings, setSettings] = useState<ArtifactSettingsType | null>(null);
	const [artifacts, setArtifacts] = useState<ArtifactMetadata[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isCleaning, setIsCleaning] = useState(false);
	const [cleanupResult, setCleanupResult] =
		useState<ArtifactCleanupResult | null>(null);

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
			toast.error("加载产物设置失败");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const saveSettings = async (updates: Partial<ArtifactSettingsType>) => {
		if (!settings) return;
		const previous = settings;
		const newSettings = { ...settings, ...updates };
		setSettings(newSettings);
		try {
			await updateArtifactSettings(updates);
		} catch (error) {
			console.error("保存设置失败:", error);
			setSettings(previous);
			toast.error("保存产物设置失败");
		}
	};

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

	const totalSize = artifacts.reduce((sum, a) => sum + a.file_size, 0);
	const sessionCount = new Set(artifacts.map((a) => a.session_id)).size;

	if (isLoading || !settings) {
		return (
			<div className="flex-1 h-full bg-background flex items-center justify-center">
				<RefreshCw className="w-5 h-5 animate-spin text-text-light" />
			</div>
		);
	}

	return (
		<SettingsPageContainer>
			<div
				id="data.artifacts.overview"
				data-settings-anchor="data.artifacts.overview"
			>
				<SettingsPanelHeader
					icon={Archive}
					title="产物管理"
					description="管理 Agent 产物的存储路径、容量限制与自动清理策略。"
				/>
			</div>

			{/* 产物统计 */}
			<SettingsCardSection title="产物概览" bodyClassName="p-5">
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
			</SettingsCardSection>

			{/* 存储设置 */}
			<SettingsCardSection title="存储设置" bodyClassName="p-5">
				<SettingsRow
					label="存储路径"
					description={settings.storage_path || "默认路径"}
					action={
						<SettingsButton
							variant="ghost"
							size="sm"
							icon={Copy}
							onClick={() => {
								navigator.clipboard.writeText(settings.storage_path);
								toast.success("路径已复制");
							}}
						>
							复制路径
						</SettingsButton>
					}
				/>
				<SettingsRow
					label="单会话最大产物数"
					description="每个会话最多保存的产物数量"
					action={
						<SettingsNumberInput
							value={settings.max_per_session}
							min={1}
							max={500}
							width="96px"
							size="sm"
							onChange={(value) => saveSettings({ max_per_session: value })}
						/>
					}
				/>
				<SettingsRow
					label="总容量限制"
					description="所有产物的最大总大小（MB）"
					action={
						<SettingsNumberInput
							value={Math.round(settings.max_total_size / (1024 * 1024))}
							min={100}
							max={10240}
							width="120px"
							size="sm"
							suffix="MB"
							onChange={(value) =>
								saveSettings({ max_total_size: value * 1024 * 1024 })
							}
						/>
					}
				/>
			</SettingsCardSection>

			{/* 自动清理设置 */}
			<SettingsCardSection title="自动清理" bodyClassName="p-5">
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
							<SettingsNumberInput
								value={settings.retention_days}
								min={1}
								max={365}
								width="96px"
								size="sm"
								suffix="天"
								onChange={(value) => saveSettings({ retention_days: value })}
							/>
						}
					/>
				)}
			</SettingsCardSection>

			{/* 手动清理 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle className="text-text-primary">
						手动清理
					</SettingsSectionTitle>
					<div className="flex gap-3">
						<SettingsButton
							variant="secondary"
							icon={isCleaning ? RefreshCw : Trash2}
							onClick={() => void handleCleanup(false)}
							disabled={isCleaning}
							className="flex-1"
						>
							清理过期产物
						</SettingsButton>
						<SettingsButton
							variant="danger"
							icon={AlertCircle}
							onClick={() => void handleCleanup(true)}
							disabled={isCleaning}
							className="flex-1"
						>
							清理全部产物
						</SettingsButton>
					</div>
					{cleanupResult && cleanupResult.errors.length > 0 && (
						<SettingsHint tone="error" className="mt-3">
							<div className="font-medium mb-1">清理过程中出现错误：</div>
							{cleanupResult.errors.map((err, i) => (
								<div key={i}>• {err}</div>
							))}
						</SettingsHint>
					)}
				</div>
			</SettingsSectionCard>
		</SettingsPageContainer>
	);
}
