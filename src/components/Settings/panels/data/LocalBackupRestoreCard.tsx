// 数据备份与恢复卡片（本地） — 备份 / 恢复 / 导出 JSON
//
// 从 DataSettings 主文件抽出，Phase 5 进一步精简：
//   - 保留"备份 / 恢复 / 导出 JSON"三项
//   - 危险操作（重置数据）被拆到 `panels/data/danger/index.tsx`，此处不再渲染
//
// 在 `data.backup` 面板中被 `LocalBackupSection` 复用；保持历史文件路径减少 diff。

import { Download, RotateCcw } from "lucide-react";
import {
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../../ui/SettingsPrimitives";

interface LocalBackupRestoreCardProps {
	onLocalBackup: () => void;
	onImport: () => void;
	onExport: () => void;
}

export function LocalBackupRestoreCard({
	onLocalBackup,
	onImport,
	onExport,
}: LocalBackupRestoreCardProps) {
	return (
		<SettingsSectionCard>
			<div
				className="p-5"
				id="data.backup.local_actions"
				data-settings-anchor="data.backup.local_actions"
			>
				<SettingsSectionTitle>数据备份与恢复</SettingsSectionTitle>
				<div className="flex gap-3 mb-4">
					<button
						type="button"
						onClick={onLocalBackup}
						className="flex-1 flex items-center justify-center gap-2 py-3 bg-warm-200 hover:bg-warm-300 rounded-xl text-sm font-medium transition-colors duration-150"
					>
						<Download className="w-4 h-4" />
						备份
					</button>
					<button
						type="button"
						onClick={onImport}
						className="flex-1 flex items-center justify-center gap-2 py-3 bg-warm-200 hover:bg-warm-300 rounded-xl text-sm font-medium transition-colors duration-150"
					>
						<RotateCcw className="w-4 h-4" />
						恢复
					</button>
				</div>
				<SettingsRow
					label="导出为 JSON"
					description="导出所有数据，可用于迁移或分享"
					action={
						<button
							type="button"
							onClick={onExport}
							className="px-3 py-1.5 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors duration-150"
						>
							导出
						</button>
					}
				/>
			</div>
		</SettingsSectionCard>
	);
}
