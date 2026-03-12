/**
 * 文件变更列表 Tab
 * 从 diffStore 读取变更文件列表 + Accept/Reject 操作
 */
import {
	Check,
	CheckCheck,
	FileCode,
	FileDiff,
	FileMinus,
	FilePlus,
	X,
	XCircle,
} from "lucide-react";
import { useCallback } from "react";
import {
	diffStore,
	useDiffStoreSelector,
	type FileDiff as FileDiffType,
} from "../../lib/stores/diffStore";
import {
	acceptAllDiffs,
	acceptDiff,
	rejectAllDiffs,
	rejectDiff,
} from "../../lib/coding/diffActions";

export function CodingChangesList() {
	const diffs = useDiffStoreSelector((s) => s.diffs);
	const diffList = Object.values(diffs).sort(
		(a, b) => b.timestamp - a.timestamp,
	);

	const stats = diffStore.getDiffStats();

	const handleAcceptAll = useCallback(() => {
		acceptAllDiffs();
	}, []);

	const handleRejectAll = useCallback(() => {
		rejectAllDiffs();
	}, []);

	if (diffList.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full px-4 py-12">
				<FileDiff className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mb-3" />
				<p className="text-xs text-zinc-400 text-center">
					暂无文件变更
				</p>
				<p className="text-[10px] text-zinc-400/60 text-center mt-1">
					AI 编辑文件后变更将显示在这里
				</p>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			{/* 统计 + 批量操作 */}
			<div className="px-3 py-2.5 border-b border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between">
				<span className="text-xs text-zinc-500">
					{stats.total} 个文件
					{stats.pending > 0 && (
						<span className="text-amber-500 ml-1">
							({stats.pending} 待处理)
						</span>
					)}
				</span>
				{stats.pending > 0 && (
					<div className="flex items-center gap-1">
						<button
							onClick={handleAcceptAll}
							className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
						>
							<CheckCheck className="w-3 h-3" />
							全部接受
						</button>
						<button
							onClick={handleRejectAll}
							className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors"
						>
							<XCircle className="w-3 h-3" />
							全部拒绝
						</button>
					</div>
				)}
			</div>

			{/* 文件列表 */}
			<div className="flex-1 overflow-y-auto scrollbar-thin py-1">
				{diffList.map((diff) => (
					<DiffFileItem key={diff.id} diff={diff} />
				))}
			</div>
		</div>
	);
}

function DiffFileItem({ diff }: { diff: FileDiffType }) {
	const filename = diff.filePath.split("/").pop() || diff.filePath;
	const dirPath = diff.filePath.split("/").slice(0, -1).join("/");

	const handleAccept = useCallback(() => {
		acceptDiff(diff.id);
	}, [diff.id]);

	const handleReject = useCallback(() => {
		rejectDiff(diff.id);
	}, [diff.id]);

	const handleViewDiff = useCallback(() => {
		diffStore.setActiveDiff(diff.id);
	}, [diff.id]);

	const StatusIcon =
		diff.toolName === "Write"
			? FilePlus
			: diff.toolName === "Edit"
				? FileCode
				: FileMinus;

	return (
		<div
			onClick={handleViewDiff}
			className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
				diff.status === "accepted"
					? "bg-emerald-500/5"
					: diff.status === "rejected"
						? "bg-red-500/5 opacity-60"
						: "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
			}`}
		>
			<StatusIcon
				className={`w-3.5 h-3.5 shrink-0 ${
					diff.toolName === "Write"
						? "text-emerald-500"
						: "text-amber-500"
				}`}
			/>

			<div className="flex-1 min-w-0">
				<div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
					{filename}
				</div>
				{dirPath && (
					<div className="text-[10px] text-zinc-400 truncate font-mono">
						{dirPath}
					</div>
				)}
			</div>

			{/* 状态 / 操作按钮 */}
			{diff.status === "pending" ? (
				<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleAccept();
						}}
						className="p-1 rounded hover:bg-emerald-500/20 text-emerald-500 transition-colors"
						title="接受"
					>
						<Check className="w-3 h-3" />
					</button>
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleReject();
						}}
						className="p-1 rounded hover:bg-red-500/20 text-red-500 transition-colors"
						title="拒绝"
					>
						<X className="w-3 h-3" />
					</button>
				</div>
			) : (
				<span
					className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
						diff.status === "accepted"
							? "bg-emerald-500/10 text-emerald-600"
							: "bg-red-500/10 text-red-500"
					}`}
				>
					{diff.status === "accepted" ? "已接受" : "已拒绝"}
				</span>
			)}
		</div>
	);
}
