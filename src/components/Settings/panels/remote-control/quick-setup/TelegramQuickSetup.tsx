/**
 * TelegramQuickSetup — Telegram 快速配置向导
 *
 * 不支持扫码（Telegram Bot API 没有 Device Code Flow），
 * 但我们可以用清晰的"去 @BotFather → 粘贴 token → 完成"
 * 降低 99% 的配置门槛。
 */

import { Bot, CheckCircle2, Copy, KeyRound, Send } from "lucide-react";
import { useCallback, useState } from "react";
import type { RemoteControlConfig } from "../../../../../lib/api";
import { cn } from "../../../../../lib/utils";
import { Button } from "../../../../ui/Button";
import { toast } from "../../../../ui/Toast";
import { ExternalLinkChip, StepBlock } from "./StepBlock";

const TOKEN_PATTERN = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;

export function TelegramQuickSetup({
	initialToken,
	onApply,
	onComplete,
}: {
	initialToken?: string;
	onApply: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => Promise<void> | void;
	onComplete: () => void;
}) {
	const [token, setToken] = useState(initialToken ?? "");
	const [saving, setSaving] = useState(false);
	const [success, setSuccess] = useState(false);
	const trimmed = token.trim();
	const isValid = TOKEN_PATTERN.test(trimmed);

	const handleConfirm = useCallback(async () => {
		if (!isValid) {
			toast.warning("Token 格式不对；应形如 123456789:ABCdef...");
			return;
		}
		setSaving(true);
		try {
			await onApply((draft) => {
				draft.enabled = true;
				if (draft.channels.telegram) {
					draft.channels.telegram.botToken = trimmed;
					draft.channels.telegram.enabled = true;
				}
				return draft;
			});
			setSuccess(true);
		} finally {
			setSaving(false);
		}
	}, [trimmed, isValid, onApply]);

	if (success) {
		return (
			<SuccessCard
				onDone={onComplete}
				title="Telegram 配置成功"
				description="通道已启用。给你的 bot 发一条消息，然后在「配对」页面批准，就能远程控制了。"
			/>
		);
	}

	return (
		<div className="space-y-5">
			<div className="flex items-start gap-3">
				<div className="bai-icon-badge h-11 w-11 flex-shrink-0">
					<Send className="h-5 w-5 text-text-secondary" strokeWidth={1.5} />
				</div>
				<div>
					<h3 className="text-base font-semibold text-text-primary">
						Telegram 快速配置
					</h3>
					<p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
						去 Telegram 官方 @BotFather 创建一个 bot，把它给你的 token
						粘过来就行。
					</p>
				</div>
			</div>

			<div className="rounded-2xl border border-border bg-warm-200/30 p-5">
				<StepBlock
					index={1}
					icon={Bot}
					title="打开 Telegram 找 @BotFather"
					description="在 Telegram 搜索 @BotFather 或点右侧快捷方式。"
					action={
						<ExternalLinkChip
							href="https://t.me/BotFather"
							label="直达 @BotFather"
						/>
					}
				/>
				<StepBlock
					index={2}
					icon={Copy}
					title="发送 /newbot 创建新 bot"
					description='按提示输入 bot 名称 + username（要以 "bot" 结尾，比如 my_assistant_bot）。'
				>
					<div className="rounded-xl bg-warm-200/80 p-3 font-mono text-xs text-text-secondary/60">
						<div>/newbot</div>
						<div className="text-text-muted">
							→ Alright, a new bot. How are we going to call it?
						</div>
					</div>
				</StepBlock>
				<StepBlock
					index={3}
					icon={KeyRound}
					title="粘贴 @BotFather 给的 Token"
					description="形如 123456789:ABCdef_ghiJKL-mnop 的一串字符。"
					isLast
				>
					<input
						type="password"
						autoFocus
						value={token}
						onChange={(e) => setToken(e.target.value)}
						onPaste={(e) => {
							// 粘贴时顺手 trim
							const pasted = e.clipboardData.getData("text");
							if (pasted) {
								e.preventDefault();
								setToken(pasted.trim());
							}
						}}
						placeholder="123456789:ABC..."
						className={cn(
							"w-full rounded-xl border bg-surface px-3 py-2.5 font-mono text-sm outline-none transition-[color,background-color,border-color,box-shadow] duration-150 ease-out",
							isValid
								? "border-mint-500 ring-2 ring-mint-500/20"
								: trimmed
									? "border-error/50 ring-2 ring-error/20"
									: "border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
						)}
					/>
					{trimmed && !isValid ? (
						<p className="mt-1.5 text-xs text-error">
							Token 格式不正确，应形如{" "}
							<code className="font-mono">数字:字符串</code>
						</p>
					) : null}
					{isValid ? (
						<p className="mt-1.5 inline-flex items-center gap-1 text-xs text-mint-600">
							<CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
							Token 格式正确
						</p>
					) : null}
				</StepBlock>
			</div>

			<div className="flex items-center justify-end gap-2">
				<Button
					variant="primary"
					size="md"
					disabled={!isValid || saving}
					loading={saving}
					onClick={() => void handleConfirm()}
				>
					{saving ? "应用中..." : "完成配置"}
				</Button>
			</div>
		</div>
	);
}

export function SuccessCard({
	title,
	description,
	onDone,
}: {
	title: string;
	description: string;
	onDone: () => void;
}) {
	return (
		<div className="space-y-5">
			<div className="flex flex-col items-center gap-4 rounded-2xl border border-mint-500/30 bg-mint-500/[0.06] py-10 text-center">
				<div className="flex h-14 w-14 items-center justify-center rounded-full bg-mint-500/15 text-mint-600">
					<CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />
				</div>
				<div className="space-y-1">
					<div className="text-base font-semibold text-text-primary">
						{title}
					</div>
					<p className="max-w-sm text-xs leading-relaxed text-text-muted">
						{description}
					</p>
				</div>
				<Button variant="primary" size="md" onClick={onDone}>
					完成
				</Button>
			</div>
		</div>
	);
}
