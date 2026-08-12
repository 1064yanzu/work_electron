/**
 * WechatChannelCard — 个人微信（Wechaty · 实验特性）
 *
 * ⚠️ 关键交互约束：
 *   - 必须强提示「实验特性 · 有封号风险」
 *   - 默认禁用；用户必须先勾选「我已了解封号风险」(acknowledgedRisk) 才能启用
 *   - 显示依赖安装提示（wechaty 需用户自行 `npm install`）
 *   - puppet 选择会动态改变凭证字段
 */

import {
	AlertTriangle,
	ExternalLink,
	Link2,
	MessageCircle,
	Wifi,
} from "lucide-react";
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
	"w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition-[color,background-color,border-color,box-shadow] duration-150 ease-out focus:border-primary/60 focus:ring-2 focus:ring-primary/20 hover:border-cream-400 dark:hover:border-cream-500";

type WechatChannelConfig = NonNullable<
	RemoteControlConfig["channels"]["wechat"]
>;

type WechatChannelCardProps = {
	channelConfig: WechatChannelConfig;
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

export function WechatChannelCard({
	channelConfig,
	runtimeChannel,
	saving,
	onSave,
}: WechatChannelCardProps) {
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
			const result = await testRemoteChannel("wechat");
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

	const canEnable = channelConfig.acknowledgedRisk;

	return (
		<div className="relative overflow-hidden rounded-2xl border border-peach-500/40 bg-surface shadow-bai-card">
			<div className="absolute top-0 left-0 right-0 h-[3px] bg-peach-500/60" />

			<div className="p-5 space-y-5">
				{/* 标题 + 开关 */}
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="bai-icon-badge h-9 w-9">
							<MessageCircle
								className="h-4 w-4 text-peach-500"
								strokeWidth={1.5}
							/>
						</div>
						<div>
							<div className="flex items-center gap-2">
								<SettingsSectionTitle className="mb-0">
									个人微信通道
								</SettingsSectionTitle>
								<span className="inline-flex items-center gap-1 rounded-full bg-peach-500/15 px-2 py-0.5 text-xs font-medium text-peach-500">
									<AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
									实验特性
								</span>
							</div>
							<p className="text-xs text-text-secondary mt-0.5">
								基于 Wechaty 开源项目；非官方 Bot，有账号限制与封号风险
							</p>
						</div>
					</div>
					<SettingsSwitch
						checked={channelConfig.enabled}
						onChange={(next) => {
							if (next && !canEnable) {
								toast.warning("请先勾选「我已了解封号风险」才能启用");
								return;
							}
							onSave((draft) => {
								if (!draft.channels.wechat) return draft;
								draft.channels.wechat.enabled = next;
								return draft;
							});
						}}
						disabled={saving}
					/>
				</div>

				{/* 风险提示 */}
				<div className="space-y-3 rounded-xl border border-error/30 bg-error/[0.06] p-4">
					<div className="flex items-start gap-2.5">
						<AlertTriangle
							className="mt-0.5 h-4 w-4 flex-shrink-0 text-error"
							strokeWidth={1.5}
						/>
						<div className="space-y-1.5 text-sm">
							<div className="font-medium text-error">使用前请了解以下风险</div>
							<ul className="list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-error/85">
								<li>微信无官方 Bot API，所有方案都是机器人伪装成客户端</li>
								<li>
									新注册账号 / 频繁发消息 / 大群广播 均可能触发封号或功能限制
								</li>
								<li>
									<code>wechaty-puppet-xp</code> 需要 Windows +
									锁定微信桌面版本；macOS 需使用 padlocal / service 付费 puppet
								</li>
								<li>
									本渠道不会在 <code>package.json</code> 中强制安装
									wechaty（~400MB 依赖），请自行{" "}
									<code>npm install wechaty</code> 以及对应 puppet
								</li>
							</ul>
							<a
								href="https://wechaty.js.org/"
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-xs font-medium text-error underline-offset-2 hover:underline"
							>
								了解 Wechaty 文档
								<ExternalLink className="h-3 w-3" />
							</a>
						</div>
					</div>
					<label className="flex items-start gap-2 rounded-lg border border-error/30 bg-surface/70 px-3 py-2 text-xs text-error">
						<input
							type="checkbox"
							checked={channelConfig.acknowledgedRisk}
							onChange={(e) => {
								const next = e.target.checked;
								onSave((draft) => {
									if (!draft.channels.wechat) return draft;
									draft.channels.wechat.acknowledgedRisk = next;
									if (!next) {
										draft.channels.wechat.enabled = false;
									}
									return draft;
								});
							}}
							disabled={saving}
							className="mt-0.5 h-3.5 w-3.5 rounded border-error/40"
						/>
						<span>
							我已了解上述风险；启用本渠道造成的账号限制或封禁由我自行承担。
						</span>
					</label>
				</div>

				{/* puppet 选择 + 凭证 */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div className="space-y-1.5">
						<span className="text-sm text-text-secondary font-medium">
							Puppet 实现
						</span>
						<Select
							value={channelConfig.puppet}
							onChange={(e) => {
								const value = e.target.value as "xp" | "padlocal" | "service";
								onSave((draft) => {
									if (!draft.channels.wechat) return draft;
									draft.channels.wechat.puppet = value;
									return draft;
								});
							}}
							options={[
								{ label: "puppet-service（自建服务）", value: "service" },
								{ label: "puppet-padlocal（付费）", value: "padlocal" },
								{ label: "puppet-xp（仅 Windows）", value: "xp" },
							]}
						/>
					</div>
					{channelConfig.puppet !== "xp" && (
						<label className="space-y-1.5 text-sm md:col-span-2">
							<span className="text-text-secondary font-medium">Token</span>
							<input
								type="password"
								value={channelConfig.token ?? ""}
								onChange={(e) => {
									const value = e.target.value;
									onSave((draft) => {
										if (!draft.channels.wechat) return draft;
										draft.channels.wechat.token = value;
										return draft;
									});
								}}
								className={INPUT_CLASS}
								placeholder={
									channelConfig.puppet === "padlocal"
										? "puppet_padlocal_xxxxx"
										: "puppet_service_xxxxx"
								}
							/>
						</label>
					)}
				</div>
				{channelConfig.puppet === "service" && (
					<label className="block space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							服务端 Endpoint（可选，自建 wechaty-puppet-service 时使用）
						</span>
						<input
							value={channelConfig.endpoint ?? ""}
							onChange={(e) => {
								const value = e.target.value;
								onSave((draft) => {
									if (!draft.channels.wechat) return draft;
									draft.channels.wechat.endpoint = value;
									return draft;
								});
							}}
							className={INPUT_CLASS}
							placeholder="http://127.0.0.1:8788"
						/>
					</label>
				)}

				{/* 事件订阅开关 */}
				<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
					<div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface px-3 py-2">
						<div className="text-sm text-text-secondary">接收私聊</div>
						<SettingsSwitch
							checked={channelConfig.enableDm}
							onChange={(next) => {
								onSave((draft) => {
									if (!draft.channels.wechat) return draft;
									draft.channels.wechat.enableDm = next;
									return draft;
								});
							}}
							disabled={saving}
						/>
					</div>
					<div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface px-3 py-2">
						<div className="text-sm text-text-secondary">接收群聊</div>
						<SettingsSwitch
							checked={channelConfig.enableGroup}
							onChange={(next) => {
								onSave((draft) => {
									if (!draft.channels.wechat) return draft;
									draft.channels.wechat.enableGroup = next;
									return draft;
								});
							}}
							disabled={saving}
						/>
					</div>
					<div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface px-3 py-2">
						<div className="text-sm text-text-secondary">要求 @ 提及</div>
						<SettingsSwitch
							checked={channelConfig.requireMention}
							onChange={(next) => {
								onSave((draft) => {
									if (!draft.channels.wechat) return draft;
									draft.channels.wechat.requireMention = next;
									return draft;
								});
							}}
							disabled={saving}
						/>
					</div>
				</div>

				{/* allowlists */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							私聊 allowlist（每行一个微信 ID / 备注名）
						</span>
						<textarea
							value={allowFromDraft}
							onChange={(e) => {
								const value = splitAllowList(e.target.value);
								onSave((draft) => {
									if (!draft.channels.wechat) return draft;
									draft.channels.wechat.allowFrom = value;
									return draft;
								});
							}}
							rows={3}
							className={`${INPUT_CLASS} resize-none`}
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							群 allowlist（每行一个群 Topic / ID）
						</span>
						<textarea
							value={groupAllowFromDraft}
							onChange={(e) => {
								const value = splitAllowList(e.target.value);
								onSave((draft) => {
									if (!draft.channels.wechat) return draft;
									draft.channels.wechat.groupAllowFrom = value;
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
									if (!draft.channels.wechat) return draft;
									draft.channels.wechat.textChunkLimit = value;
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
							max={60}
							value={channelConfig.rateLimitPerMinute}
							onChange={(e) => {
								const value = Math.max(1, Number(e.target.value || 10));
								onSave((draft) => {
									if (!draft.channels.wechat) return draft;
									draft.channels.wechat.rateLimitPerMinute = value;
									return draft;
								});
							}}
							className={INPUT_CLASS}
						/>
					</label>
				</div>

				{/* 能力开关（注：Wechat 协议层不支持 typing / interactive / reactions） */}
				<ChannelFeatureToggles
					value={channelConfig.features}
					onChange={(next) => {
						onSave((draft) => {
							if (!draft.channels.wechat) return draft;
							draft.channels.wechat.features = next;
							return draft;
						});
					}}
					fallback={DEFAULT_CHANNEL_FEATURES}
					disabled={saving}
				/>

				{/* 运行状态 + 测试连通 */}
				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-warm-200/40 px-4 py-3 text-xs">
					<Wifi className="h-4 w-4 text-text-muted" />
					<span className="text-text-secondary">运行状态：</span>
					<span
						className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${
							runtimeChannel?.running
								? "bg-mint-500/10 text-mint-600"
								: "bg-warm-200 text-text-muted"
						}`}
					>
						<span
							className={`h-1.5 w-1.5 rounded-full ${
								runtimeChannel?.running
									? "bg-mint-500 animate-pulse"
									: "bg-cream-500"
							}`}
						/>
						{runtimeChannel?.running ? "运行中" : "未运行"}
					</span>
					{runtimeChannel?.last_error ? (
						<>
							<span className="text-text-muted">·</span>
							<span className="text-error">{runtimeChannel.last_error}</span>
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
							测试依赖
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
