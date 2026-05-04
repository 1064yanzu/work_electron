// Agent 设置 - 会话持久化与回放区段
//
// 包含回放开关、消息落库开关、Trace 落库开关、Blocks 优先渲染、
// 内联 Trace 开关、回放条数限制、重置按钮。

import { Database, RotateCcw } from "lucide-react";
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
	return (
		<div className="space-y-4">
			<h4 className="font-medium text-text-primary flex items-center gap-2">
				<Database className="w-4 h-4" />
				会话持久化与回放
			</h4>
			<p className="text-xs text-text-muted -mt-2">
				控制聊天消息是否写入后端 Agent
				Runtime（agent_messages），以及是否在切换会话时从后端回放。
			</p>

			<div className="space-y-3">
				<div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-warm-50/30">
					<div>
						<div className="text-sm font-medium text-text-primary">
							启用回放
						</div>
						<div className="text-xs text-text-muted mt-0.5">
							切换到绑定了 Agent Session 的会话时，从后端消息记录回放到聊天窗口
						</div>
					</div>
					<Toggle
						checked={chatSettings.replayEnabled}
						onChange={() =>
							void agentChatSettingsStore.setReplayEnabled(
								!chatSettings.replayEnabled,
							)
						}
					/>
				</div>

				<div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-warm-50/30">
					<div>
						<div className="text-sm font-medium text-text-primary">
							启用消息落库
						</div>
						<div className="text-xs text-text-muted mt-0.5">
							将 user/assistant 消息写入 agent_messages（后端不可用会自动降级）
						</div>
					</div>
					<Toggle
						checked={chatSettings.persistEnabled}
						onChange={() =>
							void agentChatSettingsStore.setPersistEnabled(
								!chatSettings.persistEnabled,
							)
						}
					/>
				</div>

				<div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-warm-50/30">
					<div>
						<div className="text-sm font-medium text-text-primary">
							落库 Trace 事件
						</div>
						<div className="text-xs text-text-muted mt-0.5">
							将工具调用/任务等 trace 事件也写入
							agent_messages（用于更完整回放）
						</div>
					</div>
					<Toggle
						checked={chatSettings.persistTraceEnabled}
						onChange={() =>
							void agentChatSettingsStore.setPersistTraceEnabled(
								!chatSettings.persistTraceEnabled,
							)
						}
					/>
				</div>

				<div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-warm-50/30">
					<div>
						<div className="text-sm font-medium">Blocks 优先渲染</div>
						<div className="text-xs text-text-muted mt-0.5">
							当消息包含 blocks
							时优先按结构化方式渲染（回放更一致，可随时关闭回退旧渲染）
						</div>
					</div>
					<Toggle
						checked={chatSettings.blocksFirstEnabled}
						onChange={() =>
							void agentChatSettingsStore.setBlocksFirstEnabled(
								!chatSettings.blocksFirstEnabled,
							)
						}
					/>
				</div>

				<div className="flex items-center justify-between py-3">
					<div>
						<div className="text-sm font-medium">就地展示思考/工具调用</div>
						<div className="text-xs text-text-muted mt-0.5">
							在对话正文中按时间线插入“思考/工具卡片/任务列表”，不再集中显示“Agent
							运行过程”面板
						</div>
					</div>
					<Toggle
						checked={chatSettings.inlineTraceEnabled}
						onChange={() =>
							void agentChatSettingsStore.setInlineTraceEnabled(
								!chatSettings.inlineTraceEnabled,
							)
						}
					/>
				</div>

				<div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-warm-50/30">
					<div>
						<div className="text-sm font-medium text-text-primary">
							回放条数限制
						</div>
						<div className="text-xs text-text-muted mt-0.5">
							仅回放最近 N 条消息；设置为 0 表示不限制
						</div>
					</div>
					<div className="flex items-center gap-2">
						<input
							type="number"
							min={0}
							max={5000}
							value={replayLimitDraft}
							onChange={(e) => onReplayLimitDraftChange(e.target.value)}
							onBlur={() => void onReplayLimitCommit()}
							className="w-24 px-3 py-2 bg-surface hover:bg-warm-50 border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
						/>
						<span className="text-xs text-text-muted">条</span>
					</div>
				</div>

				<div className="flex items-center justify-between gap-4 pt-2">
					<div>
						<div className="text-sm font-medium text-text-primary">
							重置为默认
						</div>
						<div className="text-xs text-text-muted">
							恢复回放/落库相关开关与限制为默认值
						</div>
					</div>
					<button
						onClick={() => void agentChatSettingsStore.resetToDefaults()}
						className="px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-warm-50 hover:text-primary hover:border-primary transition-all inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
					>
						<RotateCcw className="w-4 h-4 shrink-0" />
						重置
					</button>
				</div>
			</div>
		</div>
	);
}
