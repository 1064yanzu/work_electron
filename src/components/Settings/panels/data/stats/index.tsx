/**
 * panels/data/stats/index.tsx — 「使用统计」二级 Tab 轻量重挂载
 *
 * Phase 5 只做重挂载：把原 `panels/DashboardSettings.tsx` 通过新目录结构暴露，
 * UI 能力不做裁剪。`DashboardSettings` 本身没有 `showTechnicalSummaries` 分支，
 * 因此本文件与原有组件完全等价。
 */
import { DashboardSettings } from "../../DashboardSettings";

export default function DataStatsSettings() {
	return <DashboardSettings />;
}
