import {
	ArrowDown,
	ArrowUp,
	GitBranch,
	Loader2,
	RefreshCcw,
	ShieldAlert,
	CloudDownload,
	CloudUpload,
	PackageOpen,
	Check,
	ChevronDown,
} from "lucide-react";
import { useState, useCallback } from "react";
import { cn } from "../../../lib/utils";
import type {
	GitBranchInfo,
	GitStatusInfo,
} from "../../../lib/stores/codingWorkspaceStore";
import type { GitSummaryStats } from "./gitPanelUtils";
import { getVisibleBranches } from "./gitPanelUtils";
import {
	gitPull,
	gitPush,
	gitCheckoutBranch,
	gitStashAction,
} from "../../../lib/coding/gitWorkspaceData";

interface GitOverviewHeaderProps {
	status: GitStatusInfo;
	branches: GitBranchInfo[];
	summary: GitSummaryStats;
	refreshing: boolean;
	onRefresh: () => void;
	projectPath: string;
}

const METRIC_CARDS: Array<{
	key: keyof Pick<
		GitSummaryStats,
		"totalChangedFiles" | "stagedCount" | "unstagedCount" | "untrackedCount"
	>;
	label: string;
	tone: string;
}> = [
	{
		key: "totalChangedFiles",
		label: "总变更",
		tone: "text-zinc-700 dark:text-zinc-200",
	},
	{
		key: "stagedCount",
		label: "已暂存",
		tone: "text-emerald-600 dark:text-emerald-400",
	},
	{
		key: "unstagedCount",
		label: "未暂存",
		tone: "text-amber-600 dark:text-amber-400",
	},
	{
		key: "untrackedCount",
		label: "未跟踪",
		tone: "text-zinc-600 dark:text-zinc-300",
	},
];

export function GitOverviewHeader({
	status,
	branches,
	summary,
	refreshing,
	onRefresh,
	projectPath,
}: GitOverviewHeaderProps) {
	const visibleBranches = getVisibleBranches(branches);
	const [syncLoading, setSyncLoading] = useState<
		"pull" | "push" | "stash" | null
	>(null);
	const [syncError, setSyncError] = useState<string | null>(null);
	const [branchMenuOpen, setBranchMenuOpen] = useState(false);
	const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

	const handlePull = useCallback(async () => {
		setSyncLoading("pull");
		setSyncError(null);
		try {
			const result = await gitPull(projectPath);
			if (!result.success) setSyncError(result.error ?? "拉取失败");
		} finally {
			setSyncLoading(null);
		}
	}, [projectPath]);

	const handlePush = useCallback(async () => {
		setSyncLoading("push");
		setSyncError(null);
		try {
			const result = await gitPush(projectPath);
			if (!result.success) setSyncError(result.error ?? "推送失败");
		} finally {
			setSyncLoading(null);
		}
	}, [projectPath]);

	const handleStash = useCallback(async () => {
		setSyncLoading("stash");
		setSyncError(null);
		try {
			const result = await gitStashAction(projectPath, "push");
			if (!result.success) setSyncError(result.error ?? "暂藏失败");
		} finally {
			setSyncLoading(null);
		}
	}, [projectPath]);

	const handleCheckout = useCallback(
		async (branchName: string) => {
			setCheckoutLoading(branchName);
			setBranchMenuOpen(false);
			try {
				const result = await gitCheckoutBranch(projectPath, branchName);
				if (!result.success) setSyncError(result.error ?? "切换分支失败");
			} finally {
				setCheckoutLoading(null);
			}
		},
		[projectPath],
	);

	const otherBranches = visibleBranches.filter((b) => !b.current);

	return (
		<div className="border-b border-black/[0.05] px-3 py-3 dark:border-white/[0.05]">
			<div className="rounded-2xl border border-black/[0.06] bg-white/80 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-white/[0.06] dark:bg-white/[0.03]">
				{/* 顶部行：分支信息 + 状态 + 操作 */}
				<div className="flex items-start gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#D96C46]/10 text-[#D96C46]">
						<GitBranch className="h-4 w-4" />
					</div>

					<div className="min-w-0 flex-1">
						{/* 分支名 + 状态徽章 */}
						<div className="flex flex-wrap items-center gap-2">
							{/* 分支选择器 */}
							<div className="relative">
								<button
									type="button"
									onClick={() => setBranchMenuOpen((v) => !v)}
									className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800/50"
								>
									{status.branch}
									{otherBranches.length > 0 && (
										<ChevronDown
											className={cn(
												"h-3.5 w-3.5 text-zinc-400 transition-transform",
												branchMenuOpen && "rotate-180",
											)}
										/>
									)}
								</button>

								{/* 分支下拉列表 */}
								{branchMenuOpen && otherBranches.length > 0 && (
									<div className="absolute left-0 top-full z-10 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
										<div className="max-h-48 overflow-y-auto">
											{/* 当前分支 */}
											<div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
												<Check className="h-3 w-3 text-[#D96C46]" />
												<span className="text-[12px] font-medium text-[#D96C46]">
													{status.branch}
												</span>
											</div>
											{/* 其他分支 */}
											{otherBranches.map((branch) => (
												<button
													key={branch.name}
													type="button"
													onClick={() => void handleCheckout(branch.name)}
													disabled={checkoutLoading === branch.name}
													className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-zinc-600 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
												>
													{checkoutLoading === branch.name ? (
														<Loader2 className="h-3 w-3 animate-spin" />
													) : (
														<GitBranch className="h-3 w-3 text-zinc-400" />
													)}
													{branch.name}
												</button>
											))}
										</div>
									</div>
								)}
							</div>

							<span
								className={cn(
									"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
									summary.isClean
										? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
										: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
								)}
							>
								{summary.isClean ? "工作区干净" : "有未提交改动"}
							</span>
							{summary.conflictedCount > 0 && (
								<span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-300">
									<ShieldAlert className="h-3 w-3" />
									{summary.conflictedCount} 个冲突
								</span>
							)}
						</div>

						{/* 同步状态 */}
						<div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
							<span>{summary.syncLabel}</span>
							{status.ahead > 0 && (
								<span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
									<ArrowUp className="h-3 w-3" />
									{status.ahead}
								</span>
							)}
							{status.behind > 0 && (
								<span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
									<ArrowDown className="h-3 w-3" />
									{status.behind}
								</span>
							)}
						</div>
					</div>

					{/* 刷新按钮 */}
					<button
						type="button"
						onClick={onRefresh}
						className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-black/[0.06] bg-white text-zinc-500 transition hover:border-[#D96C46]/30 hover:text-[#D96C46] dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-300"
						title="刷新 Git 状态"
					>
						{refreshing ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<RefreshCcw className="h-3.5 w-3.5" />
						)}
					</button>
				</div>

				{/* 同步操作按钮行 */}
				<div className="mt-3 flex items-center gap-2">
					<button
						type="button"
						onClick={() => void handlePull()}
						disabled={syncLoading !== null}
						className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-1.5 text-[11px] font-medium text-zinc-600 transition-colors hover:border-[#D96C46]/30 hover:text-[#D96C46] disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300"
					>
						{syncLoading === "pull" ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<CloudDownload className="h-3.5 w-3.5" />
						)}
						拉取
					</button>
					<button
						type="button"
						onClick={() => void handlePush()}
						disabled={syncLoading !== null}
						className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-1.5 text-[11px] font-medium text-zinc-600 transition-colors hover:border-[#D96C46]/30 hover:text-[#D96C46] disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300"
					>
						{syncLoading === "push" ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<CloudUpload className="h-3.5 w-3.5" />
						)}
						推送
					</button>
					<button
						type="button"
						onClick={() => void handleStash()}
						disabled={syncLoading !== null || summary.isClean}
						className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-600 transition-colors hover:border-[#D96C46]/30 hover:text-[#D96C46] disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300"
						title="临时暂藏当前改动"
					>
						{syncLoading === "stash" ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<PackageOpen className="h-3.5 w-3.5" />
						)}
						暂藏
					</button>
				</div>

				{/* 错误提示 */}
				{syncError && (
					<div className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] text-red-600 dark:bg-red-900/20 dark:text-red-400">
						{syncError}
					</div>
				)}

				{/* 统计卡片 */}
				<div className="mt-3 grid grid-cols-2 gap-2">
					{METRIC_CARDS.map((card) => (
						<div
							key={card.key}
							className="rounded-xl border border-black/[0.05] bg-zinc-50/80 px-3 py-2 dark:border-white/[0.05] dark:bg-white/[0.03]"
						>
							<div className="text-[10px] text-zinc-500 dark:text-zinc-400">
								{card.label}
							</div>
							<div className={cn("mt-1 text-base font-semibold", card.tone)}>
								{summary[card.key]}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* 点击空白处关闭分支菜单 */}
			{branchMenuOpen && (
				<div
					className="fixed inset-0 z-[9]"
					onClick={() => setBranchMenuOpen(false)}
				/>
			)}
		</div>
	);
}
