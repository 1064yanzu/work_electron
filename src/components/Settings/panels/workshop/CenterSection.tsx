/**
 * CenterSection — 工作区布局 · 中间栏体验子区段
 *
 * Phase 6 拆分自 `LayoutPanel.tsx` 以保持单文件 ≤ 400 行。
 * 读写 `centerUxPrefs`（defaultView / artifactClickBehavior / infoDensity / graphFollow）。
 */
import { Select } from "../../../ui/Select";
import {
	type CenterDefaultView,
	type CenterUxPrefs,
} from "../../../../lib/config";
import {
	SettingsCardSection,
	SettingsRow,
	SettingsSwitch,
} from "../../ui/SettingsPrimitives";

export const CENTER_ANCHORS = {
	defaultView: "workshop.layout.center.defaultView",
	artifactClick: "workshop.layout.center.artifactClick",
	infoDensity: "workshop.layout.center.infoDensity",
	graphFollow: "workshop.layout.center.graphFollow",
} as const;

interface CenterSectionProps {
	prefs: CenterUxPrefs;
	onChange: (updates: Partial<CenterUxPrefs>) => void | Promise<void>;
}

export function CenterSection({ prefs, onChange }: CenterSectionProps) {
	return (
		<SettingsCardSection
			title="中间栏体验"
			description="托管模式下的中间栏默认视图与交互。"
			bodyClassName="pt-1"
		>
			<div
				id={CENTER_ANCHORS.defaultView}
				data-settings-anchor={CENTER_ANCHORS.defaultView}
			>
				<SettingsRow
					label="默认视图"
					description="启动托管模式时中间栏显示的内容。"
					action={
						<Select
							value={prefs.defaultView}
							onChange={(e) =>
								void onChange({
									defaultView: e.target.value as CenterDefaultView,
								})
							}
							variant="inline"
							containerClassName="w-auto min-w-[180px]"
							options={[
								{ value: "graph", label: "运行图（推荐）" },
								{ value: "preview", label: "预览" },
							]}
						/>
					}
				/>
			</div>
			<div
				id={CENTER_ANCHORS.artifactClick}
				data-settings-anchor={CENTER_ANCHORS.artifactClick}
			>
				<SettingsRow
					label="产物节点点击行为"
					description="在运行图上点击产物节点时的默认动作。"
					action={
						<Select
							value={prefs.artifactClickBehavior}
							onChange={(e) =>
								void onChange({
									artifactClickBehavior: e.target
										.value as CenterUxPrefs["artifactClickBehavior"],
								})
							}
							variant="inline"
							containerClassName="w-auto min-w-[200px]"
							options={[
								{ value: "select_only", label: "仅选中节点（推荐）" },
								{ value: "open_preview", label: "直接打开预览" },
							]}
						/>
					}
				/>
			</div>
			<div
				id={CENTER_ANCHORS.infoDensity}
				data-settings-anchor={CENTER_ANCHORS.infoDensity}
			>
				<SettingsRow
					label="信息密度"
					description="影响运行图节点与右侧抽屉的信息呈现密度。"
					action={
						<Select
							value={prefs.infoDensity}
							onChange={(e) =>
								void onChange({
									infoDensity: e.target.value as CenterUxPrefs["infoDensity"],
								})
							}
							variant="inline"
							containerClassName="w-auto min-w-[140px]"
							options={[
								{ value: "comfortable", label: "舒适" },
								{ value: "compact", label: "紧凑" },
							]}
						/>
					}
				/>
			</div>
			<div
				id={CENTER_ANCHORS.graphFollow}
				data-settings-anchor={CENTER_ANCHORS.graphFollow}
			>
				<SettingsRow
					label="运行图自动跟随"
					description="开启后会自动聚焦到当前活动节点。"
					action={
						<SettingsSwitch
							checked={prefs.graphFollow}
							onChange={(v) => void onChange({ graphFollow: v })}
						/>
					}
				/>
			</div>
		</SettingsCardSection>
	);
}
