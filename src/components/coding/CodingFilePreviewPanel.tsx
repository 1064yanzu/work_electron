import { FileCode2, Loader2, Paperclip, RefreshCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useShikiTokens } from "../../hooks/useShikiHighlight";
import { openCodingFilePreview } from "../../lib/coding/filePreview";
import { codingWorkspaceStore, useCodingWorkspaceSelector } from "../../lib/stores/codingWorkspaceStore";
import { toast } from "../ui/Toast";
import { getPreviewLanguageLabel, getPreviewPathLabel, splitPreviewLines } from "./filePreview/filePreviewUtils";

export function CodingFilePreviewPanel() {
	const projectPath = useCodingWorkspaceSelector((state) => state.projectPath);
	const selectedFilePath = useCodingWorkspaceSelector((state) => state.selectedFilePath);
	const preview = useCodingWorkspaceSelector((state) => state.selectedFilePreview);
	const [refreshing, setRefreshing] = useState(false);

	const lines = useMemo(() => splitPreviewLines(preview.content), [preview.content]);
	const language = getPreviewLanguageLabel(preview.path);
	const displayPath = getPreviewPathLabel(preview.path, projectPath);
	const { tokens: shikiTokens, loading: shikiLoading } = useShikiTokens(preview.content, language);
	const canAttach = Boolean(preview.path);

	const handleRefresh = async () => {
		if (!selectedFilePath) return;
		setRefreshing(true);
		try {
			await openCodingFilePreview(selectedFilePath);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setRefreshing(false);
		}
	};

	const handleAttach = () => {
		if (!preview.path) return;
		codingWorkspaceStore.addContextFile({
			path: preview.path,
			name: preview.path.split(/[\\/]/).pop() || preview.path,
			content: preview.content,
		});
		toast.success("文件已加入当前线程上下文");
	};

	if (!preview.path) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-6 text-center">
				<FileCode2 className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
				<div className="text-sm font-medium text-zinc-500 dark:text-zinc-300">选择一个文件开始浏览</div>
				<div className="mt-2 text-xs text-zinc-400">左侧文件树点击文件后，会在这里展示真实内容预览</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col bg-[#FAFAFA] dark:bg-[#111111]">
			<div className="border-b border-black/[0.04] px-3 py-3 dark:border-white/[0.04]">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">{displayPath}</div>
						<div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
							<span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">{language}</span>
							{preview.truncated && <span>已按大小截断预览</span>}
						</div>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void handleRefresh()}
							disabled={preview.loading || refreshing}
							className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
						>
							{preview.loading || refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
							刷新
						</button>
						<button
							type="button"
							onClick={handleAttach}
							disabled={!canAttach}
							className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-[11px] font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
						>
							<Paperclip className="h-3.5 w-3.5" />
							加入上下文
						</button>
					</div>
				</div>
			</div>

			{preview.loading ? (
				<div className="flex flex-1 items-center justify-center">
					<Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
				</div>
			) : preview.error ? (
				<div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-red-500">
					{preview.error}
				</div>
			) : (
				<div className="flex-1 overflow-auto">
					<div className="min-w-full bg-white dark:bg-[#0d0d0d]">
						{lines.map((line, lineIdx) => {
							const lineTokens = (!shikiLoading && shikiTokens && lineIdx < shikiTokens.length)
								? shikiTokens[lineIdx]
								: null;
							return (
								<div
									key={line.number}
									className="grid grid-cols-[56px_minmax(0,1fr)] border-b border-zinc-100/80 dark:border-zinc-800/80"
								>
									<div className="select-none border-r border-zinc-100/80 px-3 py-1.5 text-right text-[11px] text-zinc-400 dark:border-zinc-800/80 dark:text-zinc-500">
										{line.number}
									</div>
									<pre className="overflow-x-auto px-3 py-1.5 text-[12px] leading-6"><code>{lineTokens ? (
										lineTokens.map((token, ti) => (
											<span key={ti} style={{ color: token.color }}>{token.content}</span>
										))
									) : (
										<span className="text-zinc-800 dark:text-zinc-200">{line.text || " "}</span>
									)}</code></pre>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
