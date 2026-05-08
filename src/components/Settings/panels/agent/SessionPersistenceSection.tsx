// Agent 设置 - 会话持久化与回放区段
//
// 重设计：用 SettingsCardSection 包装；每个布尔开关用 SettingsRow 行式呈现；
// 数值用 SettingsNumberInput；底部独立"恢复默认"按钮区。

import { Database, RotateCcw } from "lucide-react";
import {
	SettingsButton,
	SettingsCardSection,
	SettingsField,
	SettingsNumberInput,
	SettingsRow,
} from "../../ui/SettingsPrimitives";
import { Toggle } from "../../components";

interface ChatSettings {
	replayEnabled: boolean;
	persistEnabled: boolean;
	persistTraceEnabled: boolean;
	blocksFirstEnabled: boolean;
	inlineTraceEnabled: boolean;
}

interface AgentChatSettingsStore {
	setReplayEnabled: (value: boolean) => Promise<void> | void;
	setPersistEnabled: (value: boolean) => Promise<void> | void;
	setPersistTraceEnabled: (value: boolean) => Promise<void> | void;
	setBlocksFirstEnabled: (value: boolean) => Promise<void> | void;
	setInlineTraceEnabled: (value: boolean) => Promise<void> | void;
	resetToDefaults: () => Promise<void> | void;
}

interface SessionPersistenceSectionProps {
	chatSettings: ChatSettings;
	agentChatSettingsStore: AgentChatSettingsStore;
	replayLimitDraft: string;
	onReplayLimitDraftChange: (value: string) => void;
	onReplayLimitCommit: () => void | Promise<void>;
}

export function SessionPersistenceSection({
	chatSettings,
	agentChatSettingsStore,
	replayLimitDraft,
	onReplayLimitDraftChange,
	onReplayLimitCommit,
}: SessionPersistenceSectionProps) {
	const replayLimitNum = Number.parseInt(replayLimitDraft, 10) || 0;
	return (
		<SettingsCardSection
			title="会话持久化与回放"
			description="控制聊天消息是否写入 agent_messages，以及切换会话时是否从后端回放。"
			headerAction={
				<SettingsButton
					variant="secondary"
					icon={RotateCcw}
					onClick={() => void agentChatSettingsStore.resetToDefaults()}
				>
					恢复默认
				</SettingsButton>
			}
			bodyClassName="px-5 py-2"
		>
			<SettingsRow
				label="启用回放"
				description="切换到绑定 Agent Session 的会话时，从后端消息记录回放到聊天窗口。"
				action={
					<Toggle
						checked={chatSettings.replayEnabled}
						onChange={() =>
							void agentChatSettingsStore.setReplayEnabled(
								!chatSettings.replayEnabled,
							)
						}
					/>
				}
			/>
			<SettingsRow
				label="启用消息落库"
				description="将 user / assistant 消息写入 agent_messages（后端不可用时自动降级）。"
				action={
					<Toggle
						checked={chatSettings.persistEnabled}
						onChange={() =>
							void agentChatSettingsStore.setPersistEnabled(
								!chatSettings.persistEnabled,
							)
						}
					/>
				}
			/>
			<SettingsRow
				label="落库 Trace 事件"
				description="将工具调用 / 任务等 trace 事件也写入数据库，用于更完整回放。"
				action={
					<Toggle
						checked={chatSettings.persistTraceEnabled}
						onChange={() =>
							void agentChatSettingsStore.setPersistTraceEnabled(
								!chatSettings.persistTraceEnabled,
							)
						}
					/>
				}
			/>
			<SettingsRow
				label="Blocks 优先渲染"
				description="包含 blocks 的消息按结构化方式渲染，回放更一致；可随时关闭回退旧渲染。"
				action={
					<Toggle
						checked={chatSettings.blocksFirstEnabled}
						onChange={() =>
							void agentChatSettingsStore.setBlocksFirstEnabled(
								!chatSettings.blocksFirstEnabled,
							)
						}
					/>
				}
			/>
			<SettingsRow
				label="就地展示思考 / 工具调用"
				description="在对话正文按时间线插入思考与工具卡片，不再单独显示运行过程面板。"
				action={
					<Toggle
						checked={chatSettings.inlineTraceEnabled}
						onChange={() =>
							void agentChatSettingsStore.setInlineTraceEnabled(
								!chatSettings.inlineTraceEnabled,
							)
						}
					/>
				}
			/>

			<SettingsField
				label="回放条数限制"
				hint="仅回放最近 N 条消息；0 表示不限制。"
				layout="horizontal"
			>
				<div className="flex items-center gap-2">
					<SettingsNumberInput
						value={replayLimitNum}
						min={0}
						max={5000}
						width="120px"
						suffix="条"
						onChange={(value) => {
							onReplayLimitDraftChange(String(value));
							void onReplayLimitCommit();
						}}
					/>
					<Database
						className="h-3.5 w-3.5 text-text-light"
						strokeWidth={1.6}
						aria-hidden
					/>
				</div>
			</SettingsField>
		</SettingsCardSection>
	);
}
