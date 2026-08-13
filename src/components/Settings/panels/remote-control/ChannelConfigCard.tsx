/**
 * 通用渠道配置卡片 — Telegram / Slack / Discord
 * 提取了公共字段（enabled、DM 策略、群组策略、allowlist、限流、分块限制、@提及），
 * 各渠道只需提供凭证区域作为 children。
 */

import { Link2, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import { useState, useMemo, useCallback } from "react";
import { Button } from "../../../ui/Button";
import { Select } from "../../../ui/Select";
import { toast } from "../../../ui/Toast";
import {
	SettingsSectionTitle,
	SettingsSwitch,
} from "../../ui/SettingsPrimitives";
import {
	testRemoteChannel,
	type RemoteChannelFeatureConfig,
	type RemoteControlConfig,
	type RemoteChannelStatus,
} from "../../../../lib/api";
import {
	ChannelFeatureToggles,
	DEFAULT_CHANNEL_FEATURES,
} from "./ChannelFeatureToggles";

// ─── helper ──────────────────────────────────────────────

function splitAllowList(raw: string): string[] {
	return raw
		.split(/[\n,]+/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function joinAllowList(items: string[]): string {
	return items.join("\n");
}

// ─── 通用渠道配置类型（所有三个新渠道共享的字段）──────────

type CommonChannelConfig = {
	enabled: boolean;
	dmPolicy: "pairing" | "allowlist" | "open";
	allowFrom: string[];
	groupPolicy: "disabled" | "allowlist" | "open";
	groupAllowFrom: string[];
	requireMention: boolean;
	textChunkLimit: number;
	rateLimitPerMinute: number;
	features?: RemoteChannelFeatureConfig;
};

type ChannelConfigCardProps = {
	/** 渠道 ID，用于连通性测试 */
	channelId: "telegram" | "slack" | "discord";
	/** 渠道标题 */
	title: string;
	/** 副标题描述 */
	description: string;
	/** 渠道图标 */
	icon: ReactNode;
	/** 图标容器背景（平色 class，如 bg-warm-200） */
	iconBg?: string;
	/** 运行时状态 */
	runtimeChannel?: RemoteChannelStatus;
	/** 当前渠道配置 */
	channelConfig: CommonChannelConfig;
	/** 保存中标志 */
	saving: boolean;
	/** 保存配置回调 */
	onSave: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => void;
	/** 凭证（Token 等）的自定义编辑区 */
	credentialFields: ReactNode;
};

const INPUT_CLASS =
	"w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition-[color,background-color,border-color,box-shadow] duration-150 ease-out focus:border-primary/60 focus:ring-2 focus:ring-primary/20 hover:border-warm-500";

export function ChannelConfigCard({
	channelId,
	title,
	description,
	icon,
	iconBg = "bg-warm-200",
	runtimeChannel,
	channelConfig,
	saving,
	onSave,
	credentialFields,
}: ChannelConfigCardProps) {
	const [busyTest, setBusyTest] = useState(false);

	const allowFromDraft = useMemo(
		() => joinAllowList(channelConfig.allowFrom),
		[channelConfig.allowFrom],
	);
	const groupAllowFromDraft = useMemo(
		() => joinAllowList(channelConfig.groupAllowFrom),
		[channelConfig.groupAllowFrom],
	);

	const handleTest = useCallback(async () => {
		setBusyTest(true);
		try {
			const result = await testRemoteChannel(channelId);
			if (result.ok) toast.success(result.message);
			else toast.warning(result.message);
		} catch (error) {
			toast.error(
				`连通性测试失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setBusyTest(false);
		}
	}, [channelId]);

	return (
		<div className="relative overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-[0_2px_8px_rgb(0,0,0,0.04)] ring-1 ring-black/[0.03] dark:ring-white/[0.02]">
			<div className="p-5 space-y-5">
				{/* 标题 + 开关 */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div
							className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border ${iconBg} dark:opacity-90`}
						>
							{icon}
						</div>
						<div>
							<SettingsSectionTitle className="mb-0">
								{title}
							</SettingsSectionTitle>
							<p className="text-xs text-text-secondary mt-0.5">
								{description}
							</p>
						</div>
					</div>
					<SettingsSwitch
						checked={channelConfig.enabled}
						onChange={(next: boolean) => {
							onSave((draft) => {
								(draft.channels[channelId] as CommonChannelConfig).enabled =
									next;
								return draft;
							});
						}}
						disabled={saving}
					/>
				</div>

				{/* 凭证编辑区（各渠道自定义） */}
				{credentialFields}

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
									(draft.channels[channelId] as CommonChannelConfig).dmPolicy =
										value;
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
									(
										draft.channels[channelId] as CommonChannelConfig
									).groupPolicy = value;
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
								onChange={(next: boolean) => {
									onSave((draft) => {
										(
											draft.channels[channelId] as CommonChannelConfig
										).requireMention = next;
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
							DM allowlist（每行一个用户 ID）
						</span>
						<textarea
							value={allowFromDraft}
							onChange={(e) => {
								const value = splitAllowList(e.target.value);
								onSave((draft) => {
									(draft.channels[channelId] as CommonChannelConfig).allowFrom =
										value;
									return draft;
								});
							}}
							rows={3}
							className={INPUT_CLASS + " resize-none"}
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							群 allowlist（每行一个群/频道 ID）
						</span>
						<textarea
							value={groupAllowFromDraft}
							onChange={(e) => {
								const value = splitAllowList(e.target.value);
								onSave((draft) => {
									(
										draft.channels[channelId] as CommonChannelConfig
									).groupAllowFrom = value;
									return draft;
								});
							}}
							rows={3}
							className={INPUT_CLASS + " resize-none"}
						/>
					</label>
				</div>

				{/* 限流 & 分块 */}
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
								const value = Math.max(300, Number(e.target.value || 2000));
								onSave((draft) => {
									(
										draft.channels[channelId] as CommonChannelConfig
									).textChunkLimit = value;
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
									(
										draft.channels[channelId] as CommonChannelConfig
									).rateLimitPerMinute = value;
									return draft;
								});
							}}
							className={INPUT_CLASS}
						/>
					</label>
				</div>

				{/* 能力开关（streaming / typing / 交互 / 去重 / 顺序） */}
				<ChannelFeatureToggles
					value={channelConfig.features}
					onChange={(next) => {
						onSave((draft) => {
							(draft.channels[channelId] as CommonChannelConfig).features =
								next;
							return draft;
						});
					}}
					fallback={DEFAULT_CHANNEL_FEATURES}
					disabled={saving}
				/>

				{/* 运行状态 + 连通测试 */}
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
									: "bg-warm-500"
							}`}
						/>
						{runtimeChannel?.running ? "运行中" : "未运行"}
					</span>
					<span className="text-text-muted">·</span>
					<span
						className={`font-medium ${
							runtimeChannel?.connected ? "text-mint-600" : "text-text-muted"
						}`}
					>
						{runtimeChannel?.connected ? "已连接" : "未连接"}
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
							测试连通
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
