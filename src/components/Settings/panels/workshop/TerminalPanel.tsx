/**
 * TerminalPanel — 创作与工具 · 终端
 *
 * 终端偏好配置：默认工作目录、自定义 Shell、启动行为。
 */
import { useCallback, useEffect, useState } from "react";
import {
	getTerminalPrefs,
	setTerminalPrefs,
	type TerminalPrefs,
	DEFAULT_TERMINAL_PREFS,
	TERMINAL_SCROLLBACK_OPTIONS,
} from "../../../../lib/config/terminal";
import { toast } from "../../../ui/Toast";
import Select from "../../../ui/Select";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import { SettingsDisclosure } from "../../ui/SettingsDisclosure";
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
	{ value: "thread", label: "对话目录", hint: "跟随当前对话" },
	{ value: "home", label: "主目录", hint: "~" },
];

function formatScrollbackLabel(lines: number): string {
	if (lines >= 10000) return `${lines / 10000} 万行`;
	return `${lines} 行`;
}

const SCROLLBACK_SELECT_OPTIONS = TERMINAL_SCROLLBACK_OPTIONS.map((lines) => ({
	value: String(lines),
	label: formatScrollbackLabel(lines),
}));

/** 当前值不在预设档位时（如通过配置文件写入的自定义值），追加为一个选项以便正确回显 */
function getScrollbackOptions(current: number) {
	const value = String(current);
	if (SCROLLBACK_SELECT_OPTIONS.some((o) => o.value === value)) {
		return SCROLLBACK_SELECT_OPTIONS;
	}
	return [
		...SCROLLBACK_SELECT_OPTIONS,
		{ value, label: formatScrollbackLabel(current) },
	].sort((a, b) => Number(a.value) - Number(b.value));
}

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
		<SettingsPageContainer>
			<SettingsPanelHeader
				title="终端"
				description="配置内置终端的默认行为。按 Ctrl+` 可随时显示或隐藏底部终端面板。"
			/>

			{/* 一张卡装完日常会调的三项。
			    以前这三项分在三张卡里，一卡一行——卡片比内容还多，扫读时全是边框噪音。 */}
			<SettingsCardSection title="终端行为" bodyClassName="px-5 py-1">
				<div {...settingsAnchorProps("workshop.terminal.defaultCwd")}>
					<SettingsRow
						label="默认工作目录"
						description="新建终端时的起始目录。选「对话目录」会自动跟随当前对话的工作路径。"
						action={
							loading ? (
								<span className="text-xs text-text-muted">加载中…</span>
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

				<div {...settingsAnchorProps("workshop.terminal.shellPath")}>
					<SettingsRow
						label="自定义 Shell"
						description="留空即可，会自动用系统默认 Shell。想指定就填路径，例如 /bin/bash。"
						action={
							loading ? (
								<span className="text-xs text-text-muted">加载中…</span>
							) : (
								<SettingsTextInput
									value={prefs.shellPath}
									onChange={(v) => handleUpdate({ shellPath: v })}
									placeholder="自动检测"
									className="w-56"
								/>
							)
						}
					/>
				</div>

				<div {...settingsAnchorProps("workshop.terminal.openOnLaunch")}>
					<SettingsRow
						label="启动时自动打开终端"
						description="应用启动后直接展开终端面板，不用再手动唤起。"
						action={
							loading ? (
								<span className="text-xs text-text-muted">加载中…</span>
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

			{/* 回滚行数是内存权衡项，绝大多数人不需要动 —— 收进折叠区。
			    折叠器自己已经写着「显示高级选项」，卡片就不必再顶一个「高级」标题。 */}
			<SettingsDisclosure id="workshop.terminal.advanced">
				<SettingsCardSection bodyClassName="px-5 py-1">
					<div {...settingsAnchorProps("workshop.terminal.scrollback")}>
						<SettingsRow
							label="回滚缓冲行数"
							description="终端能向上翻多少行历史输出。调大更占内存，改完对新开的终端生效。"
							action={
								loading ? (
									<span className="text-xs text-text-muted">加载中…</span>
								) : (
									<Select
										variant="compact"
										containerClassName="w-32"
										aria-label="回滚缓冲行数"
										value={String(prefs.scrollbackLines)}
										options={getScrollbackOptions(prefs.scrollbackLines)}
										onChange={(e) =>
											handleUpdate({ scrollbackLines: Number(e.target.value) })
										}
									/>
								)
							}
						/>
					</div>
				</SettingsCardSection>
			</SettingsDisclosure>
		</SettingsPageContainer>
	);
}
