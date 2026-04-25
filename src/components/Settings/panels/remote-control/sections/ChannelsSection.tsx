/**
 * ChannelsSection — 远程控制「通道」Tab
 *
 * 布局：
 *   - 左侧 ChannelNav：所有通道列表，带状态 + 启用开关
 *   - 右侧详情：只渲染当前选中通道的完整配置卡 + 顶部"快速设置"入口
 *
 * 目的：告别 6 个大卡片同时展开的"信息墙"，用选择器聚焦单通道。
 */

import {
	Activity,
	Bot,
	MessageCircle,
	MessageSquareMore,
	Smartphone,
	Sparkles,
	Wifi,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
	RemoteChannelStatus,
	RemoteControlConfig,
} from "../../../../../lib/api";
import { Button } from "../../../../ui/Button";
import { ChannelConfigCard } from "../ChannelConfigCard";
import { ChannelNav, type ChannelNavItem } from "../ChannelNav";
import { FeishuChannelCard } from "../FeishuChannelCard";
import { QQBotChannelCard } from "../QQBotChannelCard";
import { QuickSetupModal } from "../quick-setup/QuickSetupModal";
import { WechatChannelCard } from "../WechatChannelCard";

type ChannelId =
	| "feishu"
	| "telegram"
	| "slack"
	| "discord"
	| "qqbot"
	| "wechat";

type QuickSetupChannelId = Exclude<ChannelId, "wechat">;

const INPUT_CLASS =
	"w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 hover:border-zinc-300 dark:hover:border-zinc-600";

/** 支持快速设置的通道，以及按钮的副标题提示。 */
const QUICK_SETUP_HINT: Record<QuickSetupChannelId, string> = {
	feishu: "扫码直连，自动创建应用",
	telegram: "跟着向导粘贴 BotFather 给的 Token",
	slack: "粘贴 Bot Token + App-Level Token",
	discord: "粘贴 Developer Portal 拿的 Token",
	qqbot: "粘贴 AppID + Client Secret",
};

type ChannelsSectionProps = {
	config: RemoteControlConfig;
	runtime: { channels?: RemoteChannelStatus[] } | null;
	saving: boolean;
	onSave: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => void;
};

export function ChannelsSection({
	config,
	runtime,
	saving,
	onSave,
}: ChannelsSectionProps) {
	const [active, setActive] = useState<ChannelId>("feishu");
	const [quickSetupFor, setQuickSetupFor] =
		useState<QuickSetupChannelId | null>(null);

	const findRuntime = (id: string): RemoteChannelStatus | undefined =>
		runtime?.channels?.find((c) => c.channel_id === id);

	const navItems = useMemo<ChannelNavItem[]>(() => {
		const items: ChannelNavItem[] = [];
		const feishuRt = findRuntime("feishu");
		items.push({
			id: "feishu",
			label: "Feishu",
			description: "企业主力通道 · WebSocket",
			icon: MessageSquareMore,
			accent: "text-[#0089ff]",
			iconBg: "from-[#00d6b9]/20 to-[#465bff]/15",
			enabled: config.channels.feishu.enabled,
			running: feishuRt?.running,
			connected: feishuRt?.connected,
			hasError: !!feishuRt?.last_error,
		});
		if (config.channels.telegram) {
			const rt = findRuntime("telegram");
			items.push({
				id: "telegram",
				label: "Telegram",
				description: "Bot API 长轮询",
				icon: Smartphone,
				accent: "text-sky-600 dark:text-sky-400",
				iconBg: "from-sky-500/15 to-sky-400/10",
				enabled: config.channels.telegram.enabled,
				running: rt?.running,
				connected: rt?.connected,
				hasError: !!rt?.last_error,
			});
		}
		if (config.channels.slack) {
			const rt = findRuntime("slack");
			items.push({
				id: "slack",
				label: "Slack",
				description: "Socket Mode",
				icon: Activity,
				accent: "text-emerald-600 dark:text-emerald-400",
				iconBg: "from-emerald-500/15 to-teal-400/10",
				enabled: config.channels.slack.enabled,
				running: rt?.running,
				connected: rt?.connected,
				hasError: !!rt?.last_error,
			});
		}
		if (config.channels.discord) {
			const rt = findRuntime("discord");
			items.push({
				id: "discord",
				label: "Discord",
				description: "Gateway WebSocket",
				icon: Wifi,
				accent: "text-indigo-600 dark:text-indigo-400",
				iconBg: "from-indigo-500/15 to-violet-500/10",
				enabled: config.channels.discord.enabled,
				running: rt?.running,
				connected: rt?.connected,
				hasError: !!rt?.last_error,
			});
		}
		if (config.channels.qqbot) {
			const rt = findRuntime("qqbot");
			items.push({
				id: "qqbot",
				label: "QQ Bot",
				description: "官方开放平台",
				icon: Bot,
				accent: "text-[#0D6EFF]",
				iconBg: "from-[#12B7F5]/15 to-[#0D6EFF]/10",
				enabled: config.channels.qqbot.enabled,
				running: rt?.running,
				connected: rt?.connected,
				hasError: !!rt?.last_error,
			});
		}
		if (config.channels.wechat) {
			const rt = findRuntime("wechat");
			const locked = !config.channels.wechat.acknowledgedRisk;
			items.push({
				id: "wechat",
				label: "个人微信",
				description: "Wechaty · 实验特性",
				icon: MessageCircle,
				accent: "text-amber-600 dark:text-amber-400",
				iconBg: "from-amber-500/15 to-rose-500/10",
				enabled: config.channels.wechat.enabled,
				running: rt?.running,
				connected: rt?.connected,
				hasError: !!rt?.last_error,
				badge: { text: "实验", tone: "amber" },
				locked,
				lockedHint: "需勾选「我已了解封号风险」",
			});
		}
		return items;
	}, [config, runtime]);

	const handleToggleEnabled = (id: string, next: boolean) => {
		const channelId = id as ChannelId;
		onSave((draft) => {
			if (channelId === "feishu") {
				draft.channels.feishu.enabled = next;
			} else if (channelId === "telegram") {
				draft.channels.telegram.enabled = next;
			} else if (channelId === "slack") {
				draft.channels.slack.enabled = next;
			} else if (channelId === "discord") {
				draft.channels.discord.enabled = next;
			} else if (channelId === "qqbot" && draft.channels.qqbot) {
				draft.channels.qqbot.enabled = next;
			} else if (channelId === "wechat" && draft.channels.wechat) {
				draft.channels.wechat.enabled = next;
			}
			return draft;
		});
	};

	return (
		<div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
			{/* 左侧导航 */}
			<div className="lg:sticky lg:top-4 lg:self-start">
				<ChannelNav
					items={navItems}
					activeId={active}
					onSelect={(id) => setActive(id as ChannelId)}
					onToggleEnabled={handleToggleEnabled}
					saving={saving}
				/>
			</div>

			{/* 右侧详情 */}
			<div className="min-w-0 space-y-4">
				{/* 快速设置横幅 —— 只在支持的通道上显示 */}
				{active !== "wechat" ? (
					<QuickSetupBanner
						channelId={active}
						onOpen={() => setQuickSetupFor(active)}
					/>
				) : null}

				{active === "feishu" ? (
					<FeishuChannelCard
						channelConfig={config.channels.feishu}
						runtimeChannel={findRuntime("feishu")}
						saving={saving}
						onSave={onSave}
					/>
				) : null}
				{active === "telegram" && config.channels.telegram ? (
					<ChannelConfigCard
						channelId="telegram"
						title="Telegram 通道"
						description="使用 Telegram Bot API 长轮询，无需公网 IP。"
						icon={
							<Smartphone className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />
						}
						accentGradient="from-sky-400 to-sky-500"
						iconBg="from-sky-500/15 to-sky-400/10"
						runtimeChannel={findRuntime("telegram")}
						channelConfig={config.channels.telegram}
						saving={saving}
						onSave={onSave}
						credentialFields={
							<div className="grid grid-cols-1 gap-4">
								<label className="space-y-1.5 text-sm">
									<span className="text-text-secondary font-medium">
										Bot Token
									</span>
									<input
										type="password"
										value={config.channels.telegram.botToken ?? ""}
										onChange={(e) => {
											const value = e.target.value;
											onSave((draft) => {
												draft.channels.telegram.botToken = value;
												return draft;
											});
										}}
										className={INPUT_CLASS}
										placeholder="从 @BotFather 获取的 Token"
									/>
								</label>
							</div>
						}
					/>
				) : null}
				{active === "slack" && config.channels.slack ? (
					<ChannelConfigCard
						channelId="slack"
						title="Slack 通道"
						description="使用 Slack Socket Mode（需要 App-Level Token），无需公网 URL。"
						icon={
							<Activity className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
						}
						accentGradient="from-emerald-400 to-teal-500"
						iconBg="from-emerald-500/15 to-teal-400/10"
						runtimeChannel={findRuntime("slack")}
						channelConfig={config.channels.slack}
						saving={saving}
						onSave={onSave}
						credentialFields={
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<label className="space-y-1.5 text-sm">
									<span className="text-text-secondary font-medium">
										Bot Token
									</span>
									<input
										type="password"
										value={config.channels.slack.botToken ?? ""}
										onChange={(e) => {
											const value = e.target.value;
											onSave((draft) => {
												draft.channels.slack.botToken = value;
												return draft;
											});
										}}
										className={INPUT_CLASS}
										placeholder="xoxb-..."
									/>
								</label>
								<label className="space-y-1.5 text-sm">
									<span className="text-text-secondary font-medium">
										App-Level Token
									</span>
									<input
										type="password"
										value={config.channels.slack.appToken ?? ""}
										onChange={(e) => {
											const value = e.target.value;
											onSave((draft) => {
												draft.channels.slack.appToken = value;
												return draft;
											});
										}}
										className={INPUT_CLASS}
										placeholder="xapp-..."
									/>
								</label>
							</div>
						}
					/>
				) : null}
				{active === "discord" && config.channels.discord ? (
					<ChannelConfigCard
						channelId="discord"
						title="Discord 通道"
						description="使用 Discord Gateway WebSocket，无需公网 IP。"
						icon={
							<Wifi className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
						}
						accentGradient="from-indigo-400 to-violet-500"
						iconBg="from-indigo-500/15 to-violet-500/10"
						runtimeChannel={findRuntime("discord")}
						channelConfig={config.channels.discord}
						saving={saving}
						onSave={onSave}
						credentialFields={
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<label className="space-y-1.5 text-sm">
									<span className="text-text-secondary font-medium">
										Bot Token
									</span>
									<input
										type="password"
										value={config.channels.discord.botToken ?? ""}
										onChange={(e) => {
											const value = e.target.value;
											onSave((draft) => {
												draft.channels.discord.botToken = value;
												return draft;
											});
										}}
										className={INPUT_CLASS}
										placeholder="从 Discord Developer Portal 获取"
									/>
								</label>
								<label className="space-y-1.5 text-sm">
									<span className="text-text-secondary font-medium">
										Application ID
									</span>
									<input
										value={config.channels.discord.applicationId ?? ""}
										onChange={(e) => {
											const value = e.target.value;
											onSave((draft) => {
												draft.channels.discord.applicationId = value;
												return draft;
											});
										}}
										className={INPUT_CLASS}
										placeholder="应用 ID（可选）"
									/>
								</label>
							</div>
						}
					/>
				) : null}
				{active === "qqbot" && config.channels.qqbot ? (
					<QQBotChannelCard
						channelConfig={config.channels.qqbot}
						runtimeChannel={findRuntime("qqbot")}
						saving={saving}
						onSave={onSave}
					/>
				) : null}
				{active === "wechat" && config.channels.wechat ? (
					<WechatChannelCard
						channelConfig={config.channels.wechat}
						runtimeChannel={findRuntime("wechat")}
						saving={saving}
						onSave={onSave}
					/>
				) : null}
			</div>

			{/* 快速配置 Modal */}
			{quickSetupFor ? (
				<QuickSetupModal
					isOpen={true}
					channelId={quickSetupFor}
					config={config}
					onClose={() => setQuickSetupFor(null)}
					onSave={async (updater) => onSave(updater)}
					onSwitchManual={() => {
						// 扫码失败 → 关闭向导 → 让用户看到下面的手动配置卡
						setQuickSetupFor(null);
					}}
				/>
			) : null}
		</div>
	);
}

/**
 * QuickSetupBanner —— 右侧详情区顶部的"快速设置"横幅
 * 暖色调卡片 + 图标 + 简短说明 + CTA 按钮
 */
function QuickSetupBanner({
	channelId,
	onOpen,
}: {
	channelId: QuickSetupChannelId;
	onOpen: () => void;
}) {
	return (
		<div className="group relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-primary/[0.03] to-transparent p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-[0_2px_12px_rgba(217,108,70,0.08)] dark:border-primary/30 dark:from-primary/[0.10]">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-start gap-3">
					<div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 ring-1 ring-primary/20">
						<Sparkles className="h-4.5 w-4.5 text-primary" strokeWidth={1.8} />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span className="text-sm font-semibold text-text-primary">
								一键快速配置
							</span>
							{channelId === "feishu" ? (
								<span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
									扫码
								</span>
							) : (
								<span className="inline-flex items-center rounded-full bg-warm-300/70 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary dark:bg-zinc-700">
									向导
								</span>
							)}
						</div>
						<p className="mt-0.5 truncate text-xs text-text-secondary">
							{QUICK_SETUP_HINT[channelId]}
						</p>
					</div>
				</div>
				<Button variant="primary" size="sm" onClick={onOpen}>
					<Sparkles className="h-3.5 w-3.5" />
					{channelId === "feishu" ? "扫码创建应用" : "打开向导"}
				</Button>
			</div>
		</div>
	);
}
