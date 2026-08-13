import {
	SettingsCardSection,
	SettingsField,
	SettingsRow,
	SettingsSwitch,
	SettingsTextArea,
} from "../../ui/SettingsPrimitives";
import { Select } from "../../../ui/Select";

interface AgentSdkRuntimeSectionProps {
	sdkInteractiveApproval: boolean;
	onInteractiveApprovalChange: (v: boolean) => void;
	sdkCompatMode: boolean;
	onCompatModeChange: (v: boolean) => void;
	sdkPermissionMode: string;
	onPermissionModeChange: (v: string) => void;
	sdkPluginPathsDraft: string;
	onPluginPathsDraftChange: (v: string) => void;
	onPluginPathsCommit: () => void;
	sdkAdditionalDirsDraft: string;
	onAdditionalDirsDraftChange: (v: string) => void;
	onAdditionalDirsCommit: () => void;
}

/**
 * Claude Agent SDK 运行时设置 — 整合到统一卡片中。
 */
export function AgentSdkRuntimeSection({
	sdkInteractiveApproval,
	onInteractiveApprovalChange,
	sdkCompatMode,
	onCompatModeChange,
	sdkPermissionMode,
	onPermissionModeChange,
	sdkPluginPathsDraft,
	onPluginPathsDraftChange,
	onPluginPathsCommit,
	sdkAdditionalDirsDraft,
	onAdditionalDirsDraftChange,
	onAdditionalDirsCommit,
}: AgentSdkRuntimeSectionProps) {
	return (
		<SettingsCardSection
			title="Claude Agent SDK"
			description="Agent 启动时的运行时参数，影响审批流、权限模式与可访问目录。"
			bodyClassName="px-5 py-2"
		>
			<SettingsRow
				label="交互审批"
				description="工具调用与 AskUserQuestion 通过 UI 弹窗确认；关闭后退化为命令行式审批。"
				action={
					<SettingsSwitch
						checked={sdkInteractiveApproval}
						onChange={onInteractiveApprovalChange}
					/>
				}
			/>
			<SettingsRow
				label="兼容模式"
				description="开启后回退到旧路径（acceptEdits + 关闭交互审批），仅排查问题时使用。默认模式下文件编辑会直接保存，并在对话里提供撤销入口。"
				action={
					<SettingsSwitch
						checked={sdkCompatMode}
						onChange={onCompatModeChange}
					/>
				}
			/>
			<SettingsField
				label="默认 permission mode"
				hint="未在调用处显式指定时使用的权限模式。"
				layout="horizontal"
			>
				<Select
					value={sdkPermissionMode}
					onChange={(event) => onPermissionModeChange(event.target.value)}
					variant="inline"
					options={[
						{ value: "default", label: "default" },
						{ value: "acceptEdits", label: "acceptEdits" },
						{ value: "bypassPermissions", label: "bypassPermissions" },
						{ value: "dontAsk", label: "dontAsk" },
						{ value: "plan", label: "plan" },
						{ value: "delegate", label: "delegate（多 Agent）" },
					]}
				/>
			</SettingsField>
			<SettingsField label="插件路径" hint="每行一个绝对路径；失焦后保存。">
				<SettingsTextArea
					value={sdkPluginPathsDraft}
					onChange={(value) => onPluginPathsDraftChange(value)}
					onBlur={onPluginPathsCommit}
					placeholder="/abs/path/to/plugin"
					rows={3}
					mono
				/>
			</SettingsField>
			<SettingsField
				label="additionalDirectories"
				hint="允许 Agent 读取的额外工作目录，每行一个绝对路径。"
			>
				<SettingsTextArea
					value={sdkAdditionalDirsDraft}
					onChange={(value) => onAdditionalDirsDraftChange(value)}
					onBlur={onAdditionalDirsCommit}
					placeholder="/abs/path/to/extra/dir"
					rows={3}
					mono
				/>
			</SettingsField>
		</SettingsCardSection>
	);
}
