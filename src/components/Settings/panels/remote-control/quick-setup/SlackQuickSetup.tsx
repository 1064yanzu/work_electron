/**
 * SlackQuickSetup — Slack 快速配置向导
 *
 * Slack 要用 Socket Mode：需要 Bot Token (xoxb-) + App-Level Token (xapp-)。
 */

import { Activity, CheckCircle2, KeyRound, Plug } from "lucide-react";
import { useCallback, useState } from "react";
import type { RemoteControlConfig } from "../../../../../lib/api";
import { cn } from "../../../../../lib/utils";
import { Button } from "../../../../ui/Button";
import { toast } from "../../../../ui/Toast";
import { ExternalLinkChip, StepBlock } from "./StepBlock";
import { SuccessCard } from "./TelegramQuickSetup";

export function SlackQuickSetup({
	initialBotToken,
	initialAppToken,
	onApply,
	onComplete,
}: {
	initialBotToken?: string;
	initialAppToken?: string;
	onApply: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => Promise<void> | void;
	onComplete: () => void;
}) {
	const [botToken, setBotToken] = useState(initialBotToken ?? "");
	const [appToken, setAppToken] = useState(initialAppToken ?? "");
	const [saving, setSaving] = useState(false);
	const [success, setSuccess] = useState(false);
	const bot = botToken.trim();
	const app = appToken.trim();
	const botValid = /^xoxb-/.test(bot);
	const appValid = /^xapp-/.test(app);
	const ok = botValid && appValid;

	const handleConfirm = useCallback(async () => {
		if (!ok) {
			toast.warning("请确认两个 token 的前缀（xoxb- / xapp-）");
			return;
		}
		setSaving(true);
		try {
			await onApply((draft) => {
				draft.enabled = true;
				if (draft.channels.slack) {
					draft.channels.slack.botToken = bot;
					draft.channels.slack.appToken = app;
					draft.channels.slack.enabled = true;
				}
				return draft;
			});
			setSuccess(true);
		} finally {
			setSaving(false);
		}
	}, [bot, app, ok, onApply]);

	if (success) {
		return (
			<SuccessCard
				onDone={onComplete}
				title="Slack 配置成功"
				description="通道已启用。把 bot 邀请到频道后，就能给它发消息远程控制了。"
			/>
		);
	}

	return (
		<div className="space-y-5">
			<div className="flex items-start gap-3">
				<div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-400/10">
					<Activity className="h-5 w-5 text-emerald-600" strokeWidth={1.8} />
				</div>
				<div>
					<h3 className="text-base font-semibold text-text-primary">
						Slack 快速配置
					</h3>
					<p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
						使用 Slack Socket Mode，无需公网 URL。需要两个 token：Bot Token
						(xoxb-) 和 App-Level Token (xapp-)。
					</p>
				</div>
			</div>

			<div className="rounded-2xl border border-border/70 bg-gradient-to-br from-zinc-50/70 to-white p-5 dark:from-zinc-900/60 dark:to-zinc-900">
				<StepBlock
					index={1}
					icon={Plug}
					title="去 Slack API 创建 App"
					description="打开 api.slack.com → Your Apps → Create New App → From scratch。"
					action={
						<ExternalLinkChip
							href="https://api.slack.com/apps?new_app=1"
							label="创建 Slack App"
						/>
					}
				/>
				<StepBlock
					index={2}
					icon={KeyRound}
					title="启用 Socket Mode 并生成 App-Level Token"
					description='左侧 "Socket Mode" → 开启 → 生成 Token (prefix xapp-)，勾选 connections:write scope。'
				>
					<input
						type="password"
						value={appToken}
						onChange={(e) => setAppToken(e.target.value)}
						onPaste={(e) => {
							const pasted = e.clipboardData.getData("text");
							if (pasted) {
								e.preventDefault();
								setAppToken(pasted.trim());
							}
						}}
						placeholder="xapp-1-..."
						className={cn(
							"w-full rounded-xl border bg-surface px-3 py-2.5 font-mono text-sm outline-none transition-all duration-200",
							appValid
								? "border-emerald-400 ring-2 ring-emerald-400/20"
								: app
									? "border-rose-300 ring-2 ring-rose-300/20 dark:border-rose-700"
									: "border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
						)}
					/>
				</StepBlock>
				<StepBlock
					index={3}
					icon={KeyRound}
					title="配置 Bot Scopes 并安装到 Workspace"
					description="OAuth & Permissions → 添加 chat:write / im:history / im:read / app_mentions:read / channels:history → Install to Workspace → 拷贝 Bot User OAuth Token (prefix xoxb-)。"
					isLast
				>
					<input
						type="password"
						value={botToken}
						onChange={(e) => setBotToken(e.target.value)}
						onPaste={(e) => {
							const pasted = e.clipboardData.getData("text");
							if (pasted) {
								e.preventDefault();
								setBotToken(pasted.trim());
							}
						}}
						placeholder="xoxb-..."
						className={cn(
							"w-full rounded-xl border bg-surface px-3 py-2.5 font-mono text-sm outline-none transition-all duration-200",
							botValid
								? "border-emerald-400 ring-2 ring-emerald-400/20"
								: bot
									? "border-rose-300 ring-2 ring-rose-300/20 dark:border-rose-700"
									: "border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
						)}
					/>
					{ok ? (
						<p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
							<CheckCircle2 className="h-3 w-3" />
							两个 token 格式都正确
						</p>
					) : null}
				</StepBlock>
			</div>

			<div className="flex items-center justify-end gap-2">
				<Button
					variant="primary"
					size="md"
					disabled={!ok || saving}
					loading={saving}
					onClick={() => void handleConfirm()}
				>
					{saving ? "应用中..." : "完成配置"}
				</Button>
			</div>
		</div>
	);
}
