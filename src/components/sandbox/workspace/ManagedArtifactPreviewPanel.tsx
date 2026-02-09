import { ChevronLeft, ChevronRight, History, Sparkles } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { buildFileItemContextMenu } from "../../../lib/contextMenu/actions";
import type { SandboxFile } from "../../../lib/managedModeStore";
import { cn } from "../../../lib/utils";
import { ContextMenu } from "../../ui/ContextMenu";
import { FilePreviewContent } from "./FilePreviewContent";
import { useArtifactNavigator } from "./useArtifactNavigator";

interface ManagedArtifactPreviewPanelProps {
	selectedFile: SandboxFile | null;
	artifactFiles: SandboxFile[];
	previewMode: "preview" | "source";
	density?: "comfortable" | "compact";
	onSetPreviewMode: (mode: "preview" | "source") => void;
	onLoadContent: (fileId: string) => Promise<void>;
	onSelectArtifact: (fileId: string) => void;
	onCopyPath: (file: SandboxFile) => Promise<void> | void;
	onRevealFile: (file: SandboxFile) => Promise<void> | void;
	onMoveFile: (file: SandboxFile) => Promise<void> | void;
	onDeleteFile: (file: SandboxFile) => Promise<void> | void;
}

export const ManagedArtifactPreviewPanel = memo(
	function ManagedArtifactPreviewPanel({
		selectedFile,
		artifactFiles,
		previewMode,
		density = "comfortable",
		onSetPreviewMode,
		onLoadContent,
		onSelectArtifact,
		onCopyPath,
		onRevealFile,
		onMoveFile,
		onDeleteFile,
	}: ManagedArtifactPreviewPanelProps) {
		const [contextMenu, setContextMenu] = useState<{
			x: number;
			y: number;
			file: SandboxFile;
		} | null>(null);
		const {
			recentArtifacts,
			selectedArtifactIndex,
			totalArtifacts,
			selectNeighborId,
		} = useArtifactNavigator({
			artifactFiles,
			selectedFile,
		});

		const jumpArtifact = useCallback(
			(step: 1 | -1) => {
				const targetId = selectNeighborId(step);
				if (!targetId) return;
				onSelectArtifact(targetId);
			},
			[onSelectArtifact, selectNeighborId],
		);

		useEffect(() => {
			const handleKeyDown = (e: KeyboardEvent) => {
				if (isTypingElement(e.target)) return;
				if (e.altKey && e.key === "[") {
					e.preventDefault();
					jumpArtifact(-1);
				}
				if (e.altKey && e.key === "]") {
					e.preventDefault();
					jumpArtifact(1);
				}
			};
			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, [jumpArtifact]);

		const contextMenuItems = useMemo(() => {
			if (!contextMenu) return [];
			return buildFileItemContextMenu({
				onOpen: () => onSelectArtifact(contextMenu.file.id),
				onMove: () => void onMoveFile(contextMenu.file),
				onCopyPath: () => void onCopyPath(contextMenu.file),
				onReveal: () => void onRevealFile(contextMenu.file),
				onDelete: () => void onDeleteFile(contextMenu.file),
			});
		}, [
			contextMenu,
			onCopyPath,
			onDeleteFile,
			onMoveFile,
			onRevealFile,
			onSelectArtifact,
		]);

		const isCompact = density === "compact";
		return (
			<div className="h-full flex flex-col bg-white dark:bg-zinc-900">
				<div
					className={cn(
						"border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-zinc-50/95 to-zinc-50/70 dark:from-zinc-900/95 dark:to-zinc-900/70 backdrop-blur-sm space-y-2.5",
						isCompact ? "px-2.5 py-2" : "px-3 py-2.5",
					)}
				>
					<div className="flex items-center justify-between">
						<div className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
							<Sparkles className="w-3.5 h-3.5" />
							产物导航
						</div>
						<div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
							<button
								type="button"
								onClick={() => jumpArtifact(-1)}
								disabled={totalArtifacts === 0}
								className="p-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 focus-ring"
								title="上一个产物 (Alt+[)"
								aria-label="上一个产物"
							>
								<ChevronLeft className="w-3 h-3" />
							</button>
							<span className="tabular-nums px-1.5">
								{totalArtifacts === 0
									? "0/0"
									: `${selectedArtifactIndex + 1}/${totalArtifacts}`}
							</span>
							<button
								type="button"
								onClick={() => jumpArtifact(1)}
								disabled={totalArtifacts === 0}
								className="p-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 focus-ring"
								title="下一个产物 (Alt+])"
								aria-label="下一个产物"
							>
								<ChevronRight className="w-3 h-3" />
							</button>
						</div>
					</div>
					{/* 产物导航条，带滚动渐隐指示 */}
					<div className="relative">
						{/* 左侧渐隐遮罩 */}
						<div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-zinc-50 dark:from-zinc-900 to-transparent z-10 pointer-events-none" />
						{/* 右侧渐隐遮罩 */}
						<div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-50 dark:from-zinc-900 to-transparent z-10 pointer-events-none" />
						<div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1 px-1">
							{totalArtifacts === 0 ? (
								<span className="text-xs text-zinc-400 px-2 py-1">暂无产物</span>
							) : (
								artifactFiles.map((artifact) => (
									<button
										key={artifact.id}
										type="button"
										onClick={() => onSelectArtifact(artifact.id)}
										onContextMenu={(e) => {
											e.preventDefault();
											e.stopPropagation();
											setContextMenu({
												x: e.clientX,
												y: e.clientY,
												file: artifact,
											});
										}}
										className={cn(
											"px-2.5 min-h-9 py-1.5 rounded-xl text-xs border whitespace-nowrap transition-all focus-ring active:scale-95",
											selectedFile?.id === artifact.id
												? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-black/[0.06] dark:border-white/[0.08] shadow-sm"
												: "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700",
										)}
									>
										{artifact.name}
									</button>
								))
							)}
						</div>
					</div>
					{recentArtifacts.length > 0 ? (
						<div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
							<History className="w-3 h-3" />
							最近预览：
							<div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
								{recentArtifacts.map((artifact) => (
									<button
										key={artifact.id}
										type="button"
										onClick={() => onSelectArtifact(artifact.id)}
										className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[11px]"
										aria-label={`最近预览 ${artifact.name}`}
									>
										{artifact.name}
									</button>
								))}
							</div>
						</div>
					) : null}
				</div>

				<div className="flex-1 min-h-0">
					<FilePreviewContent
						file={selectedFile}
						previewMode={previewMode}
						onSetPreviewMode={onSetPreviewMode}
						onLoadContent={onLoadContent}
						emptyTitle="暂无预览"
						emptyDescription="从左侧文件树或上方产物导航选择文件"
					/>
				</div>
				{contextMenu && contextMenuItems.length > 0 ? (
					<ContextMenu
						x={contextMenu.x}
						y={contextMenu.y}
						items={contextMenuItems}
						onClose={() => setContextMenu(null)}
					/>
				) : null}
			</div>
		);
	},
);

function isTypingElement(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName.toLowerCase();
	return (
		tag === "input" ||
		tag === "textarea" ||
		tag === "select" ||
		target.isContentEditable
	);
}
