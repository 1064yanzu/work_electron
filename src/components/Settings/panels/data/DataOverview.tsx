// 数据概览 — 资料/笔记数 + 输出文稿数 + 总占用
//
// 从 DataSettings 主文件抽出的纯展示组件。

import type { DataStats } from "../../../../lib/api";
import {
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../../ui/SettingsPrimitives";

interface DataOverviewProps {
	dataStats: DataStats;
	formatSize: (bytes: number) => string;
}

export function DataOverview({ dataStats, formatSize }: DataOverviewProps) {
	return (
		<SettingsSectionCard>
			<div className="p-5">
				<SettingsSectionTitle>数据概览</SettingsSectionTitle>
				<div className="grid grid-cols-3 gap-4">
					<StatCard
						value={
							(dataStats.sources_count ?? 0) + (dataStats.notes_count ?? 0)
						}
						label="资料与笔记"
					/>
					<StatCard value={dataStats.outputs_count ?? 0} label="输出文稿" />
					<StatCard
						value={formatSize(
							(dataStats.database_size ?? 0) + (dataStats.media_size ?? 0),
						)}
						label="总占用"
					/>
				</div>
			</div>
		</SettingsSectionCard>
	);
}

function StatCard({ value, label }: { value: string | number; label: string }) {
	return (
		<div className="text-center p-4 bg-warm-50 rounded-xl">
			<div className="text-2xl font-semibold text-text-primary">{value}</div>
			<div className="text-xs text-text-light mt-1">{label}</div>
		</div>
	);
}
