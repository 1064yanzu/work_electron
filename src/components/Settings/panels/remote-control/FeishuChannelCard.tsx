/**
 * FeishuChannelCard — 飞书渠道专属配置卡片
 * 提取自 RemoteControlSettings，减轻主文件体积
 */

import { Link2, MessageSquare, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
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

// ─── helpers ──────────────────────────────────────────────
function splitAllowList(raw: string): string[] {
	return raw
		.split(/[\n,]/g)
		.map((v) => v.trim())
		.filter(Boolean);
}

function joinAllowList(items: string[]): string {
	return items.join("\n");
}

const INPUT_CLASS =
	"w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600";

type FeishuChannelCardProps = {
	config: RemoteControlConfig;
	runtimeChannel: RemoteChannelStatus | null;
	saving: boolean;
	onSave: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => void;
};

export function FeishuChannelCard({
	config,
	runtimeChannel,
	saving,
	onSave,
}: FeishuChannelCardProps) {
	const [busyTest, setBusyTest] = useState(false);

	const allowFromDraft = useMemo(
		() => joinAllowList(config.channels.feishu.allowFrom ?? []),
		[config.channels.feishu.allowFrom],
	);
	const groupAllowFromDraft = useMemo(
		() => joinAllowList(config.channels.feishu.groupAllowFrom ?? []),
		[config.channels.feishu.groupAllowFrom],
	);

	const handleTest = async () => {
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
	};

	return (
		<div className="relative overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-[0_2px_8px_rgb(0,0,0,0.04)] ring-1 ring-black/[0.03] dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/[0.02]">
			{/* 顶部装饰线 */}
			<div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 opacity-60" />

			<div className="p-5 space-y-5">
				{/* 标题行 */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/15 to-indigo-500/15 dark:from-blue-500/25 dark:to-indigo-500/25">
							<MessageSquare className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
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
						checked={config.channels.feishu.enabled}
						onChange={(next) => {
							onSave((draft) => {
								draft.channels.feishu.enabled = next;
								return draft;
							});
						}}
						disabled={saving}
					/>
				</div>

				{/* 凭证区域 */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">App ID</span>
						<input
							value={config.channels.feishu.appId ?? ""}
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
							value={config.channels.feishu.appSecret ?? ""}
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

				{/* 策略配置 */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
					<div className="space-y-1.5">
						<span className="text-sm text-text-secondary font-medium">
							域名
						</span>
						<Select
							value={config.channels.feishu.domain}
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
							value={config.channels.feishu.connectionMode}
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
							value={config.channels.feishu.dmPolicy}
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
							value={config.channels.feishu.groupPolicy}
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

				{/* 白名单 */}
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
							className={INPUT_CLASS + " resize-none"}
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
							className={INPUT_CLASS + " resize-none"}
						/>
					</label>
				</div>

				{/* 限流 & 分块 & @ 提及 */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							文本分片长度
						</span>
						<input
							type="number"
							min={300}
							value={config.channels.feishu.textChunkLimit}
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
							value={config.channels.feishu.rateLimitPerMinute}
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
					<div className="space-y-1.5">
						<span className="text-sm text-text-secondary font-medium">
							要求 @ 提及
						</span>
						<div className="flex h-[42px] items-center">
							<SettingsSwitch
								checked={config.channels.feishu.requireMention}
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
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div className="space-y-1.5">
						<span className="text-sm text-text-secondary font-medium">
							附件与命令合并
						</span>
						<div className="flex h-[42px] items-center">
							<SettingsSwitch
								checked={config.channels.feishu.enableAttachmentMerge}
								onChange={(next) => {
									onSave((draft) => {
										draft.channels.feishu.enableAttachmentMerge = next;
										return draft;
									});
								}}
								disabled={saving}
							/>
						</div>
					</div>
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							合并窗口（秒）
						</span>
						<input
							type="number"
							min={5}
							max={300}
							value={config.channels.feishu.attachmentMergeWindowSec}
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
							className={INPUT_CLASS}
							disabled={!config.channels.feishu.enableAttachmentMerge}
						/>
					</label>
					<div className="space-y-1.5">
						<span className="text-sm text-text-secondary font-medium">
							文档链接预取（Docx/Wiki）
						</span>
						<div className="flex h-[42px] items-center">
							<SettingsSwitch
								checked={config.channels.feishu.enableDocLinkPrefetch}
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
				</div>

				{/* 运行状态条 */}
				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/50 px-4 py-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/30">
					<Wifi className="h-4 w-4 text-text-muted" />
					<span className="text-text-secondary">运行状态：</span>
					<span
						className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${
							runtimeChannel?.running
								? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
								: "bg-zinc-500/10 text-zinc-500"
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
								: "text-zinc-500"
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
