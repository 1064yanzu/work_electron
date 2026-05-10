/**
 * panels/data/performance/index.tsx — 「性能」二级 Tab 轻量重挂载
 *
 * Phase 5 只做重挂载：把原 `panels/PerformanceSettings.tsx` 通过新目录结构暴露，
 * UI 能力不做裁剪；`showTechnicalSummaries` 分支在 Phase 7 整体删除。
 */
import { PerformanceSettings } from "../../PerformanceSettings";

export default function DataPerformanceSettings() {
	return <PerformanceSettings />;
}
