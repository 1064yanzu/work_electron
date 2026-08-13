/**
 * BoardPanel —— 共享白板。
 *
 * 按工作目录作用域的跨 agent 长期工作记忆：目标、已定决策、踩过的坑、待办。
 * 任何入口（本应用 Agent、通过 MCP 接进来的 Claude Code / Codex）都能读写同一份，
 * 并落一份 `<cwd>/.aihub/BOARD.md`——没接 MCP 的 agent 只要能读文件也看得到。
 *
 * 这是从「一次性接力棒」升级到「共享黑板」的那一层：接力搬的是瞬时状态，
 * 白板沉淀的是不该反复重新发现的结论。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, FileText, Plus, Trash2 } from "lucide-react";
import {
	addBoardEntry,
	listBoardEntries,
	removeBoardEntry,
	updateBoardEntry,
	type HarnessBoardEntryRow,
} from "../../lib/api/harnessBridge";
import { cn } from "../../lib/utils";
import { toast } from "../ui/Toast";
import { BOARD_KIND_LABEL, formatStamp } from "./hubUtils";

const KIND_ORDER = ["goal", "decision", "pitfall", "next", "note"] as const;

export function BoardPanel({ cwd }: { cwd: string | null }) {
	const [entries, setEntries] = useState<HarnessBoardEntryRow[]>([]);
	const [filePath, setFilePath] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [draftKind, setDraftKind] =
		useState<(typeof KIND_ORDER)[number]>("decision");
	const [draft, setDraft] = useState("");

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			const result = await listBoardEntries({ cwd: cwd ?? undefined });
			setEntries(result.entries);
			setFilePath(result.file_path);
		} catch (error) {
			toast.error(
				`读取白板失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setLoading(false);
		}
	}, [cwd]);

	useEffect(() => {
		void reload();
	}, [reload]);

	const grouped = useMemo(() => {
		const map = new Map<string, HarnessBoardEntryRow[]>();
		for (const entry of entries) {
			const list = map.get(entry.kind) ?? [];
			list.push(entry);
			map.set(entry.kind, list);
		}
		return map;
	}, [entries]);

	const submit = async () => {
		const content = draft.trim();
		if (!content) return;
		try {
			await addBoardEntry({
				cwd: cwd ?? undefined,
				kind: draftKind,
				content,
				author: "user",
			});
			setDraft("");
			await reload();
		} catch (error) {
			toast.error(
				`写入失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	return (
		<div className="flex flex-col h-full min-h-0">
			{/* 作用域说明 + 落盘路径：让人知道这份白板归谁、存在哪 */}
			<div className="px-5 pt-4 pb-3 shrink-0 space-y-2.5">
				<div className="flex items-start gap-1.5 text-2xs text-text-light leading-relaxed">
					<FileText className="w-3 h-3 mt-px shrink-0" strokeWidth={1.5} />
					<span className="min-w-0">
						{cwd ? (
							<>
								作用域 <span className="text-text-muted">{cwd}</span>
								{filePath && (
									<>
										<br />
										同步到 <span className="text-text-muted">{filePath}</span>
										，任何 agent 直接读文件也能看到
									</>
								)}
							</>
						) : (
							"全局白板：不绑定任何工作目录，所有作用域都能读到（不落盘）"
						)}
					</span>
				</div>

				{/* 新增 */}
				<div className="flex items-center gap-1.5">
					<div className="flex items-center gap-0.5 shrink-0">
						{KIND_ORDER.map((kind) => (
							<button
								key={kind}
								type="button"
								onClick={() => setDraftKind(kind)}
								className={cn(
									"px-2 py-1 rounded-md text-2xs transition duration-150",
									draftKind === kind
										? "bg-terracotta/[0.12] text-terracotta font-medium"
										: "text-text-light hover:text-text-secondary hover:bg-warm-200/60 dark:hover:bg-cream-800/40",
								)}
							>
								{BOARD_KIND_LABEL[kind]}
							</button>
						))}
					</div>
				</div>
				<div className="flex items-center gap-1.5">
					<input
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.nativeEvent.isComposing) {
								event.preventDefault();
								void submit();
							}
						}}
						placeholder={`记一条${BOARD_KIND_LABEL[draftKind]}…一句话说清`}
						className="flex-1 px-3 py-2 text-xs bg-surface dark:bg-cream-900/40 border border-border rounded-lg text-text-secondary placeholder:text-text-light focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/8 transition duration-150"
					/>
					<button
						type="button"
						onClick={() => void submit()}
						disabled={!draft.trim()}
						className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover transition duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
						title="写入白板"
					>
						<Plus className="w-3.5 h-3.5" />
					</button>
				</div>
			</div>

			{/* 列表 */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-8 space-y-4">
				{loading && entries.length === 0 && (
					<p className="text-xs text-text-light py-8 text-center">
						正在读取白板…
					</p>
				)}

				{!loading && entries.length === 0 && (
					<div className="text-center py-14">
						<p className="text-xs text-text-secondary">白板还是空的</p>
						<p className="text-2xs text-text-light mt-1.5 leading-relaxed">
							定下方案记「决策」，踩坑并搞清原因记「踩坑」——
							<br />
							下一个接手的 agent 就不用重新发现一遍
						</p>
					</div>
				)}

				{KIND_ORDER.map((kind) => {
					const list = grouped.get(kind);
					if (!list?.length) return null;
					return (
						<section key={kind}>
							<h4 className="text-2xs font-medium tracking-wide text-text-light uppercase mb-1.5">
								{BOARD_KIND_LABEL[kind]}
							</h4>
							<ul className="space-y-px" aria-label={BOARD_KIND_LABEL[kind]}>
								{list.map((entry) => (
									<li
										key={entry.id}
										className="group flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-warm-200/40 dark:hover:bg-cream-800/30 transition duration-150"
									>
										{kind === "next" && (
											<button
												type="button"
												title={
													entry.state === "done" ? "标记为未完成" : "标记完成"
												}
												aria-label={
													entry.state === "done" ? "标记为未完成" : "标记完成"
												}
												aria-pressed={entry.state === "done"}
												onClick={() =>
													void updateBoardEntry({
														id: entry.id,
														state: entry.state === "done" ? "open" : "done",
													}).then(reload)
												}
												className={cn(
													"mt-0.5 w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition duration-150",
													entry.state === "done"
														? "bg-success/20 border-success/40 text-success"
														: "border-border hover:border-text-light",
												)}
											>
												{entry.state === "done" && (
													<Check className="w-2.5 h-2.5" />
												)}
											</button>
										)}
										<div className="min-w-0 flex-1">
											<p
												className={cn(
													"text-xs leading-relaxed text-text-secondary",
													entry.state === "done" &&
														"line-through text-text-light",
												)}
											>
												{entry.content}
											</p>
											<div className="flex items-center gap-1.5 text-2xs text-text-light mt-0.5">
												{entry.author && <span>{entry.author}</span>}
												<span>{formatStamp(entry.created_at)}</span>
												{entry.scope === "" && cwd && (
													<span className="px-1 rounded bg-warm-200/70 dark:bg-cream-800/50">
														全局
													</span>
												)}
											</div>
										</div>
										<button
											type="button"
											title="删除"
											onClick={() =>
												void removeBoardEntry(entry.id).then(reload)
											}
											className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-light hover:text-error hover:bg-error/8 transition duration-150 shrink-0"
										>
											<Trash2 className="w-3 h-3" />
										</button>
									</li>
								))}
							</ul>
						</section>
					);
				})}
			</div>
		</div>
	);
}
