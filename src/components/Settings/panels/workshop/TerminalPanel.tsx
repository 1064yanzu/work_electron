/**
 * TerminalPanel — 创作与工具 · 终端
 *
 * 终端偏好配置：默认工作目录、自定义 Shell、启动行为。
 */
import { Terminal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	getTerminalPrefs,
	setTerminalPrefs,
	type TerminalPrefs,
	DEFAULT_TERMINAL_PREFS,
} from "../../../../lib/config/terminal";
import { toast } from "../../../ui/Toast";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import {
	SettingsCardSection,
	SettingsPageContainer,
	SettingsRow,
	SettingsSwitch,
	SettingsTextInput,
	SettingsChipGroup,
	type SettingsChipOption,
} from "../../ui/SettingsPrimitives";
import { settingsAnchorProps } from "../../fieldRegistry";

const CWD_MODE_OPTIONS: SettingsChipOption<"thread" | "home">[] = [
	{ value: "thread", label: "线程目录", hint: "跟随当前线程" },
	{ value: "home", label: "主目录", hint: "~" },
];

export function TerminalPanel() {
	const [prefs, setPrefsState] = useState<TerminalPrefs>(
		DEFAULT_TERMINAL_PREFS,
	);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void getTerminalPrefs().then((p) => {
			if (!cancelled) {
				setPrefsState(p);
				setLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const handleUpdate = useCallback(
		async (updates: Partial<TerminalPrefs>) => {
			const prev = prefs;
			const optimistic = { ...prefs, ...updates };
			setPrefsState(optimistic);
			try {
				const saved = await setTerminalPrefs(updates);
				setPrefsState(saved);
			} catch (error) {
				console.error("[TerminalPanel] 保存终端偏好失败:", error);
				setPrefsState(prev);
				toast.error("保存终端设置失败");
			}
		},
		[prefs],
	);

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
			<SettingsPanelHeader
				icon={Terminal}
				title="终端"
				description="配置内置终端的默认行为，包括工作目录、Shell 路径和启动选项。"
			/>

			<SettingsCardSection
				title="默认行为"
				description="新终端实例的默认配置。"
			>
				<div
					className="space-y-0"
					{...settingsAnchorProps("workshop.terminal.defaultCwd")}
				>
					<SettingsRow
						label="默认工作目录"
						description="新建终端时的起始目录。线程目录会自动跟随当前对话的工作路径。"
						action={
							loading ? (
								<span className="text-[12px] text-text-muted">加载中…</span>
							) : (
								<SettingsChipGroup
									value={prefs.defaultCwdMode}
									options={CWD_MODE_OPTIONS}
									onChange={(v) => handleUpdate({ defaultCwdMode: v })}
									size="sm"
								/>
							)
						}
					/>
				</div>
			</SettingsCardSection>

			<SettingsCardSection
				title="Shell 配置"
				description="自定义终端使用的 Shell 程序。留空则使用系统默认 Shell。"
			>
				<div
					className="space-y-1 py-3"
					{...settingsAnchorProps("workshop.terminal.shellPath")}
				>
					<SettingsRow
						label="自定义 Shell 路径"
						description="例如 /bin/bash、/usr/bin/fish。留空自动检测系统 Shell。"
						action={
							loading ? (
								<span className="text-[12px] text-text-muted">加载中…</span>
							) : (
								<SettingsTextInput
									value={prefs.shellPath}
									onChange={(v) => handleUpdate({ shellPath: v })}
									placeholder="自动检测"
									className="w-64"
								/>
							)
						}
					/>
				</div>
			</SettingsCardSection>

			<SettingsCardSection
				title="启动行为"
				description="控制应用启动时终端面板的行为。"
			>
				<div {...settingsAnchorProps("workshop.terminal.openOnLaunch")}>
					<SettingsRow
						label="启动时自动打开终端"
						description="应用启动后自动展开终端面板，无需手动触发。"
						action={
							loading ? (
								<span className="text-[12px] text-text-muted">加载中…</span>
							) : (
								<SettingsSwitch
									checked={prefs.openOnLaunch}
									onChange={(v) => handleUpdate({ openOnLaunch: v })}
								/>
							)
						}
					/>
				</div>
			</SettingsCardSection>

			<SettingsCardSection
				title="快捷键"
				description="终端面板的键盘快捷方式。"
			>
				<SettingsRow
					label="切换终端面板"
					description="显示或隐藏底部终端面板；无终端时自动创建。"
					action={
						<span className="inline-flex items-center gap-1 text-[12px] font-mono text-text-secondary">
							<kbd className="px-1.5 py-0.5 rounded bg-warm-200 text-text-primary text-[11px]">
								Ctrl
							</kbd>
							<span className="text-text-muted">+</span>
							<kbd className="px-1.5 py-0.5 rounded bg-warm-200 text-text-primary text-[11px]">
								`
							</kbd>
						</span>
					}
				/>
			</SettingsCardSection>
		</SettingsPageContainer>
	);
}
