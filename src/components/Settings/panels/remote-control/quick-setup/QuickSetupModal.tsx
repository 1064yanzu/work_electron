/**
 * QuickSetupModal — 快速配置向导的 Modal 外壳
 *
 * 统一入口，根据 channelId 分发到对应的子向导。
 * 复用全局 Modal 组件；不同通道有不同的向导策略（扫码 / 粘贴 / 手动等）。
 */

import type { RemoteControlConfig } from "../../../../../lib/api";
import { Modal } from "../../../../ui/Modal";
import { DiscordQuickSetup } from "./DiscordQuickSetup";
import { FeishuQuickSetup } from "./FeishuQuickSetup";
import { QQBotQuickSetup } from "./QQBotQuickSetup";
import { SlackQuickSetup } from "./SlackQuickSetup";
import { TelegramQuickSetup } from "./TelegramQuickSetup";

type ChannelId = "feishu" | "telegram" | "slack" | "discord" | "qqbot";

const TITLE_MAP: Record<ChannelId, string> = {
	feishu: "快速配置 Feishu",
	telegram: "快速配置 Telegram",
	slack: "快速配置 Slack",
	discord: "快速配置 Discord",
	qqbot: "快速配置 QQ Bot",
};

export function QuickSetupModal({
	isOpen,
	channelId,
	config,
	onClose,
	onSave,
	onSwitchManual,
}: {
	isOpen: boolean;
	channelId: ChannelId;
	config: RemoteControlConfig;
	onClose: () => void;
	onSave: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => Promise<void> | void;
	onSwitchManual: () => void;
}) {
	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={TITLE_MAP[channelId]}
			size="xl"
		>
			{channelId === "feishu" ? (
				<FeishuQuickSetup
					onApply={onSave}
					onComplete={onClose}
					onSwitchManual={() => {
						onClose();
						onSwitchManual();
					}}
				/>
			) : null}
			{channelId === "telegram" ? (
				<TelegramQuickSetup
					initialToken={config.channels.telegram?.botToken ?? ""}
					onApply={onSave}
					onComplete={onClose}
				/>
			) : null}
			{channelId === "slack" ? (
				<SlackQuickSetup
					initialBotToken={config.channels.slack?.botToken ?? ""}
					initialAppToken={config.channels.slack?.appToken ?? ""}
					onApply={onSave}
					onComplete={onClose}
				/>
			) : null}
			{channelId === "discord" ? (
				<DiscordQuickSetup
					initialBotToken={config.channels.discord?.botToken ?? ""}
					initialAppId={config.channels.discord?.applicationId ?? ""}
					onApply={onSave}
					onComplete={onClose}
				/>
			) : null}
			{channelId === "qqbot" ? (
				<QQBotQuickSetup
					initialAppId={config.channels.qqbot?.appId ?? ""}
					initialClientSecret={config.channels.qqbot?.clientSecret ?? ""}
					onApply={onSave}
					onComplete={onClose}
				/>
			) : null}
		</Modal>
	);
}
