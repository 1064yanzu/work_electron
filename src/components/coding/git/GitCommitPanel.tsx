/**
 * Git 提交面板 - 显示已暂存文件摘要，提供 commit 消息输入和提交操作
 */
import {
	CheckCircle2,
	GitCommitHorizontal,
	Loader2,
	SendHorizonal,
	UploadCloud,
} from "lucide-react";
import { useCallback, useState } from "react";
import {
	gitCommit,
	gitPush,
} from "../../../lib/coding/gitWorkspaceData";
import type { GitSection } from "./gitPanelUtils";

interface GitCommitPanelProps {
	projectPath: string;
	stagedSection: GitSection | undefined;
}

export function GitCommitPanel({
	projectPath,
	stagedSection,
}: GitCommitPanelProps) {
	const [message, setMessage] = useState("");
	const [loading, setLoading] = useState<"commit" | "commitpush" | null>(null);
	const [feedback, setFeedback] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	const stagedCount = stagedSection?.entries.length ?? 0;
	const canCommit = message.trim().length > 0 && stagedCount > 0;

	const showFeedback = (type: "success" | "error", text: string) => {
		setFeedback({ type, text });
		setTimeout(() => setFeedback(null), 3000);
	};

	const handleCommit = useCallback(async () => {
		if (!canCommit || loading) return;
		setLoading("commit");
		try {
			const result = await gitCommit(projectPath, message.trim());
			if (result.success) {
				setMessage("");
				showFeedback("success", `提交成功 ${result.hash ? `(${result.hash})` : ""}`);
			} else {
				showFeedback("error", result.error ?? "提交失败");
			}
		} catch (err) {
			showFeedback("error", err instanceof Error ? err.message : "提交失败");
		} finally {
			setLoading(null);
		}
	}, [canCommit, loading, projectPath, message]);

	const handleCommitAndPush = useCallback(async () => {
		if (!canCommit || loading) return;
		setLoading("commitpush");
		try {
			const commitResult = await gitCommit(projectPath, message.trim());
			if (!commitResult.success) {
				showFeedback("error", commitResult.error ?? "提交失败");
				return;
			}
			const pushResult = await gitPush(projectPath);
			if (pushResult.success) {
				setMessage("");
				showFeedback("success", "提交并推送成功");
			} else {
				showFeedback("error", `提交成功，但推送失败: ${pushResult.error ?? ""}`);
			}
		} catch (err) {
			showFeedback("error", err instanceof Error ? err.message : "操作失败");
		} finally {
			setLoading(null);
		}
	}, [canCommit, loading, projectPath, message]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
				e.preventDefault();
				void handleCommit();
			}
		},
		[handleCommit],
	);

	return (
		<div className="border-t border-black/[0.05] px-3 pb-3 pt-3 dark:border-white/[0.05]">
			<div className="mb-2 flex items-center gap-2">
				<GitCommitHorizontal className="h-4 w-4 text-zinc-400" />
				<h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
					提交
				</h3>
				{stagedCount > 0 && (
					<span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
						{stagedCount} 个文件已暂存
					</span>
				)}
			</div>

			{/* 已暂存文件摘要 */}
			{stagedSection && stagedSection.entries.length > 0 && (
				<div className="mb-2 max-h-24 overflow-y-auto rounded-xl border border-black/[0.06] bg-white/60 px-2 py-1.5 scrollbar-thin dark:border-white/[0.06] dark:bg-white/[0.03]">
					{stagedSection.entries.slice(0, 10).map((entry) => (
						<div
							key={entry.key}
							className="flex items-center gap-1.5 py-0.5"
						>
							<CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
							<span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
								{entry.path}
							</span>
						</div>
					))}
					{stagedSection.entries.length > 10 && (
						<p className="pt-0.5 text-[10px] text-zinc-400">
							...及 {stagedSection.entries.length - 10} 个文件
						</p>
					)}
				</div>
			)}

			{/* 提交消息输入 */}
			<textarea
				value={message}
				onChange={(e) => setMessage(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder={
					stagedCount === 0 ? "请先暂存文件..." : "提交消息（⌘↵ 快速提交）"
				}
				disabled={stagedCount === 0}
				rows={3}
				className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] text-zinc-800 outline-none transition-colors focus:border-[#D96C46]/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
			/>

			{/* 操作按钮 */}
			<div className="mt-2 flex items-center gap-2">
				<button
					type="button"
					onClick={() => void handleCommit()}
					disabled={!canCommit || loading !== null}
					className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#D96C46] py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#c05a38] disabled:cursor-not-allowed disabled:opacity-40"
				>
					{loading === "commit" ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<SendHorizonal className="h-3.5 w-3.5" />
					)}
					提交
				</button>
				<button
					type="button"
					onClick={() => void handleCommitAndPush()}
					disabled={!canCommit || loading !== null}
					className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-1.5 text-[12px] font-medium text-zinc-600 transition-colors hover:border-[#D96C46]/30 hover:text-[#D96C46] disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
				>
					{loading === "commitpush" ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<UploadCloud className="h-3.5 w-3.5" />
					)}
					提交并推送
				</button>
			</div>

			{/* 反馈消息 */}
			{feedback && (
				<div
					className={`mt-2 rounded-lg px-3 py-1.5 text-[11px] ${
						feedback.type === "success"
							? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
							: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
					}`}
				>
					{feedback.text}
				</div>
			)}
		</div>
	);
}
