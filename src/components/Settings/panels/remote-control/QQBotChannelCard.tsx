/**
 * QQBotChannelCard — QQ 官方 Bot 渠道配置卡片
 *
 * 区别于通用 ChannelConfigCard：
 *   - 凭证字段：appId / clientSecret（非 botToken）
 *   - 独有字段：environment（prod/sandbox）、enableGuild / enableGroup / enableC2c
 *   - 能力开关（FeatureToggles）
 */

import { Bot, Link2, Wifi } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "../../../ui/Button";
import { Select } from "../../../ui/Select";
import { toast } from "../../../ui/Toast";
import {
	SettingsSectionTitle,
	SettingsSwitch,
} from "../../ui/SettingsPrimitives";
import {
	testRemoteChannel,
	type RemoteControlConfig,
	type RemoteChannelStatus,
} from "../../../../lib/api";
import {
	ChannelFeatureToggles,
	DEFAULT_CHANNEL_FEATURES,
} from "./ChannelFeatureToggles";

const INPUT_CLASS =
	"w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 hover:border-zinc-300 dark:hover:border-zinc-600";

type QqbotChannelConfig = NonNullable<RemoteControlConfig["channels"]["qqbot"]>;

type QQBotChannelCardProps = {
	channelConfig: QqbotChannelConfig;
	runtimeChannel?: RemoteChannelStatus;
	saving: boolean;
	onSave: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => void;
};

function splitAllowList(raw: string): string[] {
	return raw
		.split(/[\n,]+/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function joinAllowList(items: string[]): string {
	return items.join("\n");
}

export function QQBotChannelCard({
	channelConfig,
	runtimeChannel,
	saving,
	onSave,
}: QQBotChannelCardProps) {
	const [busyTest, setBusyTest] = useState(false);

	const allowFromDraft = useMemo(
		() => joinAllowList(channelConfig.allowFrom ?? []),
		[channelConfig.allowFrom],
	);
	const groupAllowFromDraft = useMemo(
		() => joinAllowList(channelConfig.groupAllowFrom ?? []),
		[channelConfig.groupAllowFrom],
	);

	const handleTest = useCallback(async () => {
		setBusyTest(true);
		try {
			const result = await testRemoteChannel("qqbot");
			if (result.ok) toast.success(result.message);
			else toast.warning(result.message);
		} catch (error) {
			toast.error(
				`连通性测试失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setBusyTest(false);
		}
	}, []);

	return (
		<div className="relative overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-[0_2px_8px_rgb(0,0,0,0.04)] ring-1 ring-black/[0.03] dark:ring-white/[0.02]">
			<div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#12B7F5] to-[#0D6EFF] opacity-60" />

			<div className="p-5 space-y-5">
				{/* 标题 + 开关 */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#12B7F5]/15 to-[#0D6EFF]/10 dark:opacity-90">
							<Bot className="h-4.5 w-4.5 text-[#0D6EFF]" />
						</div>
						<div>
							<SettingsSectionTitle className="mb-0">
								QQ Bot 通道
							</SettingsSectionTitle>
							<p className="text-xs text-text-secondary mt-0.5">
								基于 QQ 开放平台官方 Bot API（需在{" "}
								<a
									href="https://q.qq.com/qqbot/"
									target="_blank"
									rel="noreferrer"
									className="text-[#0D6EFF] underline-offset-2 hover:underline"
								>
									q.qq.com/qqbot
								</a>{" "}
								申请 appId 与 client_secret）
							</p>
						</div>
					</div>
					<SettingsSwitch
						checked={channelConfig.enabled}
						onChange={(next) => {
							onSave((draft) => {
								if (!draft.channels.qqbot) return draft;
								draft.channels.qqbot.enabled = next;
								return draft;
							});
						}}
						disabled={saving}
					/>
				</div>

				{/* 凭证 */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">App ID</span>
						<input
							value={channelConfig.appId ?? ""}
							onChange={(e) => {
								const value = e.target.value;
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.appId = value;
									return draft;
								});
							}}
							className={INPUT_CLASS}
							placeholder="102xxxxxx"
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							Client Secret
						</span>
						<input
							type="password"
							value={channelConfig.clientSecret ?? ""}
							onChange={(e) => {
								const value = e.target.value;
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.clientSecret = value;
									return draft;
								});
							}}
							className={INPUT_CLASS}
							placeholder="client_secret"
						/>
					</label>
				</div>

				{/* 环境 + 事件订阅 */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="space-y-1.5">
						<span className="text-sm text-text-secondary font-medium">
							运行环境
						</span>
						<Select
							value={channelConfig.environment}
							onChange={(e) => {
								const value = e.target.value as "prod" | "sandbox";
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.environment = value;
									return draft;
								});
							}}
							options={[
								{ label: "正式（prod）", value: "prod" },
								{ label: "沙箱（sandbox）", value: "sandbox" },
							]}
						/>
					</div>
					<div className="rounded-xl border border-border/80 bg-warm-50/60 p-3 text-xs text-text-secondary/60">
						沙箱环境用于调试；生产环境接收真实用户消息，需提前在 QQ
						开放平台完成机器人审核与权益开通。
					</div>
				</div>

				{/* 事件订阅开关 */}
				<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
					<div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface px-3 py-2">
						<div className="text-sm text-text-secondary">C2C 私聊</div>
						<SettingsSwitch
							checked={channelConfig.enableC2c}
							onChange={(next) => {
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.enableC2c = next;
									return draft;
								});
							}}
							disabled={saving}
						/>
					</div>
					<div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface px-3 py-2">
						<div className="text-sm text-text-secondary">群（Q-Group）</div>
						<SettingsSwitch
							checked={channelConfig.enableGroup}
							onChange={(next) => {
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.enableGroup = next;
									return draft;
								});
							}}
							disabled={saving}
						/>
					</div>
					<div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface px-3 py-2">
						<div className="text-sm text-text-secondary">频道（Guild）</div>
						<SettingsSwitch
							checked={channelConfig.enableGuild}
							onChange={(next) => {
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.enableGuild = next;
									return draft;
								});
							}}
							disabled={saving}
						/>
					</div>
				</div>

				{/* DM 策略 & 群策略 */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div className="space-y-1.5">
						<span className="text-sm text-text-secondary font-medium">
							DM 策略
						</span>
						<Select
							value={channelConfig.dmPolicy}
							onChange={(e) => {
								const value = e.target.value as
									| "pairing"
									| "allowlist"
									| "open";
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.dmPolicy = value;
									return draft;
								});
							}}
							options={[
								{ label: "Pairing", value: "pairing" },
								{ label: "Allowlist", value: "allowlist" },
								{ label: "Open", value: "open" },
							]}
						/>
					</div>
					<div className="space-y-1.5">
						<span className="text-sm text-text-secondary font-medium">
							群策略
						</span>
						<Select
							value={channelConfig.groupPolicy}
							onChange={(e) => {
								const value = e.target.value as
									| "disabled"
									| "allowlist"
									| "open";
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.groupPolicy = value;
									return draft;
								});
							}}
							options={[
								{ label: "Disabled", value: "disabled" },
								{ label: "Allowlist", value: "allowlist" },
								{ label: "Open", value: "open" },
							]}
						/>
					</div>
					<div className="space-y-1.5">
						<span className="text-sm text-text-secondary font-medium">
							要求 @ 提及
						</span>
						<div className="flex h-[42px] items-center">
							<SettingsSwitch
								checked={channelConfig.requireMention}
								onChange={(next) => {
									onSave((draft) => {
										if (!draft.channels.qqbot) return draft;
										draft.channels.qqbot.requireMention = next;
										return draft;
									});
								}}
								disabled={saving}
							/>
						</div>
					</div>
				</div>

				{/* Allowlists */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							DM allowlist（每行一个 openid）
						</span>
						<textarea
							value={allowFromDraft}
							onChange={(e) => {
								const value = splitAllowList(e.target.value);
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.allowFrom = value;
									return draft;
								});
							}}
							rows={3}
							className={`${INPUT_CLASS} resize-none`}
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							群 allowlist（每行一个 group_openid 或 channel_id）
						</span>
						<textarea
							value={groupAllowFromDraft}
							onChange={(e) => {
								const value = splitAllowList(e.target.value);
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.groupAllowFrom = value;
									return draft;
								});
							}}
							rows={3}
							className={`${INPUT_CLASS} resize-none`}
						/>
					</label>
				</div>

				{/* 限流 & 分片 */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							文本分片长度
						</span>
						<input
							type="number"
							min={300}
							value={channelConfig.textChunkLimit}
							onChange={(e) => {
								const value = Math.max(300, Number(e.target.value || 1800));
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.textChunkLimit = value;
									return draft;
								});
							}}
							className={INPUT_CLASS}
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							速率限制（次/分钟）
						</span>
						<input
							type="number"
							min={1}
							max={120}
							value={channelConfig.rateLimitPerMinute}
							onChange={(e) => {
								const value = Math.max(1, Number(e.target.value || 20));
								onSave((draft) => {
									if (!draft.channels.qqbot) return draft;
									draft.channels.qqbot.rateLimitPerMinute = value;
									return draft;
								});
							}}
							className={INPUT_CLASS}
						/>
					</label>
				</div>

				{/* 能力开关 */}
				<ChannelFeatureToggles
					value={channelConfig.features}
					onChange={(next) => {
						onSave((draft) => {
							if (!draft.channels.qqbot) return draft;
							draft.channels.qqbot.features = next;
							return draft;
						});
					}}
					fallback={DEFAULT_CHANNEL_FEATURES}
					disabled={saving}
				/>

				{/* 运行状态 + 测试连通 */}
				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-warm-50/50 px-4 py-3 text-xs/30">
					<Wifi className="h-4 w-4 text-text-muted" />
					<span className="text-text-secondary">运行状态：</span>
					<span
						className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${
							runtimeChannel?.running
								? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
								: "bg-warm-500/10 text-text-muted"
						}`}
					>
						<span
							className={`h-1.5 w-1.5 rounded-full ${
								runtimeChannel?.running
									? "bg-emerald-500 animate-pulse"
									: "bg-zinc-400"
							}`}
						/>
						{runtimeChannel?.running ? "运行中" : "未运行"}
					</span>
					<span className="text-text-muted">·</span>
					<span
						className={`font-medium ${
							runtimeChannel?.connected
								? "text-emerald-600 dark:text-emerald-400"
								: "text-text-muted"
						}`}
					>
						{runtimeChannel?.connected ? "已连接" : "未连接"}
					</span>
					{runtimeChannel?.last_error ? (
						<>
							<span className="text-text-muted">·</span>
							<span className="text-rose-500 dark:text-rose-400">
								{runtimeChannel.last_error}
							</span>
						</>
					) : null}
					<div className="ml-auto">
						<Button
							variant="outline"
							size="sm"
							loading={busyTest}
							onClick={() => void handleTest()}
						>
							<Link2 className="h-3.5 w-3.5" />
							测试连通
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
