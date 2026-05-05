/**
 * SandboxPreviewSettings - 沙盒预览设置面板
 * 配置沙盒预览服务器、编辑器、终端等行为
 */
import { Monitor, Code2, Terminal, Server, Package } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSettingsExperience } from "../context/SettingsExperienceContext";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
	SettingsSelect,
} from "../ui/SettingsPrimitives";
import {
	getCenterUxPrefs,
	setCenterUxPrefs,
	type CenterDefaultView,
} from "../../../lib/config";

interface SandboxPreviewPrefs {
	defaultView: CenterDefaultView;
	defaultBreakpoint: "mobile" | "tablet" | "desktop" | "auto";
	autoStartDevServer: boolean;
	packageManager: "auto" | "npm" | "yarn" | "pnpm";
	devCommandTemplate: string;
	portRangeStart: number;
	portRangeEnd: number;
}

const DEFAULT_PREFS: SandboxPreviewPrefs = {
	defaultView: "preview",
	defaultBreakpoint: "desktop",
	autoStartDevServer: true,
	packageManager: "auto",
	devCommandTemplate: "npm run dev",
	portRangeStart: 7300,
	portRangeEnd: 7400,
};

export function SandboxPreviewSettings() {
	const { showTechnicalSummaries } = useSettingsExperience();
	const [prefs, setPrefs] = useState<SandboxPreviewPrefs>(DEFAULT_PREFS);

	// 加载偏好设置
	useEffect(() => {
		const centerPrefs = getCenterUxPrefs();
		setPrefs({
			...DEFAULT_PREFS,
			defaultView: centerPrefs.defaultView || "preview",
		});
	}, []);

	// 保存偏好设置
	const savePrefs = useCallback(
		(updates: Partial<SandboxPreviewPrefs>) => {
			const newPrefs = { ...prefs, ...updates };
			setPrefs(newPrefs);

			// 同步到 centerUxPrefs
			if (updates.defaultView !== undefined) {
				setCenterUxPrefs({ defaultView: updates.defaultView });
			}
		},
		[prefs],
	);

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={Monitor}
				title="沙盒预览"
				description="配置沙盒模式下的预览服务器、代码编辑器和终端行为"
			/>

			<SettingsSectionCard>
				<SettingsSectionTitle>默认视图</SettingsSectionTitle>
				<SettingsRow
					label="中间栏默认视图"
					description="启动托管模式时中间栏的默认显示内容"
				>
					<SettingsSelect
						value={prefs.defaultView}
						onChange={(value) =>
							savePrefs({ defaultView: value as CenterDefaultView })
						}
						options={[
							{ value: "graph", label: "运行图" },
							{ value: "preview", label: "产物预览" },
						]}
					/>
				</SettingsRow>
			</SettingsSectionCard>

			<SettingsSectionCard>
				<SettingsSectionTitle>预览服务器</SettingsSectionTitle>
				<SettingsRow
					label="自动启动开发服务器"
					description="检测到 package.json 或多文件项目时自动启动 dev server"
				>
					<SettingsSwitch
						checked={prefs.autoStartDevServer}
						onChange={(checked) => savePrefs({ autoStartDevServer: checked })}
					/>
				</SettingsRow>
				<SettingsRow
					label="包管理器"
					description="自动检测时优先使用的包管理器（按 lockfile 判断）"
				>
					<SettingsSelect
						value={prefs.packageManager}
						onChange={(value) =>
							savePrefs({
								packageManager: value as SandboxPreviewPrefs["packageManager"],
							})
						}
						options={[
							{ value: "auto", label: "自动检测" },
							{ value: "npm", label: "npm" },
							{ value: "yarn", label: "yarn" },
							{ value: "pnpm", label: "pnpm" },
						]}
					/>
				</SettingsRow>
				<SettingsRow
					label="端口范围"
					description="预览服务器使用的端口范围（默认 7300-7400）"
				>
					<div className="flex items-center gap-2">
						<input
							type="number"
							value={prefs.portRangeStart}
							onChange={(e) =>
								savePrefs({ portRangeStart: Number(e.target.value) })
							}
							className="w-20 px-2 py-1.5 text-sm rounded-lg border border-border bg-surface"
							min={1024}
							max={65535}
						/>
						<span className="text-text-muted">-</span>
						<input
							type="number"
							value={prefs.portRangeEnd}
							onChange={(e) =>
								savePrefs({ portRangeEnd: Number(e.target.value) })
							}
							className="w-20 px-2 py-1.5 text-sm rounded-lg border border-border bg-surface"
							min={1024}
							max={65535}
						/>
					</div>
				</SettingsRow>
			</SettingsSectionCard>

			<SettingsSectionCard>
				<SettingsSectionTitle>响应式断点</SettingsSectionTitle>
				<SettingsRow label="默认断点" description="预览视图的默认响应式断点">
					<SettingsSelect
						value={prefs.defaultBreakpoint}
						onChange={(value) =>
							savePrefs({
								defaultBreakpoint:
									value as SandboxPreviewPrefs["defaultBreakpoint"],
							})
						}
						options={[
							{ value: "auto", label: "自适应" },
							{ value: "mobile", label: "手机 (375×667)" },
							{ value: "tablet", label: "平板 (768×1024)" },
							{ value: "desktop", label: "桌面 (100%)" },
						]}
					/>
				</SettingsRow>
			</SettingsSectionCard>

			{showTechnicalSummaries && (
				<SettingsSectionCard>
					<SettingsSectionTitle>高级设置</SettingsSectionTitle>
					<SettingsRow
						label="自定义 dev 命令"
						description="覆盖默认的 dev server 启动命令（支持 {packageManager} 占位符）"
					>
						<input
							type="text"
							value={prefs.devCommandTemplate}
							onChange={(e) =>
								savePrefs({ devCommandTemplate: e.target.value })
							}
							className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-surface"
							placeholder="npm run dev"
						/>
					</SettingsRow>
				</SettingsSectionCard>
			)}
		</SettingsPageContainer>
	);
}
