// 数据备份与恢复卡片（本地） — 备份 / 恢复 / 导出 JSON + 危险区
//
// 从 DataSettings 主文件抽出。包含两张卡片：
//   1. 数据备份与恢复（备份/恢复/导出 JSON）
//   2. 危险操作（重置数据）

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
	onOpenDanger: () => void;
}

export function LocalBackupRestoreCard({
	onLocalBackup,
	onImport,
	onExport,
	onOpenDanger,
}: LocalBackupRestoreCardProps) {
	return (
		<>
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>数据备份与恢复</SettingsSectionTitle>
					<div className="flex gap-3 mb-4">
						<button
							onClick={onLocalBackup}
							className="flex-1 flex items-center justify-center gap-2 py-3 bg-warm-200 hover:bg-warm-300 rounded-xl text-sm font-medium transition-colors"
						>
							<Download className="w-4 h-4" />
							备份
						</button>
						<button
							onClick={onImport}
							className="flex-1 flex items-center justify-center gap-2 py-3 bg-warm-200 hover:bg-warm-300 rounded-xl text-sm font-medium transition-colors"
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
								onClick={onExport}
								className="px-3 py-1.5 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
							>
								导出
							</button>
						}
					/>
				</div>
			</SettingsSectionCard>

			<SettingsSectionCard className="ring-[rgba(181,51,51,0.2)]">
				<div className="p-5">
					<SettingsSectionTitle className="text-error">
						危险操作
					</SettingsSectionTitle>
					<SettingsRow
						label="重置数据"
						description="删除所有数据，恢复到初始状态"
						action={
							<button
								onClick={onOpenDanger}
								className="px-3 py-1.5 text-xs bg-[rgba(181,51,51,0.08)] text-error hover:bg-[rgba(181,51,51,0.16)] rounded-lg transition-colors"
							>
								重置数据
							</button>
						}
					/>
				</div>
			</SettingsSectionCard>
		</>
	);
}
