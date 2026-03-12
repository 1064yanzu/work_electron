import { FilePlus2, Layers3, Link2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { pickAndAttachContextFiles } from "../../lib/coding/contextFiles";
import { useCodingSessionSelector } from "../../lib/stores/codingSessionStore";
import { useCodingRuntimeSelector } from "../../lib/stores/codingRuntimeStore";
import {
	codingWorkspaceStore,
	useCodingWorkspaceSelector,
} from "../../lib/stores/codingWorkspaceStore";
import { useCodingThreadSelector } from "../../lib/stores/codingThreadStore";
import { toast } from "../ui/Toast";

export function CodingContextPanel() {
	const projectPath = useCodingWorkspaceSelector((state) => state.projectPath);
	const contextFiles = useCodingWorkspaceSelector((state) => state.contextFiles);
	const workspaceMemory = useCodingRuntimeSelector((state) => state.workspaceMemory);
	const activeThread = useCodingThreadSelector((state) =>
		state.activeThreadId
			? state.threads.find((thread) => thread.id === state.activeThreadId) ?? null
			: null,
	);
	const usage = useCodingSessionSelector((state) => state.usage);
	const [isPicking, setIsPicking] = useState(false);

	const sourceGroups = useMemo(() => {
		const sources = workspaceMemory?.sources ?? [];
		return sources.reduce(
			(groups, source) => {
				groups[source.kind] = (groups[source.kind] ?? 0) + 1;
				return groups;
			},
			{} as Record<string, number>,
		);
	}, [workspaceMemory]);

	const handleAddFiles = async () => {
		if (!projectPath) return;
		setIsPicking(true);
		try {
			const result = await pickAndAttachContextFiles(projectPath);
			if (result.added > 0) {
				toast.success(`已加入 ${result.added} 个上下文文件`);
			} else if (result.skipped > 0) {
				toast.info("所选文件已在当前线程上下文中");
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setIsPicking(false);
		}
	};

	return (
		<div className="flex h-full flex-col bg-[#FAFAFA] dark:bg-[#111111]">
			<div className="border-b border-black/[0.04] px-3 py-3 dark:border-white/[0.04]">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">当前上下文</div>
						<div className="mt-1 text-[11px] text-zinc-400">
							{activeThread?.model ?? "未激活线程"}
						</div>
					</div>
					<button
						type="button"
						onClick={() => void handleAddFiles()}
						disabled={!projectPath || isPicking}
						className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
					>
						<FilePlus2 className="h-3.5 w-3.5" />
						添加文件
					</button>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2 border-b border-black/[0.04] px-3 py-3 dark:border-white/[0.04]">
				<MetricCard label="上下文文件" value={String(contextFiles.length)} />
				<MetricCard
					label="Tokens"
					value={formatTokenCount(usage.inputTokens + usage.outputTokens)}
				/>
				<MetricCard label="后端" value={activeThread?.backend === "codex" ? "Codex" : "Claude Code"} />
				<MetricCard label="审批" value={activeThread?.approvalMode ?? "-"} />
			</div>

			<div className="flex-1 overflow-y-auto px-3 py-3">
				<section>
					<div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
						<Layers3 className="h-3.5 w-3.5" />
						附加文件
					</div>
					{contextFiles.length === 0 ? (
						<div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400 dark:border-zinc-800">
							当前线程还没有额外附加文件
						</div>
					) : (
						<div className="space-y-2">
							{contextFiles.map((file) => (
								<div
									key={file.path}
									className="group flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white/80 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/70"
								>
									<div className="min-w-0 flex-1">
										<div className="truncate text-[12px] font-medium text-zinc-900 dark:text-zinc-100">
											{file.name}
										</div>
										<div className="mt-1 truncate font-mono text-[10px] text-zinc-400">{file.path}</div>
									</div>
									<button
										type="button"
										onClick={() => codingWorkspaceStore.removeContextFile(file.path)}
										className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
										title="移除文件"
									>
										<X className="h-3.5 w-3.5" />
									</button>
								</div>
							))}
						</div>
					)}
				</section>

				<section className="mt-6">
					<div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
						<Link2 className="h-3.5 w-3.5" />
						工作区指令源
					</div>
					<div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
						<div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
							{Object.entries(sourceGroups).length > 0 ? (
								Object.entries(sourceGroups).map(([kind, count]) => (
									<div key={kind} className="rounded-xl bg-zinc-100/80 px-3 py-2 dark:bg-zinc-800/70">
										<div className="truncate text-[10px] uppercase tracking-[0.14em] text-zinc-400">{kind}</div>
										<div className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">{count}</div>
									</div>
								))
							) : (
								<div className="col-span-2 py-2 text-xs text-zinc-400">未检测到额外 workspace 指令源</div>
							)}
						</div>
						{workspaceMemory?.sources?.length ? (
							<div className="mt-3 space-y-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
								{workspaceMemory.sources.map((source) => (
									<div key={source.path} className="truncate text-[11px] text-zinc-400">
										{source.label}
									</div>
								))}
							</div>
						) : null}
					</div>
				</section>
			</div>
		</div>
	);
}

function MetricCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-zinc-200/80 bg-white/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70">
			<div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">{label}</div>
			<div className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{value}</div>
		</div>
	);
}

function formatTokenCount(count: number): string {
	if (count <= 0) return "0";
	if (count < 1000) return String(count);
	if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
	return `${(count / 1_000_000).toFixed(2)}M`;
}
