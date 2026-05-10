/**
 * WebdavConnectionForm — WebDAV 连接配置表单
 *
 * 承担：
 *   - 服务商预设下拉（`WEBDAV_PROVIDERS`）
 *   - 服务商说明 + 外链（配置文档）
 *   - WebDAV 地址（含 URL 校验）
 *   - 用户名 + 密码（`SettingsPasswordInput`）
 *   - 同步路径
 *   - 测试连接按钮 + 反馈
 *
 * 不负责实际的接口保存 / 列表加载，所有操作通过 props 回调透传给 index。
 */
import { AlertCircle, CheckCircle2, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { SyncConfig, WebDavConfig } from "../../../../../lib/api";
import { testWebdavConnection } from "../../../../../lib/api";
import {
	WEBDAV_PROVIDERS,
	getProviderById,
	guessProviderByHost,
	validateWebdavUrl,
} from "../../../../../lib/webdavProviders";
import { Select } from "../../../../ui/Select";
import { toast } from "../../../../ui/Toast";
import {
	SettingsButton,
	SettingsHint,
	SettingsPasswordInput,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsTextInput,
} from "../../../ui/SettingsPrimitives";

interface WebdavConnectionFormProps {
	syncConfig: SyncConfig;
	saveConfig: (patch: Partial<SyncConfig>) => Promise<void> | void;
	buildWebdavConfig: (fileName?: string) => WebDavConfig;
}

export function WebdavConnectionForm({
	syncConfig,
	saveConfig,
	buildWebdavConfig,
}: WebdavConnectionFormProps) {
	const [isTesting, setIsTesting] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<
		"idle" | "success" | "error"
	>("idle");
	const [selectedProvider, setSelectedProvider] = useState<string>(() => {
		const guessed = guessProviderByHost(syncConfig.webdav_url ?? "");
		return guessed?.id ?? "custom";
	});
	const [urlValidation, setUrlValidation] = useState<{
		valid: boolean;
		message?: string;
	}>({ valid: true });

	// 当 webdav_url 从外部变化（例如服务商切换）时，同步重新校验
	useEffect(() => {
		if (syncConfig.webdav_url) {
			setUrlValidation(validateWebdavUrl(syncConfig.webdav_url));
		} else {
			setUrlValidation({ valid: true });
		}
	}, [syncConfig.webdav_url]);

	const enabled = !!syncConfig.webdav_enabled;
	const currentProvider = getProviderById(selectedProvider);

	const handleProviderChange = useCallback(
		(providerId: string) => {
			setSelectedProvider(providerId);
			const provider = getProviderById(providerId);
			if (provider && provider.id !== "custom") {
				void saveConfig({
					webdav_url: provider.host,
					webdav_path: provider.defaultPath,
				});
			}
		},
		[saveConfig],
	);

	const handleUrlChange = useCallback(
		(url: string) => {
			void saveConfig({ webdav_url: url });
			setUrlValidation(validateWebdavUrl(url));
		},
		[saveConfig],
	);

	const handleTestConnection = useCallback(async () => {
		if (
			!syncConfig.webdav_url ||
			!syncConfig.webdav_username ||
			!syncConfig.webdav_password
		) {
			toast.warning("请填写完整的 WebDAV 配置");
			return;
		}
		setIsTesting(true);
		setConnectionStatus("idle");
		try {
			const ok = await testWebdavConnection(buildWebdavConfig());
			if (ok) {
				setConnectionStatus("success");
				toast.success("WebDAV 连接成功！");
			} else {
				setConnectionStatus("error");
				toast.error("WebDAV 连接失败");
			}
		} catch (error) {
			setConnectionStatus("error");
			toast.error(
				`测试失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setIsTesting(false);
		}
	}, [buildWebdavConfig, syncConfig]);

	return (
		<SettingsSectionCard className={!enabled ? "opacity-50" : ""}>
			<div className="p-5 space-y-4">
				<SettingsSectionTitle>连接配置</SettingsSectionTitle>

				{/* 服务商下拉 */}
				<div
					className="space-y-2"
					id="data.backup.webdav_provider"
					data-settings-anchor="data.backup.webdav_provider"
				>
					<label className="block text-xs font-medium text-text-muted">
						选择服务商
					</label>
					<Select
						value={selectedProvider}
						onChange={(e) => handleProviderChange(e.target.value)}
						disabled={!enabled}
						options={WEBDAV_PROVIDERS.map((provider) => ({
							value: provider.id,
							label: `${provider.icon ? `${provider.icon} ` : ""}${provider.nameZh}${
								provider.requiresAppPassword ? " (需应用密码)" : ""
							}`,
						}))}
					/>
					{selectedProvider !== "custom" && currentProvider && (
						<SettingsHint>
							<div className="space-y-1">
								<div>{currentProvider.description}</div>
								{currentProvider.helpUrl && (
									<a
										href={currentProvider.helpUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
									>
										查看配置文档
										<ExternalLink className="w-3 h-3" strokeWidth={1.5} />
									</a>
								)}
							</div>
						</SettingsHint>
					)}
				</div>

				{/* WebDAV 地址 */}
				<div
					className="space-y-2"
					id="data.backup.webdav_url"
					data-settings-anchor="data.backup.webdav_url"
				>
					<label className="block text-xs font-medium text-text-muted">
						WebDAV 地址
					</label>
					<SettingsTextInput
						value={syncConfig.webdav_url || ""}
						onChange={handleUrlChange}
						placeholder="https://dav.example.com/dav/"
						disabled={!enabled}
						error={!urlValidation.valid}
						autoComplete="off"
					/>
					{urlValidation.message && (
						<SettingsHint
							tone={urlValidation.valid ? "info" : "error"}
							icon={AlertCircle}
						>
							{urlValidation.message}
						</SettingsHint>
					)}
				</div>

				{/* 用户名 + 密码 */}
				<div className="grid grid-cols-2 gap-4">
					<div
						className="space-y-1.5"
						id="data.backup.webdav_username"
						data-settings-anchor="data.backup.webdav_username"
					>
						<label className="block text-xs text-text-muted">用户名</label>
						<SettingsTextInput
							value={syncConfig.webdav_username || ""}
							onChange={(v) => void saveConfig({ webdav_username: v })}
							placeholder="用户名"
							disabled={!enabled}
							autoComplete="username"
						/>
					</div>
					<div
						className="space-y-1.5"
						id="data.backup.webdav_password"
						data-settings-anchor="data.backup.webdav_password"
					>
						<label className="block text-xs text-text-muted">密码</label>
						<SettingsPasswordInput
							value={syncConfig.webdav_password || ""}
							onChange={(v) => void saveConfig({ webdav_password: v })}
							placeholder="密码"
							disabled={!enabled}
							autoComplete="current-password"
						/>
					</div>
				</div>

				{/* 同步路径 */}
				<div
					className="space-y-1.5"
					id="data.backup.webdav_path"
					data-settings-anchor="data.backup.webdav_path"
				>
					<label className="block text-xs text-text-muted">同步路径</label>
					<SettingsTextInput
						value={syncConfig.webdav_path}
						onChange={(v) => void saveConfig({ webdav_path: v })}
						placeholder="/workbench-sync"
						disabled={!enabled}
						autoComplete="off"
					/>
				</div>

				{/* 测试连接 */}
				<div
					className="flex items-center gap-3 pt-2"
					id="data.backup.webdav_test"
					data-settings-anchor="data.backup.webdav_test"
				>
					<SettingsButton
						icon={RefreshCw}
						onClick={() => void handleTestConnection()}
						disabled={!enabled || isTesting}
						loading={isTesting}
					>
						测试连接
					</SettingsButton>
					{connectionStatus === "success" && (
						<span className="flex items-center gap-1 text-xs text-mint-600">
							<CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
							连接成功
						</span>
					)}
					{connectionStatus === "error" && (
						<span className="flex items-center gap-1 text-xs text-error">
							<XCircle className="w-4 h-4" />
							连接失败
						</span>
					)}
				</div>
			</div>
		</SettingsSectionCard>
	);
}
