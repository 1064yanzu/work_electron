/**
 * QQBotQuickSetup — QQ Bot 快速配置向导
 */

import { Bot, KeyRound } from "lucide-react";
import { useCallback, useState } from "react";
import type { RemoteControlConfig } from "../../../../../lib/api";
import { cn } from "../../../../../lib/utils";
import { Button } from "../../../../ui/Button";
import { toast } from "../../../../ui/Toast";
import { ExternalLinkChip, StepBlock } from "./StepBlock";
import { SuccessCard } from "./TelegramQuickSetup";

export function QQBotQuickSetup({
	initialAppId,
	initialClientSecret,
	onApply,
	onComplete,
}: {
	initialAppId?: string;
	initialClientSecret?: string;
	onApply: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => Promise<void> | void;
	onComplete: () => void;
}) {
	const [appId, setAppId] = useState(initialAppId ?? "");
	const [clientSecret, setClientSecret] = useState(initialClientSecret ?? "");
	const [environment, setEnvironment] = useState<"prod" | "sandbox">("sandbox");
	const [saving, setSaving] = useState(false);
	const [success, setSuccess] = useState(false);
	const idTrim = appId.trim();
	const secretTrim = clientSecret.trim();
	const idValid = /^\d{4,}$/.test(idTrim);
	const ok = idValid && secretTrim.length >= 16;

	const handleConfirm = useCallback(async () => {
		if (!ok) {
			toast.warning("请检查 App ID（数字）和 Client Secret 是否填写完整");
			return;
		}
		setSaving(true);
		try {
			await onApply((draft) => {
				draft.enabled = true;
				if (draft.channels.qqbot) {
					draft.channels.qqbot.appId = idTrim;
					draft.channels.qqbot.clientSecret = secretTrim;
					draft.channels.qqbot.environment = environment;
					draft.channels.qqbot.enabled = true;
				}
				return draft;
			});
			setSuccess(true);
		} finally {
			setSaving(false);
		}
	}, [idTrim, secretTrim, environment, ok, onApply]);

	if (success) {
		return (
			<SuccessCard
				onDone={onComplete}
				title="QQ Bot 配置成功"
				description={`通道已启用（${environment === "prod" ? "生产" : "沙箱"}环境）。沙箱环境下只能和白名单用户互动，调试完别忘了切换到生产。`}
			/>
		);
	}

	return (
		<div className="space-y-5">
			<div className="flex items-start gap-3">
				<div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-warm-200 border border-border">
					<Bot className="h-5 w-5 text-text-secondary" strokeWidth={1.5} />
				</div>
				<div>
					<h3 className="text-base font-semibold text-text-primary">
						QQ Bot 快速配置
					</h3>
					<p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
						基于 QQ 开放平台官方 Bot。先在 q.qq.com/qqbot 申请机器人，拿到 appId
						和 client_secret 即可。
					</p>
				</div>
			</div>

			<div className="rounded-2xl border border-border bg-warm-200/30 p-5">
				<StepBlock
					index={1}
					icon={Bot}
					title="去 QQ 开放平台申请机器人"
					description="登录后创建机器人、沙箱环境中先跑通；生产环境需要官方审核。"
					action={
						<ExternalLinkChip
							href="https://q.qq.com/qqbot/"
							label="q.qq.com/qqbot"
						/>
					}
				/>
				<StepBlock
					index={2}
					icon={KeyRound}
					title="填入凭证"
					description="开发设置页面能看到 appId（一串数字）和 client_secret。"
				>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<div>
							<label
								htmlFor="qqbot-appid"
								className="text-[11px] text-text-muted"
							>
								App ID
							</label>
							<input
								id="qqbot-appid"
								value={appId}
								onChange={(e) => setAppId(e.target.value)}
								placeholder="102xxxxxx"
								className={cn(
									"mt-1 w-full rounded-xl border bg-surface px-3 py-2.5 font-mono text-sm outline-none transition-[color,background-color,border-color,box-shadow] duration-200 ease-out",
									idValid
										? "border-mint-500 ring-2 ring-mint-500/20"
										: idTrim
											? "border-error/50 ring-2 ring-error/20"
											: "border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
								)}
							/>
						</div>
						<div>
							<label
								htmlFor="qqbot-secret"
								className="text-[11px] text-text-muted"
							>
								Client Secret
							</label>
							<input
								id="qqbot-secret"
								type="password"
								value={clientSecret}
								onChange={(e) => setClientSecret(e.target.value)}
								placeholder="client_secret"
								className={cn(
									"mt-1 w-full rounded-xl border bg-surface px-3 py-2.5 font-mono text-sm outline-none transition-[color,background-color,border-color,box-shadow] duration-200 ease-out",
									secretTrim.length >= 16
										? "border-mint-500 ring-2 ring-mint-500/20"
										: secretTrim
											? "border-error/50 ring-2 ring-error/20"
											: "border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
								)}
							/>
						</div>
					</div>
				</StepBlock>
				<StepBlock
					index={3}
					icon={KeyRound}
					title="选择环境"
					description="首次调试建议用沙箱（只和白名单用户互动），上线后再切生产。"
					isLast
				>
					<div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
						<EnvPill
							active={environment === "sandbox"}
							onClick={() => setEnvironment("sandbox")}
							label="沙箱环境（推荐）"
						/>
						<EnvPill
							active={environment === "prod"}
							onClick={() => setEnvironment("prod")}
							label="生产环境"
						/>
					</div>
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

function EnvPill({
	active,
	onClick,
	label,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"rounded-lg px-3 py-1 text-xs font-medium transition-[color,background-color,border-color,box-shadow] duration-200 ease-out",
				active
					? "bg-primary/10 text-primary ring-1 ring-primary/20"
					: "text-text-muted hover:text-text-secondary",
			)}
		>
			{label}
		</button>
	);
}
