/**
 * DiscordQuickSetup — Discord 快速配置向导
 */

import { Bot, CheckCircle2, KeyRound, Shield } from "lucide-react";
import { useCallback, useState } from "react";
import type { RemoteControlConfig } from "../../../../../lib/api";
import { cn } from "../../../../../lib/utils";
import { Button } from "../../../../ui/Button";
import { toast } from "../../../../ui/Toast";
import { ExternalLinkChip, StepBlock } from "./StepBlock";
import { SuccessCard } from "./TelegramQuickSetup";

export function DiscordQuickSetup({
	initialBotToken,
	initialAppId,
	onApply,
	onComplete,
}: {
	initialBotToken?: string;
	initialAppId?: string;
	onApply: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => Promise<void> | void;
	onComplete: () => void;
}) {
	const [botToken, setBotToken] = useState(initialBotToken ?? "");
	const [appId, setAppId] = useState(initialAppId ?? "");
	const [saving, setSaving] = useState(false);
	const [success, setSuccess] = useState(false);
	const trimmed = botToken.trim();
	const tokenValid = trimmed.length >= 50 && /^[A-Za-z0-9._-]+$/.test(trimmed);

	const handleConfirm = useCallback(async () => {
		if (!tokenValid) {
			toast.warning("Bot Token 看起来不太对，请检查");
			return;
		}
		setSaving(true);
		try {
			await onApply((draft) => {
				draft.enabled = true;
				if (draft.channels.discord) {
					draft.channels.discord.botToken = trimmed;
					draft.channels.discord.applicationId = appId.trim() || undefined;
					draft.channels.discord.enabled = true;
				}
				return draft;
			});
			setSuccess(true);
		} finally {
			setSaving(false);
		}
	}, [trimmed, appId, tokenValid, onApply]);

	if (success) {
		return (
			<SuccessCard
				onDone={onComplete}
				title="Discord 配置成功"
				description="通道已启用。记得给 bot 分配需要的 intents 和权限。"
			/>
		);
	}

	return (
		<div className="space-y-5">
			<div className="flex items-start gap-3">
				<div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/10">
					<Bot className="h-5 w-5 text-indigo-600" strokeWidth={1.8} />
				</div>
				<div>
					<h3 className="text-base font-semibold text-text-primary">
						Discord 快速配置
					</h3>
					<p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
						在 Developer Portal 创建应用，开启 Bot，拷贝 Bot Token。
					</p>
				</div>
			</div>

			<div className="rounded-2xl border border-border/70 bg-gradient-to-br from-zinc-50/70 to-white p-5 dark:from-zinc-900/60 dark:to-zinc-900">
				<StepBlock
					index={1}
					icon={Bot}
					title="打开 Discord Developer Portal"
					description="New Application → 起个名字 → 左侧 Bot → Add Bot。"
					action={
						<ExternalLinkChip
							href="https://discord.com/developers/applications"
							label="打开 Developer Portal"
						/>
					}
				/>
				<StepBlock
					index={2}
					icon={Shield}
					title="开启 MESSAGE CONTENT INTENT"
					description="Bot 页面向下滚动，开启 Privileged Gateway Intents 里的 MESSAGE CONTENT（不开 bot 收不到消息正文）。"
				/>
				<StepBlock
					index={3}
					icon={KeyRound}
					title="Reset Token 并粘贴 Bot Token"
					description="点 Reset Token，复制后粘进这里。注意 Token 只会展示一次。"
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
						placeholder="MT..."
						className={cn(
							"w-full rounded-xl border bg-surface px-3 py-2.5 font-mono text-sm outline-none transition-all duration-200",
							tokenValid
								? "border-emerald-400 ring-2 ring-emerald-400/20"
								: trimmed
									? "border-rose-300 ring-2 ring-rose-300/20 dark:border-rose-700"
									: "border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
						)}
					/>
					{tokenValid ? (
						<p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
							<CheckCircle2 className="h-3 w-3" />
							Token 格式看起来没问题
						</p>
					) : null}
				</StepBlock>
				<StepBlock
					index={4}
					icon={KeyRound}
					title="（可选）粘贴 Application ID"
					description="General Information 页面顶部有 Application ID，填了可以使用更多 API。"
					isLast
				>
					<input
						value={appId}
						onChange={(e) => setAppId(e.target.value)}
						placeholder="应用 ID（可选）"
						className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 font-mono text-sm outline-none transition-all duration-200 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
					/>
				</StepBlock>
			</div>

			<div className="flex items-center justify-end gap-2">
				<Button
					variant="primary"
					size="md"
					disabled={!tokenValid || saving}
					loading={saving}
					onClick={() => void handleConfirm()}
				>
					{saving ? "应用中..." : "完成配置"}
				</Button>
			</div>
		</div>
	);
}
