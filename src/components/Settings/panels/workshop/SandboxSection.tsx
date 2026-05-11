/**
 * SandboxSection — 工作区布局 · 沙盒预览子区段
 *
 * Phase 6 拆分自 `LayoutPanel.tsx` 以保持单文件 ≤ 400 行。
 * 承载断点 / 自动启动 dev server / 包管理器 / dev 命令模板 / 端口范围。
 *
 * Phase 7.3：dev 命令文本字段改用 `useCommittedValue({ mode: "blur" })`，
 * 替代手写的 draft + onBlur + onKeyDown 样板。
 */
import { Select } from "../../../ui/Select";
import {
	SettingsCardSection,
	SettingsNumberInput,
	SettingsRow,
	SettingsSwitch,
	SettingsTextInput,
} from "../../ui/SettingsPrimitives";
import { useCommittedValue } from "../../hooks/useCommittedValue";

export type Breakpoint = "mobile" | "tablet" | "desktop" | "auto";
export type PackageManager = "auto" | "npm" | "yarn" | "pnpm";

export interface SandboxPreviewPrefs {
	defaultBreakpoint: Breakpoint;
	autoStartDevServer: boolean;
	packageManager: PackageManager;
	devCommandTemplate: string;
	portRangeStart: number;
	portRangeEnd: number;
}

export const SANDBOX_ANCHORS = {
	breakpoint: "workshop.layout.sandbox.breakpoint",
	autoStart: "workshop.layout.sandbox.autoStart",
	packageManager: "workshop.layout.sandbox.packageManager",
	devCommand: "workshop.layout.sandbox.devCommand",
	portRange: "workshop.layout.sandbox.portRange",
} as const;

interface SandboxSectionProps {
	prefs: SandboxPreviewPrefs;
	onChange: (updates: Partial<SandboxPreviewPrefs>) => void | Promise<void>;
}

export function SandboxSection({ prefs, onChange }: SandboxSectionProps) {
	const devCommand = useCommittedValue<string>({
		value: prefs.devCommandTemplate,
		mode: "blur",
		errorMessage: "保存自定义 dev 命令失败",
		onCommit: async (next) => {
			await onChange({ devCommandTemplate: next });
		},
	});

	return (
		<SettingsCardSection
			title="沙盒预览"
			description="沙盒模式下预览服务器的断点、包管理器与端口范围。"
			bodyClassName="pt-1"
		>
			<div
				id={SANDBOX_ANCHORS.breakpoint}
				data-settings-anchor={SANDBOX_ANCHORS.breakpoint}
			>
				<SettingsRow
					label="默认断点"
					description="预览视图的默认响应式断点。"
					action={
						<Select
							value={prefs.defaultBreakpoint}
							onChange={(e) =>
								void onChange({
									defaultBreakpoint: e.target.value as Breakpoint,
								})
							}
							variant="inline"
							containerClassName="w-auto min-w-[200px]"
							options={[
								{ value: "auto", label: "自适应" },
								{ value: "mobile", label: "手机 (375×667)" },
								{ value: "tablet", label: "平板 (768×1024)" },
								{ value: "desktop", label: "桌面 (100%)" },
							]}
						/>
					}
				/>
			</div>
			<div
				id={SANDBOX_ANCHORS.autoStart}
				data-settings-anchor={SANDBOX_ANCHORS.autoStart}
			>
				<SettingsRow
					label="自动启动开发服务器"
					description="检测到 package.json 或多文件项目时自动启动 dev server。"
					action={
						<SettingsSwitch
							checked={prefs.autoStartDevServer}
							onChange={(v) => void onChange({ autoStartDevServer: v })}
						/>
					}
				/>
			</div>
			<div
				id={SANDBOX_ANCHORS.packageManager}
				data-settings-anchor={SANDBOX_ANCHORS.packageManager}
			>
				<SettingsRow
					label="包管理器"
					description="自动检测时优先使用的包管理器（按 lockfile 判断）。"
					action={
						<Select
							value={prefs.packageManager}
							onChange={(e) =>
								void onChange({
									packageManager: e.target.value as PackageManager,
								})
							}
							variant="inline"
							containerClassName="w-auto min-w-[160px]"
							options={[
								{ value: "auto", label: "自动检测" },
								{ value: "npm", label: "npm" },
								{ value: "yarn", label: "yarn" },
								{ value: "pnpm", label: "pnpm" },
							]}
						/>
					}
				/>
			</div>
			<div
				id={SANDBOX_ANCHORS.devCommand}
				data-settings-anchor={SANDBOX_ANCHORS.devCommand}
			>
				<SettingsRow
					label="自定义 dev 命令"
					description="覆盖默认的 dev server 启动命令，留空即使用 npm run dev。失焦或回车自动保存。"
					action={
						<div className="w-60">
							<SettingsTextInput
								value={devCommand.draft}
								onChange={devCommand.handleChange}
								onBlur={devCommand.handleBlur}
								onKeyDown={devCommand.handleKeyDown}
								placeholder="npm run dev"
								size="sm"
							/>
						</div>
					}
				/>
			</div>
			<div
				id={SANDBOX_ANCHORS.portRange}
				data-settings-anchor={SANDBOX_ANCHORS.portRange}
			>
				<SettingsRow
					label="端口范围"
					description="预览服务器使用的端口范围（默认 7300–7400）。"
					action={
						<div className="flex items-center gap-2">
							<SettingsNumberInput
								value={prefs.portRangeStart}
								min={1024}
								max={65535}
								onChange={(v) => void onChange({ portRangeStart: v })}
								width="96px"
								size="sm"
								aria-label="端口范围起始"
							/>
							<span className="text-text-muted">–</span>
							<SettingsNumberInput
								value={prefs.portRangeEnd}
								min={1024}
								max={65535}
								onChange={(v) => void onChange({ portRangeEnd: v })}
								width="96px"
								size="sm"
								aria-label="端口范围结束"
							/>
						</div>
					}
				/>
			</div>
		</SettingsCardSection>
	);
}
