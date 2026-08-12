// 数据目录卡片 — 应用数据 / 数据库文件 / 媒体 / 缓存
//
// 从 DataSettings 主文件抽出。负责展示路径与触发清缓存、迁移数据库、复制路径等动作。

import type { DataStats } from "../../../../lib/api";
import { toast } from "../../../ui/Toast";
import {
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../../ui/SettingsPrimitives";

interface DataDirectoriesProps {
	dataDir: string;
	dbPath: string;
	dataStats: DataStats;
	formatSize: (bytes: number) => string;
	onMigrateDatabase: () => void;
	onClearCache: () => void;
}

export function DataDirectories({
	dataDir,
	dbPath,
	dataStats,
	formatSize,
	onMigrateDatabase,
	onClearCache,
}: DataDirectoriesProps) {
	return (
		<SettingsSectionCard>
			<div
				className="p-5"
				id="data.storage.directories"
				data-settings-anchor="data.storage.directories"
			>
				<SettingsSectionTitle>数据目录</SettingsSectionTitle>
				<SettingsRow
					label="应用数据"
					description={dataDir}
					action={
						<button
							onClick={() => {
								navigator.clipboard.writeText(dataDir);
								toast.success("路径已复制");
							}}
							className="text-xs text-primary hover:underline"
						>
							复制路径
						</button>
					}
				/>
				<SettingsRow
					label="数据库文件"
					description={dbPath}
					action={
						<button
							onClick={onMigrateDatabase}
							className="px-3 py-1.5 text-xs bg-warm-200 hover:bg-warm-300 rounded-lg transition-colors"
						>
							迁移数据库
						</button>
					}
				/>
				<SettingsRow
					label="数据库大小"
					value={formatSize(dataStats.database_size)}
				/>
				<SettingsRow
					label="媒体文件"
					value={formatSize(dataStats.media_size)}
				/>
				<SettingsRow
					label="缓存"
					description="分享卡等临时文件"
					value={formatSize(dataStats.cache_size)}
					action={
						<button
							onClick={onClearCache}
							className="px-3 py-1.5 text-xs bg-warm-200 hover:bg-warm-300 rounded-lg transition-colors"
						>
							清除缓存
						</button>
					}
				/>
			</div>
		</SettingsSectionCard>
	);
}
