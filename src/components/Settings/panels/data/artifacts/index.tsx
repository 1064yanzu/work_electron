/**
 * panels/data/artifacts/index.tsx — 「产物管理」二级 Tab 轻量重挂载
 *
 * Phase 5 只做重挂载：把原 `panels/ArtifactSettings.tsx` 通过新目录结构暴露，
 * UI 能力不做裁剪；`showTechnicalSummaries` 分支在 Phase 7 整体删除，届时
 * 该文件会被替换为拆分后的结构。
 */
import { ArtifactSettings } from "../../ArtifactSettings";

export default function DataArtifactsSettings() {
	return <ArtifactSettings />;
}
