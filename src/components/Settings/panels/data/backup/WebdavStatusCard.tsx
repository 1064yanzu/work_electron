/**
 * WebdavStatusCard — WebDAV 总开关 + 上次备份时间
 *
 * 对应 `data.backup` 面板顶部的状态卡片：
 *   - 左侧：图标 + 「WebDAV 云同步」+ 已启用 / 未启用状态
 *   - 右侧：`SettingsSwitch` 控制 `webdav_enabled`
 *   - 启用时显示上次备份时间
 *
 * 所有状态通过 props 传入，自身不拉接口，保证组件纯展示 + 单一职责。
 */
import { Clock, Cloud, CloudOff } from "lucide-react";
import type { SyncConfig } from "../../../../../lib/api";
import {
	SettingsSectionCard,
	SettingsSwitch,
} from "../../../ui/SettingsPrimitives";
import { formatTime } from "../utils";

interface WebdavStatusCardProps {
	syncConfig: SyncConfig;
	onToggle: (enabled: boolean) => void;
}

export function WebdavStatusCard({
	syncConfig,
	onToggle,
}: WebdavStatusCardProps) {
	const enabled = !!syncConfig.webdav_enabled;
	return (
		<SettingsSectionCard>
			<div
				className="p-5"
				id="data.backup.webdav_enabled"
				data-settings-anchor="data.backup.webdav_enabled"
			>
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-3">
						{enabled ? (
							<div className="w-10 h-10 rounded-full bg-mint-500/15 flex items-center justify-center">
								<Cloud
									className="w-5 h-5 bai-icon-mint"
									strokeWidth={1.5}
								/>
							</div>
						) : (
							<div className="w-10 h-10 rounded-full bg-warm-200 flex items-center justify-center">
								<CloudOff className="w-5 h-5 text-text-light" />
							</div>
						)}
						<div>
							<div className="font-medium text-text-primary">
								WebDAV 云同步
							</div>
							<div className="text-xs text-text-light">
								{enabled ? "已启用" : "未启用"}
							</div>
						</div>
					</div>
					<SettingsSwitch checked={enabled} onChange={onToggle} />
				</div>

				{enabled && syncConfig.last_backup_at && (
					<div className="flex items-center gap-2 text-xs text-text-light bg-warm-50 rounded-lg px-3 py-2">
						<Clock className="w-3.5 h-3.5" />
						上次备份: {formatTime(syncConfig.last_backup_at)}
					</div>
				)}
			</div>
		</SettingsSectionCard>
	);
}
