/**
 * FeishuQuickSetup — 飞书扫码直连向导
 *
 * 流程：
 *   1. 打开时自动调用 beginFeishuAppRegistration → 获得 QR + deviceCode + interval + expireIn
 *   2. 定时（interval 秒）调用 pollFeishuAppRegistration → 直到 success / access_denied / expired / error
 *   3. 成功时自动把 appId/appSecret/domain 写进配置，并用当前用户 open_id 自动配置 allowFrom
 *
 * 状态：loading / ready / expired / denied / failed / success
 */

import {
	AlertTriangle,
	CheckCircle2,
	Loader2,
	RefreshCw,
	ScanLine,
	Smartphone,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	beginFeishuAppRegistration,
	pollFeishuAppRegistration,
	type FeishuBeginAppRegistrationResult,
	type RemoteControlConfig,
} from "../../../../../lib/api";
import { cn } from "../../../../../lib/utils";
import { Button } from "../../../../ui/Button";

type Status =
	| { kind: "loading" }
	| {
			kind: "ready";
			begin: FeishuBeginAppRegistrationResult;
			remainingSec: number;
			domain: "feishu" | "lark";
			intervalSec: number;
	  }
	| { kind: "expired" }
	| { kind: "denied" }
	| { kind: "failed"; message: string }
	| {
			kind: "success";
			appId: string;
			appSecret: string;
			domain: "feishu" | "lark";
			openId?: string;
	  };

export function FeishuQuickSetup({
	onApply,
	onComplete,
	onSwitchManual,
}: {
	onApply: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => Promise<void> | void;
	onComplete: () => void;
	onSwitchManual: () => void;
}) {
	const [status, setStatus] = useState<Status>({ kind: "loading" });
	const [applied, setApplied] = useState(false);
	const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	// 防止 React StrictMode 双重挂载导致两次 beginAppRegistration
	const startedRef = useRef(false);
	// 防止陈旧的 start() 响应覆盖较新一次的状态
	const startIdRef = useRef(0);

	const start = useCallback(async () => {
		const id = ++startIdRef.current;
		setStatus({ kind: "loading" });
		setApplied(false);
		try {
			const begin = await beginFeishuAppRegistration("feishu");
			if (startIdRef.current !== id) return;
			setStatus({
				kind: "ready",
				begin,
				remainingSec: begin.expireInSec,
				domain: "feishu",
				intervalSec: begin.intervalSec,
			});
		} catch (error) {
			if (startIdRef.current !== id) return;
			setStatus({
				kind: "failed",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}, []);

	useEffect(() => {
		if (startedRef.current) return;
		startedRef.current = true;
		void start();
	}, [start]);

	// 倒计时
	useEffect(() => {
		if (status.kind !== "ready") {
			if (countdownTimerRef.current) {
				clearInterval(countdownTimerRef.current);
				countdownTimerRef.current = null;
			}
			return;
		}
		countdownTimerRef.current = setInterval(() => {
			setStatus((prev) => {
				if (prev.kind !== "ready") return prev;
				const next = prev.remainingSec - 1;
				if (next <= 0) {
					return { kind: "expired" };
				}
				return { ...prev, remainingSec: next };
			});
		}, 1000);
		return () => {
			if (countdownTimerRef.current) {
				clearInterval(countdownTimerRef.current);
				countdownTimerRef.current = null;
			}
		};
	}, [status.kind]);

	// 轮询
	useEffect(() => {
		if (status.kind !== "ready") {
			if (pollTimerRef.current) {
				clearTimeout(pollTimerRef.current);
				pollTimerRef.current = null;
			}
			return;
		}

		const snapshot = status;
		pollTimerRef.current = setTimeout(async () => {
			try {
				const result = await pollFeishuAppRegistration({
					deviceCode: snapshot.begin.deviceCode,
					currentDomain: snapshot.domain,
					intervalSec: snapshot.intervalSec,
				});
				switch (result.status) {
					case "pending":
						setStatus((prev) =>
							prev.kind === "ready"
								? {
										...prev,
										domain: result.domain,
										intervalSec: result.intervalSec,
									}
								: prev,
						);
						break;
					case "success":
						setStatus({
							kind: "success",
							appId: result.appId,
							appSecret: result.appSecret,
							domain: result.domain,
							openId: result.openId,
						});
						break;
					case "access_denied":
						setStatus({ kind: "denied" });
						break;
					case "expired":
						setStatus({ kind: "expired" });
						break;
					case "error":
						setStatus({ kind: "failed", message: result.message });
						break;
				}
			} catch (error) {
				setStatus({
					kind: "failed",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}, snapshot.intervalSec * 1000);

		return () => {
			if (pollTimerRef.current) {
				clearTimeout(pollTimerRef.current);
				pollTimerRef.current = null;
			}
		};
	}, [status]);

	// 成功后自动应用
	useEffect(() => {
		if (status.kind !== "success" || applied) return;
		setApplied(true);
		(async () => {
			await onApply((draft) => {
				draft.enabled = true;
				draft.channels.feishu.enabled = true;
				draft.channels.feishu.appId = status.appId;
				draft.channels.feishu.appSecret = status.appSecret;
				draft.channels.feishu.domain = status.domain;
				draft.channels.feishu.connectionMode = "websocket";
				// 用当前用户 open_id 填 allowlist，切换为 pairing 也可，但 allowlist 更直接
				if (status.openId) {
					draft.channels.feishu.dmPolicy = "allowlist";
					draft.channels.feishu.allowFrom = Array.from(
						new Set([
							...(draft.channels.feishu.allowFrom ?? []),
							status.openId,
						]),
					);
				}
				return draft;
			});
		})();
	}, [status, applied, onApply]);

	return (
		<div className="space-y-5">
			{/* 标题区 */}
			<div className="flex items-start gap-3">
				<div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-sky-500/10">
					<ScanLine className="h-5 w-5 text-sky-500" strokeWidth={1.8} />
				</div>
				<div>
					<h3 className="text-base font-semibold text-text-primary">
						用飞书 / Lark 扫码创建应用
					</h3>
					<p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
						授权后会自动为你创建一个"个人 Agent"类型的飞书应用，
						<br />
						并把凭证、域名、配对策略一并配置好。全程无需离开本界面。
					</p>
				</div>
			</div>

			{/* 主体内容：按 status 分支 */}
			<div className="rounded-xl border border-zinc-200/70 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
				{status.kind === "loading" ? <LoadingView /> : null}

				{status.kind === "ready" ? (
					<ReadyView
						qrDataUrl={status.begin.qrDataUrl}
						userCode={status.begin.userCode}
						remainingSec={status.remainingSec}
						totalSec={status.begin.expireInSec}
					/>
				) : null}

				{status.kind === "expired" ? (
					<EndStateView
						tone="amber"
						title="二维码已过期"
						description="你等得太久啦。点下面的按钮生成一张新的。"
						action={
							<Button size="sm" variant="primary" onClick={() => void start()}>
								<RefreshCw className="h-3.5 w-3.5" />
								重新生成
							</Button>
						}
					/>
				) : null}

				{status.kind === "denied" ? (
					<EndStateView
						tone="amber"
						title="你取消了授权"
						description="没关系，你可以再次尝试，或改用手动配置。"
						action={
							<div className="flex items-center gap-2">
								<Button size="sm" variant="outline" onClick={onSwitchManual}>
									手动配置
								</Button>
								<Button
									size="sm"
									variant="primary"
									onClick={() => void start()}
								>
									<RefreshCw className="h-3.5 w-3.5" />
									重新扫码
								</Button>
							</div>
						}
					/>
				) : null}

				{status.kind === "failed" ? (
					<EndStateView
						tone="rose"
						title="扫码创建失败"
						description={status.message}
						action={
							<div className="flex items-center gap-2">
								<Button size="sm" variant="outline" onClick={onSwitchManual}>
									手动配置
								</Button>
								<Button
									size="sm"
									variant="primary"
									onClick={() => void start()}
								>
									<RefreshCw className="h-3.5 w-3.5" />
									重试
								</Button>
							</div>
						}
					/>
				) : null}

				{status.kind === "success" ? (
					<SuccessView
						appId={status.appId}
						domain={status.domain}
						openId={status.openId}
						onDone={onComplete}
					/>
				) : null}
			</div>

			{/* 底部 · 回退入口 */}
			{status.kind !== "success" ? (
				<div className="flex items-center justify-between text-xs text-text-muted">
					<div className="flex items-center gap-1.5">
						<Smartphone className="h-3.5 w-3.5" />
						无法扫码？
					</div>
					<button
						type="button"
						onClick={onSwitchManual}
						className="text-primary hover:underline"
					>
						改用手动填写 →
					</button>
				</div>
			) : null}
		</div>
	);
}

function LoadingView() {
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-10">
			<Loader2 className="h-6 w-6 animate-spin text-primary" />
			<div className="text-sm text-text-secondary">正在生成二维码...</div>
		</div>
	);
}

function ReadyView({
	qrDataUrl,
	userCode,
	remainingSec,
	totalSec,
}: {
	qrDataUrl: string;
	userCode: string;
	remainingSec: number;
	totalSec: number;
}) {
	const progress = Math.max(0, Math.min(1, remainingSec / totalSec));
	const minutes = Math.floor(remainingSec / 60);
	const seconds = remainingSec % 60;
	return (
		<div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
			{/* QR 码 */}
			<div className="mx-auto flex flex-col items-center md:mx-0">
				<div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200 shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:ring-zinc-700">
					<img
						src={qrDataUrl}
						alt="飞书扫码授权"
						className="h-[220px] w-[220px] rounded-lg"
					/>
				</div>
				<div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
					<Loader2 className="h-3 w-3 animate-spin" />
					等待扫码...
				</div>
			</div>

			{/* 步骤说明 */}
			<div className="space-y-4">
				<ol className="space-y-3 text-sm leading-relaxed text-text-secondary">
					<StepLine index={1}>
						打开手机上的 <b>飞书 App</b>
					</StepLine>
					<StepLine index={2}>
						点击右上角<b>"+"</b> → 扫一扫
					</StepLine>
					<StepLine index={3}>
						扫描左侧二维码，在飞书中点"<b>授权</b>"
					</StepLine>
					<StepLine index={4}>
						本界面会自动完成应用配置
						<span className="ml-1 text-xs text-text-muted">
							（如果你用的是 Lark，请用 Lark App 扫）
						</span>
					</StepLine>
				</ol>

				{/* 倒计时条 */}
				<div>
					<div className="flex items-center justify-between text-[11px] text-text-muted">
						<span>二维码剩余有效时间</span>
						<span className="font-mono tabular-nums">
							{minutes}:{seconds.toString().padStart(2, "0")}
						</span>
					</div>
					<div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
						<div
							className={cn(
								"h-full rounded-full transition-all duration-1000 ease-linear",
								progress > 0.3
									? "bg-gradient-to-r from-primary to-primary/70"
									: "bg-amber-500",
							)}
							style={{ width: `${progress * 100}%` }}
						/>
					</div>
					<div className="mt-2 text-[11px] text-text-muted">
						User code：
						<code className="ml-1 rounded bg-white px-1 py-0.5 font-mono dark:bg-zinc-800">
							{userCode}
						</code>
					</div>
				</div>
			</div>
		</div>
	);
}

function StepLine({
	index,
	children,
}: {
	index: number;
	children: React.ReactNode;
}) {
	return (
		<li className="flex items-start gap-2.5">
			<span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-200/70 text-[10px] font-semibold text-text-secondary dark:bg-zinc-800">
				{index}
			</span>
			<span>{children}</span>
		</li>
	);
}

function EndStateView({
	tone,
	title,
	description,
	action,
}: {
	tone: "amber" | "rose" | "emerald";
	title: string;
	description?: string;
	action?: React.ReactNode;
}) {
	const iconClass =
		tone === "emerald"
			? "text-emerald-600 bg-emerald-500/15"
			: tone === "rose"
				? "text-rose-600 bg-rose-500/15"
				: "text-amber-600 bg-amber-500/15";
	return (
		<div className="flex flex-col items-center gap-3 py-10 text-center">
			<div
				className={cn(
					"flex h-11 w-11 items-center justify-center rounded-full",
					iconClass,
				)}
			>
				<AlertTriangle className="h-5 w-5" strokeWidth={1.8} />
			</div>
			<div className="space-y-1">
				<div className="text-sm font-semibold text-text-primary">{title}</div>
				{description ? (
					<p className="max-w-sm text-xs leading-relaxed text-text-muted">
						{description}
					</p>
				) : null}
			</div>
			{action}
		</div>
	);
}

function SuccessView({
	appId,
	domain,
	openId,
	onDone,
}: {
	appId: string;
	domain: "feishu" | "lark";
	openId?: string;
	onDone: () => void;
}) {
	return (
		<div className="flex flex-col items-center gap-4 py-8 text-center">
			<div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
				<CheckCircle2 className="h-7 w-7" strokeWidth={1.8} />
			</div>
			<div className="space-y-1">
				<div className="text-base font-semibold text-text-primary">
					配置成功！
				</div>
				<p className="max-w-md text-xs leading-relaxed text-text-secondary">
					飞书应用已创建并已自动填入凭证。通道开关已打开，
					{openId ? "并已把你本人加入 DM 白名单。" : "记得开启通道。"}
				</p>
			</div>

			<div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-3 text-left text-xs dark:border-zinc-800 dark:bg-zinc-900">
				<div className="flex items-center justify-between">
					<span className="text-text-muted">App ID</span>
					<code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-zinc-800">
						{appId}
					</code>
				</div>
				<div className="mt-1.5 flex items-center justify-between">
					<span className="text-text-muted">域名</span>
					<code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-zinc-800">
						{domain}
					</code>
				</div>
				{openId ? (
					<div className="mt-1.5 flex items-center justify-between">
						<span className="text-text-muted">你的 open_id</span>
						<code className="truncate rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-zinc-800">
							{openId}
						</code>
					</div>
				) : null}
			</div>

			<Button size="md" variant="primary" onClick={onDone}>
				完成
			</Button>
		</div>
	);
}
