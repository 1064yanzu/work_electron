/**
 * CouncilPanel —— 议会：同一个问题并发问多个入口，再合并成一份区分共识与分歧的结论。
 *
 * 展示上刻意把「裁决结论」与「各路原始回答」并列，而不是只给结论：
 * 议会的价值有一半在分歧本身，藏起原始回答等于把它折损掉了。
 * 失败的分支也照常列出并写明原因，不从名单里抹掉——「几路答了」直接影响结论可信度。
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Scale, XCircle } from "lucide-react";
import {
	runCouncil,
	type HarnessCouncilAnswerRow,
} from "../../lib/api/harnessBridge";
import { useIpcListen } from "../../hooks/useIpcListen";
import { cn } from "../../lib/utils";
import { toast } from "../ui/Toast";
import { formatDuration, type HubEntry } from "./hubUtils";

interface CouncilProgress {
	phase: "asking" | "answered" | "reducing" | "done";
	harness: string | null;
	finished: number;
	total: number;
}

export function CouncilPanel({
	entries,
	cwd,
}: {
	entries: HubEntry[];
	cwd: string | null;
}) {
	const selectable = entries.filter((e) => e.available && !e.blocked);

	const [question, setQuestion] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const [running, setRunning] = useState(false);
	const [progress, setProgress] = useState<CouncilProgress | null>(null);
	const [answers, setAnswers] = useState<HarnessCouncilAnswerRow[]>([]);
	const [verdict, setVerdict] = useState("");
	const [error, setError] = useState<string | null>(null);

	// 默认勾上前三个可用入口——一个都不选的空表单会让人不知从何下手，
	// 全选又会在用户还没理解成本时就并发拉起一堆调用
	useEffect(() => {
		if (selected.length > 0) return;
		setSelected(selectable.slice(0, 3).map((e) => e.id));
		// selectable 每次渲染都是新数组，依赖它会抖动；只在入口数量变化时重算
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectable.length]);

	useIpcListen<CouncilProgress>("harness-council-event", (payload) => {
		setProgress(payload);
	});

	const toggle = useCallback((id: string) => {
		setSelected((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);
	}, []);

	const start = async () => {
		const text = question.trim();
		if (!text) {
			toast.info("先写下要问的问题");
			return;
		}
		const members = selectable
			.filter((e) => selected.includes(e.id))
			.map((e) => ({ harness: e.id, kind: e.kind, label: e.label }));
		if (!members.length) {
			toast.info("至少选一个参与入口");
			return;
		}

		setRunning(true);
		setError(null);
		setAnswers([]);
		setVerdict("");
		setProgress({
			phase: "asking",
			harness: null,
			finished: 0,
			total: members.length,
		});

		try {
			const result = await runCouncil({
				question: text,
				members,
				cwd: cwd ?? undefined,
			});
			setAnswers(result.answers);
			setVerdict(result.verdict);
			if (result.status !== "done") {
				setError(result.error ?? "议会未能得出结论");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setRunning(false);
			setProgress(null);
		}
	};

	const succeededCount = answers.filter((a) => a.status === "succeeded").length;

	return (
		<div className="flex flex-col h-full min-h-0">
			{/* 提问区 */}
			<div className="px-5 pt-4 pb-3 shrink-0 space-y-2.5">
				<textarea
					value={question}
					onChange={(event) => setQuestion(event.target.value)}
					placeholder="要同时问几家的问题…（架构选型、根因判断这类一家之言不够的场景）"
					rows={3}
					className="w-full px-3 py-2.5 text-[12px] leading-relaxed bg-surface dark:bg-cream-900/40 border border-border rounded-xl text-text-secondary placeholder:text-text-light focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/8 transition duration-200 resize-none"
				/>

				<div className="flex flex-wrap items-center gap-1.5">
					{selectable.map((entry) => {
						const on = selected.includes(entry.id);
						return (
							<button
								key={entry.id}
								type="button"
								onClick={() => toggle(entry.id)}
								className={cn(
									"px-2.5 py-1 rounded-lg text-[11px] font-medium transition duration-200 border",
									on
										? "border-terracotta/40 bg-terracotta/[0.1] text-text-primary"
										: "border-border/70 text-text-muted hover:text-text-secondary hover:bg-warm-200/50 dark:hover:bg-cream-800/30",
								)}
							>
								{entry.label}
							</button>
						);
					})}
					{selectable.length === 0 && (
						<span className="text-[11px] text-text-light">
							没有可用入口：CLI 未安装、站点未启用，或都处于限额中
						</span>
					)}
				</div>

				<div className="flex items-center justify-between gap-2">
					<span className="text-[10.5px] text-text-light">
						每一路都是真实调用，会花时间也可能花钱
					</span>
					<button
						type="button"
						onClick={() => void start()}
						disabled={running || selectable.length === 0}
						className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11.5px] font-medium hover:bg-primary-hover transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
					>
						{running ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<Scale className="w-3 h-3" />
						)}
						{running ? "进行中…" : `开议（${selected.length} 路）`}
					</button>
				</div>

				{progress && (
					<div className="space-y-1">
						<div className="flex items-center justify-between text-[10.5px] text-text-muted">
							<span>
								{progress.phase === "reducing"
									? "正在裁决合并…"
									: `已回答 ${progress.finished}/${progress.total}`}
							</span>
						</div>
						<div className="h-0.5 rounded-full bg-warm-200 overflow-hidden">
							<div
								className="h-full rounded-full bg-terracotta transition-[width] duration-300"
								style={{
									width:
										progress.phase === "reducing"
											? "92%"
											: `${progress.total ? (progress.finished / progress.total) * 88 : 8}%`,
								}}
							/>
						</div>
					</div>
				)}
			</div>

			{/* 结果区 */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-8 space-y-4">
				{error && (
					<div className="px-3 py-2 rounded-lg bg-error/8 dark:bg-error/15 border border-error/20 text-[11px] text-error leading-relaxed">
						{error}
					</div>
				)}

				{verdict && (
					<section>
						<div className="flex items-center gap-1.5 mb-1.5">
							<Scale
								className="w-3.5 h-3.5 text-terracotta"
								strokeWidth={1.8}
							/>
							<h4 className="text-[12px] font-medium text-text-primary">
								裁决结论
							</h4>
							<span className="text-[10px] text-text-light tabular-nums">
								{succeededCount}/{answers.length} 路作答
							</span>
						</div>
						<div className="px-3.5 py-3 rounded-xl bg-terracotta/[0.05] border border-terracotta/20 text-[11.5px] leading-relaxed text-text-secondary whitespace-pre-wrap">
							{verdict}
						</div>
					</section>
				)}

				{answers.length > 0 && (
					<section className="space-y-2">
						<h4 className="text-[10px] font-medium tracking-wide text-text-light uppercase">
							各路原始回答
						</h4>
						{answers.map((answer) => (
							<details
								key={answer.id}
								className="group rounded-xl border border-border/70 overflow-hidden"
							>
								<summary className="flex items-center gap-1.5 px-3 py-2 cursor-pointer list-none hover:bg-warm-200/40 dark:hover:bg-cream-800/30 transition duration-200">
									{answer.status === "succeeded" ? (
										<CheckCircle2
											className="w-3.5 h-3.5 text-success shrink-0"
											strokeWidth={1.8}
										/>
									) : (
										<XCircle
											className="w-3.5 h-3.5 text-error shrink-0"
											strokeWidth={1.8}
										/>
									)}
									<span className="text-[11.5px] font-medium text-text-primary">
										{answer.label}
									</span>
									<span className="text-[10px] text-text-light tabular-nums ml-auto shrink-0">
										{formatDuration(answer.duration_ms)}
									</span>
								</summary>
								<div className="px-3 pb-3 pt-1 text-[11.5px] leading-relaxed text-text-secondary whitespace-pre-wrap border-t border-border/50">
									{answer.status === "succeeded"
										? answer.answer
										: `未作答：${answer.error ?? "无返回内容"}`}
								</div>
							</details>
						))}
					</section>
				)}

				{!running && !answers.length && !error && (
					<div className="text-center py-14">
						<p className="text-[11.5px] text-text-secondary">还没有开过议会</p>
						<p className="text-[10.5px] text-text-light mt-1.5 leading-relaxed">
							同一个问题问多家，结论会明确标出哪里有共识、哪里有分歧
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
