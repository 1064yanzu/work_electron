/**
 * FeishuChannelCard — 飞书通道专属配置卡片
 *
 * 原本一部分字段内联在 RemoteControlSettings.tsx 里。此文件整合完整字段：
 *   - 凭证：appId / appSecret
 *   - 运行参数：domain / connectionMode / dmPolicy / groupPolicy
 *   - Allowlist：DM / 群
 *   - 限流 & 分片 & requireMention
 *   - 附件合并 & 文档链接预取
 *   - 文档控制能力（Docx MCP / 写操作 / 删除 / 兼容 / 兜底）
 *   - 能力开关（streaming / typing / 交互 / 去重 / 顺序）
 *   - 运行状态条 + 连通测试
 *
 * 签名与其他 ChannelCard 对齐（channelConfig / runtimeChannel / saving / onSave）。
 */

import { Link2, MessageSquareMore, Wifi } from "lucide-react";
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
	type RemoteChannelStatus,
	type RemoteControlConfig,
} from "../../../../lib/api";
import {
	ChannelFeatureToggles,
	DEFAULT_FEISHU_FEATURES,
} from "./ChannelFeatureToggles";
import { StatusDot } from "./StatusDot";

const INPUT_CLASS =
	"w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition-[color,background-color,border-color,box-shadow] duration-200 ease-out focus:border-primary/60 focus:ring-2 focus:ring-primary/20 hover:border-cream-400 dark:hover:border-cream-500";

type FeishuChannelConfig = RemoteControlConfig["channels"]["feishu"];

type FeishuChannelCardProps = {
	channelConfig: FeishuChannelConfig;
	runtimeChannel?: RemoteChannelStatus;
	saving: boolean;
	onSave: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => void;
};

function splitAllowList(raw: string): string[] {
	return raw
		.split(/[\n,]/g)
		.map((v) => v.trim())
		.filter(Boolean);
}

function joinAllowList(items: string[]): string {
	return items.join("\n");
}

export function FeishuChannelCard({
	channelConfig,
	runtimeChannel,
	saving,
	onSave,
}: FeishuChannelCardProps) {
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
			const result = await testRemoteChannel("feishu");
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
			<div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-feishu via-brand-feishu-mid to-brand-feishu-deep opacity-70" />

			<div className="p-5 space-y-5">
				{/* 标题 + 开关 */}
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-feishu/20 to-brand-feishu-deep/15">
							<MessageSquareMore className="h-4.5 w-4.5 text-brand-feishu-icon dark:text-brand-feishu-icon-dark" />
						</div>
						<div>
							<SettingsSectionTitle className="mb-0">
								Feishu 通道
							</SettingsSectionTitle>
							<p className="text-xs text-text-secondary mt-0.5">
								首期完整通道，默认 WebSocket 长连接
							</p>
						</div>
					</div>
					<SettingsSwitch
						checked={channelConfig.enabled}
						onChange={(next) => {
							onSave((draft) => {
								draft.channels.feishu.enabled = next;
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
									draft.channels.feishu.appId = value;
									return draft;
								});
							}}
							className={INPUT_CLASS}
							placeholder="cli_xxx"
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">App Secret</span>
						<input
							type="password"
							value={channelConfig.appSecret ?? ""}
							onChange={(e) => {
								const value = e.target.value;
								onSave((draft) => {
									draft.channels.feishu.appSecret = value;
									return draft;
								});
							}}
							className={INPUT_CLASS}
							placeholder="请输入 Feishu App Secret"
						/>
					</label>
				</div>

				{/* 运行参数 */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
					<div className="space-y-1.5">
						<span className="text-sm text-text-secondary font-medium">
							域名
						</span>
						<Select
							value={channelConfig.domain}
							onChange={(e) => {
								const value = e.target.value as "feishu" | "lark";
								onSave((draft) => {
									draft.channels.feishu.domain = value;
									return draft;
								});
							}}
							options={[
								{ label: "Feishu", value: "feishu" },
								{ label: "Lark", value: "lark" },
							]}
						/>
					</div>
					<div className="space-y-1.5">
						<span className="text-sm text-text-secondary font-medium">
							连接模式
						</span>
						<Select
							value={channelConfig.connectionMode}
							onChange={(e) => {
								const value = e.target.value as "websocket" | "webhook";
								onSave((draft) => {
									draft.channels.feishu.connectionMode = value;
									return draft;
								});
							}}
							options={[
								{ label: "WebSocket", value: "websocket" },
								{ label: "Webhook", value: "webhook" },
							]}
						/>
					</div>
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
									draft.channels.feishu.dmPolicy = value;
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
									draft.channels.feishu.groupPolicy = value;
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
				</div>

				{/* Allowlists */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							DM allowlist（每行一个 open_id）
						</span>
						<textarea
							value={allowFromDraft}
							onChange={(e) => {
								const value = splitAllowList(e.target.value);
								onSave((draft) => {
									draft.channels.feishu.allowFrom = value;
									return draft;
								});
							}}
							rows={3}
							className={`${INPUT_CLASS} resize-none`}
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							群 allowlist（每行一个群 ID 或用户 ID）
						</span>
						<textarea
							value={groupAllowFromDraft}
							onChange={(e) => {
								const value = splitAllowList(e.target.value);
								onSave((draft) => {
									draft.channels.feishu.groupAllowFrom = value;
									return draft;
								});
							}}
							rows={3}
							className={`${INPUT_CLASS} resize-none`}
						/>
					</label>
				</div>

				{/* 速率 + 分片 + mention */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
									draft.channels.feishu.textChunkLimit = value;
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
									draft.channels.feishu.rateLimitPerMinute = value;
									return draft;
								});
							}}
							className={INPUT_CLASS}
						/>
					</label>
					<div className="flex items-center justify-between rounded-xl border border-border/80 bg-surface px-3 py-2">
						<div className="text-sm font-medium text-text-secondary">
							要求 @ 提及
						</div>
						<SettingsSwitch
							checked={channelConfig.requireMention}
							onChange={(next) => {
								onSave((draft) => {
									draft.channels.feishu.requireMention = next;
									return draft;
								});
							}}
							disabled={saving}
						/>
					</div>
				</div>

				{/* 附件合并 + 文档预取 */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div className="flex items-center justify-between rounded-xl border border-border/80 bg-surface px-3 py-2">
						<div className="text-sm font-medium text-text-secondary">
							附件与命令合并
						</div>
						<SettingsSwitch
							checked={channelConfig.enableAttachmentMerge}
							onChange={(next) => {
								onSave((draft) => {
									draft.channels.feishu.enableAttachmentMerge = next;
									return draft;
								});
							}}
							disabled={saving}
						/>
					</div>
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							合并窗口（秒）
						</span>
						<input
							type="number"
							min={5}
							max={300}
							value={channelConfig.attachmentMergeWindowSec}
							onChange={(e) => {
								const value = Math.max(
									5,
									Math.min(300, Number(e.target.value || 45)),
								);
								onSave((draft) => {
									draft.channels.feishu.attachmentMergeWindowSec = value;
									return draft;
								});
							}}
							disabled={!channelConfig.enableAttachmentMerge}
							className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
						/>
					</label>
					<div className="flex items-center justify-between rounded-xl border border-border/80 bg-surface px-3 py-2">
						<div className="text-sm font-medium text-text-secondary">
							文档链接预取
						</div>
						<SettingsSwitch
							checked={channelConfig.enableDocLinkPrefetch}
							onChange={(next) => {
								onSave((draft) => {
									draft.channels.feishu.enableDocLinkPrefetch = next;
									return draft;
								});
							}}
							disabled={saving}
						/>
					</div>
				</div>

				{/* 文档控制能力 */}
				<div className="space-y-3 rounded-2xl border border-border/70 bg-warm-50/50 p-4/40">
					<div>
						<SettingsSectionTitle className="mb-0.5 text-base">
							文档控制能力
						</SettingsSectionTitle>
						<p className="text-xs text-text-secondary leading-relaxed">
							优先 MCP 工具调用，支持 /doc.call 命令兜底
						</p>
					</div>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<DocToggle
							label="启用 Docx MCP"
							checked={channelConfig.enableDocxMcp}
							onChange={(next) => {
								onSave((draft) => {
									draft.channels.feishu.enableDocxMcp = next;
									return draft;
								});
							}}
							saving={saving}
						/>
						<DocToggle
							label="允许写操作"
							checked={channelConfig.enableDocWriteOps}
							onChange={(next) => {
								onSave((draft) => {
									draft.channels.feishu.enableDocWriteOps = next;
									return draft;
								});
							}}
							saving={saving}
						/>
						<DocToggle
							label="允许文档级删除（高风险）"
							checked={channelConfig.enableDocFileDelete}
							onChange={(next) => {
								onSave((draft) => {
									draft.channels.feishu.enableDocFileDelete = next;
									return draft;
								});
							}}
							saving={saving}
							danger
						/>
						<DocToggle
							label="启用旧 Docs 读取兼容"
							checked={channelConfig.enableLegacyDocsRead}
							onChange={(next) => {
								onSave((draft) => {
									draft.channels.feishu.enableLegacyDocsRead = next;
									return draft;
								});
							}}
							saving={saving}
						/>
						<DocToggle
							label="启用 /doc.call 兜底"
							checked={channelConfig.enableDocCommandFallback}
							onChange={(next) => {
								onSave((draft) => {
									draft.channels.feishu.enableDocCommandFallback = next;
									return draft;
								});
							}}
							saving={saving}
							span2
						/>
					</div>
					<div className="rounded-xl border border-peach-500/30 bg-peach-500/10 px-3 py-2 text-xs leading-relaxed text-text-secondary">
						需要的飞书权限：<code>docx:document</code> /{" "}
						<code>docx:document:write_only</code> /{" "}
						<code>docs:document.content:read</code> / <code>drive:drive</code>{" "}
						或 <code>space:document:delete</code>
					</div>
				</div>

				{/* 能力开关 */}
				<ChannelFeatureToggles
					value={channelConfig.features}
					onChange={(next) => {
						onSave((draft) => {
							draft.channels.feishu.features = next;
							return draft;
						});
					}}
					allowCardStreaming
					fallback={DEFAULT_FEISHU_FEATURES}
					disabled={saving}
				/>

				{/* 运行状态条 */}
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
						<StatusDot
							tone={runtimeChannel?.running ? "emerald" : "zinc"}
							pulse={!!runtimeChannel?.running}
							size="xs"
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

function DocToggle({
	label,
	checked,
	onChange,
	saving,
	danger = false,
	span2 = false,
}: {
	label: string;
	checked: boolean;
	onChange: (next: boolean) => void;
	saving: boolean;
	danger?: boolean;
	span2?: boolean;
}) {
	return (
		<div
			className={`flex items-center justify-between rounded-xl border bg-surface px-3 py-2 transition-colors ${
				danger ? "border-error/30" : "border-border"
			} ${span2 ? "md:col-span-2" : ""}`}
		>
			<div
				className={`text-sm font-medium ${danger ? "text-error" : "text-text-secondary"}`}
			>
				{label}
			</div>
			<SettingsSwitch checked={checked} onChange={onChange} disabled={saving} />
		</div>
	);
}
