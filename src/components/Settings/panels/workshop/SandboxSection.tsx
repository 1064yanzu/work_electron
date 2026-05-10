/**
 * SandboxSection — 工作区布局 · 沙盒预览子区段
 *
 * Phase 6 拆分自 `LayoutPanel.tsx` 以保持单文件 ≤ 400 行。
 * 承载断点 / 自动启动 dev server / 包管理器 / dev 命令模板 / 端口范围。
 */
import { useEffect, useState } from "react";
import { Select } from "../../../ui/Select";
import {
	SettingsCardSection,
	SettingsNumberInput,
	SettingsRow,
	SettingsSwitch,
	SettingsTextInput,
} from "../../ui/SettingsPrimitives";

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
	// devCommandTemplate 走失焦提交语义（失焦或 Enter 写回）；本地 draft 缓存用户输入
	const [devCommandDraft, setDevCommandDraft] = useState(
		prefs.devCommandTemplate,
	);

	// 上游变化（首次加载 / 上层 rollback）时同步 draft；只在非聚焦态下才覆盖本地输入
	useEffect(() => {
		const active = document.activeElement;
		const inputFocused =
			active instanceof HTMLInputElement ||
			active instanceof HTMLTextAreaElement;
		if (!inputFocused) {
			setDevCommandDraft(prefs.devCommandTemplate);
		}
	}, [prefs.devCommandTemplate]);

	const handleDevCommandChange = (v: string) => {
		setDevCommandDraft(v);
	};
	const handleDevCommandCommit = () => {
		if (devCommandDraft !== prefs.devCommandTemplate) {
			void onChange({ devCommandTemplate: devCommandDraft });
		}
	};

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
					description="覆盖默认的 dev server 启动命令，留空即使用 npm run dev。"
					action={
						<div className="w-60">
							<SettingsTextInput
								value={devCommandDraft}
								onChange={handleDevCommandChange}
								onBlur={handleDevCommandCommit}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleDevCommandCommit();
									} else if (e.key === "Escape") {
										e.preventDefault();
										setDevCommandDraft(prefs.devCommandTemplate);
									}
								}}
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
