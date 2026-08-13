/**
 * HandoffDrawer —— 接力抽屉。
 *
 * 从「拖会话到入口」触发，右侧滑出。三段式：
 *   预演（这次会走哪一档、为什么） → 生成/预览（可编辑） → 投递
 *
 * 设计上最要紧的一点：**如实标注这次接力是不是无损的**。
 * 原生续接与原文接力都不丢信息，蒸馏接力会丢。一期把三者都叫「交接包」，
 * 用户没法判断该不该相信里面的内容。这里用一枚显式徽章 + 一句原因把它讲清楚。
 */
import { useEffect, useState } from "react";
import {
	AlertTriangle,
	ArrowRight,
	Check,
	Loader2,
	ShieldCheck,
	X,
} from "lucide-react";
import {
	createHandoff,
	launchHandoff,
	launchNativeResume,
	planHandoff,
	sendSessionToWeb,
	updateHandoff,
	type HarnessHandoffPlan,
	type HarnessSessionRow,
} from "../../lib/api";
import { cn } from "../../lib/utils";
import { aiHubRequestStore } from "../../lib/stores/aiHubRequestStore";
import { centerTabsStore } from "../../lib/stores/centerTabsStore";
import { toast } from "../ui/Toast";
import { MODE_META, sessionTitle, type HubEntry } from "./hubUtils";

type Stage = "planning" | "plan" | "building" | "preview" | "launching";

export function HandoffDrawer({
	session,
	target,
	onClose,
	onDone,
}: {
	session: HarnessSessionRow;
	target: HubEntry;
	onClose: () => void;
	onDone: () => void;
}) {
	const [stage, setStage] = useState<Stage>("planning");
	const [plan, setPlan] = useState<HarnessHandoffPlan | null>(null);
	const [handoffId, setHandoffId] = useState<string | null>(null);
	const [markdown, setMarkdown] = useState("");
	const [error, setError] = useState<string | null>(null);

	// 打开即预演：让用户在花任何成本之前就知道这次会怎么搬
	useEffect(() => {
		let cancelled = false;
		setStage("planning");
		setError(null);
		void planHandoff({
			session_id: session.id,
			target_harness: target.harness,
		})
			.then((result) => {
				if (cancelled) return;
				setPlan(result);
				setStage("plan");
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
				setStage("plan");
			});
		return () => {
			cancelled = true;
		};
	}, [session.id, target.harness]);

	const modeMeta = plan ? MODE_META[plan.mode] : null;

	/** 原生续接：不生成交接包，直接起 pty。 */
	const runNativeResume = async () => {
		setStage("launching");
		setError(null);
		try {
			const result = await launchNativeResume({
				session_id: session.id,
				cwd: session.cwd ?? undefined,
			});
			toast.success(`已在终端续接：${result.command}`);
			onDone();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setStage("plan");
		}
	};

	/** 生成交接包（raw 零成本 / distill 会调 LLM）。 */
	const buildPackage = async () => {
		setStage("building");
		setError(null);
		try {
			const result = await createHandoff({
				session_id: session.id,
				target_harness: target.harness,
			});
			setHandoffId(result.handoff_id);
			setMarkdown(result.package.markdown);
			setPlan((prev) =>
				prev
					? { ...prev, mode: result.mode, reason: result.reason }
					: {
							mode: result.mode,
							reason: result.reason,
							resume_command: result.resume_command,
							transcript_chars: 0,
							native_available: false,
						},
			);
			setStage("preview");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setStage("plan");
		}
	};

	/** 投递到目标入口。 */
	const deliver = async () => {
		if (!handoffId) return;
		setStage("launching");
		setError(null);
		try {
			await updateHandoff(handoffId, markdown);

			if (target.kind === "cli") {
				const launched = await launchHandoff({
					handoff_id: handoffId,
					cwd: session.cwd ?? undefined,
				});
				toast.success(
					launched.handoff_path
						? `已在终端启动 ${target.label}，交接包写入 HANDOFF.md`
						: `已在终端启动 ${target.label}`,
				);
			} else if (target.kind === "web") {
				// 先把站点标签页开出来：接力是用户主动发起的动作，结果必须看得见。
				// 只调 sendSessionToWeb 的话内容会送进一个后台视图，用户面前什么也
				// 没发生，只能靠 toast 相信它成功了。
				const opened = await centerTabsStore.openWebSite(target.id);
				if (!opened) {
					await navigator.clipboard.writeText(markdown);
					toast.error(
						`${target.label} 未启用，交接包已复制到剪贴板（可在设置中启用该站点）`,
					);
					onDone();
					return;
				}

				// Web 端走附件通道：长上下文塞不进输入框
				const sent = await sendSessionToWeb({
					site_id: target.id,
					session_id: session.id,
				});
				if (sent.method === "attachment") {
					toast.success(`已把完整上下文作为附件送进 ${target.label}`);
				} else if (sent.method === "inline") {
					toast.info(
						`${target.label} 不支持附件，已把全文填进输入框（内容较长时可能被截断）`,
					);
				} else {
					// 附件与正文都没进去：交给站点面板在原生视图真正就绪后重试注入
					//（这里无从知道那个时机，只有面板自己知道）
					aiHubRequestStore.request(target.id, markdown);
					toast.info(sent.error ?? `正在等待 ${target.label} 就绪后填入交接包`);
				}
			} else {
				await navigator.clipboard.writeText(markdown);
				toast.success("交接包已复制，粘贴到右侧 Copilot 即可接力");
			}
			onDone();
		} catch (err) {
			// 投递失败不能让用户丢内容
			try {
				await navigator.clipboard.writeText(markdown);
			} catch {
				// 剪贴板不可用则静默
			}
			setError(
				`${err instanceof Error ? err.message : String(err)}（交接包已复制到剪贴板）`,
			);
			setStage("preview");
		}
	};

	return (
		<div className="absolute inset-y-0 right-0 w-[420px] max-w-full bg-surface dark:bg-cream-950 border-l border-border shadow-2xl flex flex-col animate-slide-in-right z-20">
			{/* 头 */}
			<div className="px-5 pt-5 pb-3 border-b border-border/60 shrink-0">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<div className="text-2xs font-semibold tracking-[0.22em] text-text-light uppercase">
							Handoff
						</div>
						<h3 className="font-serif text-[17px] text-text-primary mt-1 leading-tight">
							接力到 {target.label}
						</h3>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 -mr-1 rounded-lg text-text-light hover:text-text-secondary hover:bg-warm-200/70 dark:hover:bg-cream-800/40 transition duration-150"
						title="关闭"
						aria-label="关闭接力抽屉"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				</div>

				<div className="flex items-center gap-1.5 text-xs text-text-muted mt-2 min-w-0">
					<span className="truncate">{sessionTitle(session)}</span>
					<ArrowRight className="w-3 h-3 shrink-0 text-text-light" />
					<span className="shrink-0">{target.label}</span>
				</div>
			</div>

			{/* 体 */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 space-y-4">
				{stage === "planning" && (
					<div className="flex items-center gap-2 text-xs text-text-light py-8 justify-center">
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						正在判断最优接力方式…
					</div>
				)}

				{plan && modeMeta && stage !== "planning" && (
					<div
						className={cn(
							"rounded-xl border px-3.5 py-3",
							modeMeta.lossless
								? "border-success/25 bg-success/[0.06]"
								: "border-warning/30 bg-warning/[0.07]",
						)}
					>
						<div className="flex items-center gap-1.5">
							{modeMeta.lossless ? (
								<ShieldCheck
									className="w-3.5 h-3.5 text-success"
									strokeWidth={1.8}
								/>
							) : (
								<AlertTriangle
									className="w-3.5 h-3.5 text-warning"
									strokeWidth={1.8}
								/>
							)}
							<span className="text-xs font-medium text-text-primary">
								{modeMeta.label}
							</span>
							<span
								className={cn(
									"text-2xs px-1.5 py-px rounded",
									modeMeta.lossless
										? "bg-success/15 text-success"
										: "bg-warning/15 text-warning",
								)}
							>
								{modeMeta.lossless ? "无损" : "有损"}
							</span>
						</div>
						<p className="text-xs text-text-muted mt-1.5 leading-relaxed">
							{plan.reason}
						</p>
						{plan.resume_command && (
							<pre className="mt-2 px-2.5 py-1.5 rounded-lg bg-cream-100 dark:bg-cream-900/60 text-2xs font-mono text-text-secondary overflow-x-auto">
								{plan.resume_command}
							</pre>
						)}
						{plan.transcript_chars > 0 && (
							<p className="text-2xs text-text-light mt-1.5 tabular-nums">
								转录 {plan.transcript_chars.toLocaleString("en-US")} 字符
							</p>
						)}
					</div>
				)}

				{stage === "building" && (
					<div className="flex items-center gap-2 text-xs text-text-light py-8 justify-center">
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						{plan?.mode === "distill"
							? "正在蒸馏交接包（调用 LLM，可能要一会儿）…"
							: "正在组装交接包…"}
					</div>
				)}

				{stage === "preview" || stage === "launching" ? (
					<div>
						<div className="flex items-center justify-between mb-1.5">
							<span className="text-2xs font-medium tracking-wide text-text-light uppercase">
								交接内容（可编辑）
							</span>
							<span className="text-2xs text-text-light tabular-nums">
								{markdown.length.toLocaleString("en-US")} 字符
							</span>
						</div>
						<textarea
							value={markdown}
							onChange={(event) => setMarkdown(event.target.value)}
							spellCheck={false}
							className="w-full h-[320px] px-3 py-2.5 text-xs leading-relaxed font-mono bg-cream-50 dark:bg-cream-900/40 border border-border rounded-xl text-text-secondary focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/8 transition duration-150 resize-none"
						/>
					</div>
				) : null}

				{error && (
					<div className="px-3 py-2 rounded-lg bg-error/8 dark:bg-error/15 border border-error/20 text-xs text-error leading-relaxed">
						{error}
					</div>
				)}
			</div>

			{/* 底 */}
			<div className="px-5 py-3.5 border-t border-border/60 shrink-0 flex items-center justify-end gap-2">
				<button
					type="button"
					onClick={onClose}
					className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-secondary hover:bg-warm-200/70 dark:hover:bg-cream-800/40 transition duration-150"
				>
					取消
				</button>

				{stage === "plan" && plan?.mode === "native" && (
					<PrimaryButton onClick={() => void runNativeResume()}>
						在终端续接
					</PrimaryButton>
				)}
				{stage === "plan" && plan && plan.mode !== "native" && (
					<PrimaryButton onClick={() => void buildPackage()}>
						{plan.mode === "distill" ? "生成交接包" : "组装交接包"}
					</PrimaryButton>
				)}
				{stage === "preview" && (
					<PrimaryButton onClick={() => void deliver()}>
						<Check className="w-3 h-3" />
						送到 {target.label}
					</PrimaryButton>
				)}
				{(stage === "planning" ||
					stage === "building" ||
					stage === "launching") && (
					<PrimaryButton disabled onClick={() => {}}>
						<Loader2 className="w-3 h-3 animate-spin" />
						处理中
					</PrimaryButton>
				)}
			</div>
		</div>
	);
}

function PrimaryButton({
	children,
	onClick,
	disabled,
}: {
	children: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-hover transition duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
		>
			{children}
		</button>
	);
}
