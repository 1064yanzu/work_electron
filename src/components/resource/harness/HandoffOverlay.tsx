/**
 * HANDOFF 覆盖层 —— 蒸馏进度 → 交接包预览（可编辑）→ 确认迁移。
 *
 * 预览用可编辑 textarea：蒸馏结果是 LLM 产出，用户改一两句再发车是常态，
 * 编辑后的内容会先 harness_handoff_update 落库再启动。
 */
import { AlertCircle, Check, Copy, Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { HandoffFlow } from "./types";
import { describeHandoffPhase, sessionTitle } from "./utils";

export function HandoffOverlay({
	flow,
	onChangeMarkdown,
	onCancel,
	onConfirm,
}: {
	flow: HandoffFlow;
	onChangeMarkdown: (markdown: string) => void;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const busy = flow.stage === "launching";
	const confirmLabel =
		flow.target.kind === "cli"
			? "确认并启动"
			: flow.target.kind === "web"
				? "确认并发送"
				: "确认并复制";

	return (
		<div className="absolute inset-0 z-40 flex flex-col bg-background/97 backdrop-blur-md animate-fade-in">
			<div className="px-4 pt-5 pb-3 shrink-0 border-b border-border">
				<div className="text-[9.5px] font-semibold tracking-[0.22em] text-text-light uppercase">
					Handoff
				</div>
				<h3 className="font-serif text-[16px] leading-tight text-text-primary mt-1.5">
					交接到 {flow.target.label}
				</h3>
				<p className="text-[10.5px] text-text-light mt-1 truncate">
					来自「{sessionTitle(flow.session)}」
				</p>
			</div>

			{flow.stage === "distilling" ? (
				<div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
					<Loader2 className="w-5 h-5 text-terracotta animate-spin" />
					<p className="text-[12px] text-text-secondary text-center">
						{describeHandoffPhase(flow.progress)}
					</p>
					{flow.progress?.phase === "mapping" && flow.progress.total > 0 && (
						<div className="w-full max-w-[200px] h-0.5 rounded-full bg-warm-200 overflow-hidden">
							<div
								className="h-full rounded-full bg-terracotta transition-[width] duration-300"
								style={{
									width: `${Math.min(
										100,
										Math.round(
											(flow.progress.current / flow.progress.total) * 100,
										),
									)}%`,
								}}
							/>
						</div>
					)}
					<p className="text-[10.5px] text-text-light text-center leading-relaxed">
						正在把长会话压缩成目标可直接接手的交接包
					</p>
					<button
						type="button"
						onClick={onCancel}
						className="mt-1 text-[11px] text-text-muted hover:text-text-secondary transition duration-200"
					>
						取消
					</button>
				</div>
			) : (
				<>
					<div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 space-y-3">
						{flow.error && (
							<div className="px-3 py-2 rounded-lg bg-error/8 dark:bg-error/15 border border-error/20 text-[11.5px] text-error flex items-start gap-2">
								<AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
								<span className="leading-relaxed">{flow.error}</span>
							</div>
						)}

						{flow.pkg && (
							<div className="rounded-xl bg-surface dark:bg-cream-900/40 border border-border px-3 py-2.5">
								<p className="text-[11.5px] text-text-primary leading-relaxed">
									{flow.pkg.goal || "（未提炼出目标）"}
								</p>
								<div className="flex flex-wrap items-center gap-1.5 mt-2">
									<StatPill label="已完成" value={flow.pkg.done.length} />
									<StatPill
										label="进行中"
										value={flow.pkg.in_progress.length}
									/>
									<StatPill label="决策" value={flow.pkg.decisions.length} />
									<StatPill label="文件" value={flow.pkg.files.length} />
									<StatPill label="下一步" value={flow.pkg.next_steps.length} />
								</div>
							</div>
						)}

						{flow.handoffId && (
							<div>
								<div className="flex items-center justify-between gap-2 mb-1.5">
									<span className="text-[9.5px] font-semibold tracking-[0.18em] text-text-light uppercase">
										交接包预览（可编辑）
									</span>
									<span className="text-[10px] text-text-light tabular-nums">
										{flow.markdown.length} 字符
									</span>
								</div>
								<textarea
									value={flow.markdown}
									onChange={(event) => onChangeMarkdown(event.target.value)}
									spellCheck={false}
									className="w-full h-[280px] resize-none px-3 py-2.5 text-[11.5px] leading-relaxed font-mono bg-surface dark:bg-cream-900/40 border border-border rounded-xl text-text-secondary placeholder:text-text-light focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/8 transition duration-200"
								/>
							</div>
						)}
					</div>

					<div className="shrink-0 border-t border-border px-4 py-3">
						<p className="text-[10px] text-text-light mb-2 leading-relaxed">
							{flow.target.kind === "cli"
								? "将写入工作目录的 HANDOFF.md，并在内置终端启动该 CLI 自动接手。"
								: flow.target.kind === "web"
									? "将切到中栏 AI Hub，并把交接包填入该站点的输入框。"
									: "将复制到剪贴板，粘贴到右侧 Copilot 即可接力。"}
						</p>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={onConfirm}
								disabled={busy || !flow.handoffId}
								className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[11.5px] font-medium hover:bg-primary-hover transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{busy ? (
									<Loader2 className="w-3 h-3 animate-spin" />
								) : flow.target.kind === "app" ? (
									<Copy className="w-3 h-3" />
								) : (
									<Check className="w-3 h-3" />
								)}
								{busy ? "处理中…" : confirmLabel}
							</button>
							<button
								type="button"
								onClick={onCancel}
								disabled={busy}
								className="px-3 py-2 rounded-lg bg-warm-200 text-text-secondary text-[11.5px] font-medium hover:bg-warm-300 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
							>
								取消
							</button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}

function StatPill({ label, value }: { label: string; value: number }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px]",
				value > 0
					? "bg-terracotta/[0.12] text-terracotta"
					: "bg-warm-200 text-text-light",
			)}
		>
			{label}
			<span className="tabular-nums font-medium">{value}</span>
		</span>
	);
}

// ============================================================
