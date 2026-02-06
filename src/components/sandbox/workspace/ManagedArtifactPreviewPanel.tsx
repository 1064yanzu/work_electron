import { ChevronLeft, ChevronRight, History, Sparkles } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { SandboxFile } from "../../../lib/managedModeStore";
import { cn } from "../../../lib/utils";
import { ArtifactPreviewContent } from "./ArtifactPreviewContent";

interface ManagedArtifactPreviewPanelProps {
	selectedFile: SandboxFile | null;
	artifactFiles: SandboxFile[];
	previewMode: "preview" | "source";
	onSetPreviewMode: (mode: "preview" | "source") => void;
	onLoadContent: (fileId: string) => Promise<void>;
	onSelectArtifact: (fileId: string) => void;
}

export const ManagedArtifactPreviewPanel = memo(
	function ManagedArtifactPreviewPanel({
		selectedFile,
		artifactFiles,
		previewMode,
		onSetPreviewMode,
		onLoadContent,
		onSelectArtifact,
	}: ManagedArtifactPreviewPanelProps) {
		const [recentArtifactIds, setRecentArtifactIds] = useState<string[]>([]);

		const artifactById = useMemo(() => {
			const map = new Map<string, SandboxFile>();
			for (const artifact of artifactFiles) map.set(artifact.id, artifact);
			return map;
		}, [artifactFiles]);

		useEffect(() => {
			if (!selectedFile) return;
			if (!artifactById.has(selectedFile.id)) return;
			setRecentArtifactIds((prev) => {
				const next = [
					selectedFile.id,
					...prev.filter((id) => id !== selectedFile.id),
				];
				return next.slice(0, 6);
			});
		}, [selectedFile, artifactById]);

		const recentArtifacts = useMemo(
			() =>
				recentArtifactIds
					.map((id) => artifactById.get(id))
					.filter(Boolean) as SandboxFile[],
			[artifactById, recentArtifactIds],
		);
		const selectedArtifactIndex = useMemo(
			() =>
				selectedFile
					? artifactFiles.findIndex(
							(artifact) => artifact.id === selectedFile.id,
						)
					: -1,
			[artifactFiles, selectedFile],
		);

		const jumpArtifact = useCallback(
			(step: 1 | -1) => {
				if (artifactFiles.length === 0) return;
				const start = selectedArtifactIndex >= 0 ? selectedArtifactIndex : 0;
				const next =
					(start + step + artifactFiles.length) % artifactFiles.length;
				const target = artifactFiles[next];
				if (!target) return;
				onSelectArtifact(target.id);
			},
			[artifactFiles, onSelectArtifact, selectedArtifactIndex],
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

		return (
			<div className="h-full flex flex-col bg-white dark:bg-zinc-900">
				<div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm space-y-2">
					<div className="flex items-center justify-between">
						<div className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
							<Sparkles className="w-3.5 h-3.5" />
							产物带
						</div>
						<div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
							<button
								type="button"
								onClick={() => jumpArtifact(-1)}
								disabled={artifactFiles.length === 0}
								className="p-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
								title="上一个产物 (Alt+[)"
							>
								<ChevronLeft className="w-3 h-3" />
							</button>
							<span className="tabular-nums px-1.5">
								{artifactFiles.length === 0
									? "0/0"
									: `${selectedArtifactIndex + 1}/${artifactFiles.length}`}
							</span>
							<button
								type="button"
								onClick={() => jumpArtifact(1)}
								disabled={artifactFiles.length === 0}
								className="p-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
								title="下一个产物 (Alt+])"
							>
								<ChevronRight className="w-3 h-3" />
							</button>
						</div>
					</div>
					<div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
						{artifactFiles.length === 0 ? (
							<span className="text-xs text-zinc-400 px-2 py-1">暂无产物</span>
						) : (
							artifactFiles.map((artifact) => (
								<button
									key={artifact.id}
									type="button"
									onClick={() => onSelectArtifact(artifact.id)}
									className={cn(
										"px-2.5 py-1.5 rounded-xl text-xs border whitespace-nowrap transition-colors",
										selectedFile?.id === artifact.id
											? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-black/[0.06] dark:border-white/[0.08]"
											: "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700",
									)}
								>
									{artifact.name}
								</button>
							))
						)}
					</div>
					{recentArtifacts.length > 0 ? (
						<div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
							<History className="w-3 h-3" />
							最近：
							<div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
								{recentArtifacts.map((artifact) => (
									<button
										key={artifact.id}
										type="button"
										onClick={() => onSelectArtifact(artifact.id)}
										className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[11px]"
									>
										{artifact.name}
									</button>
								))}
							</div>
						</div>
					) : null}
				</div>

				<div className="flex-1 min-h-0">
					<ArtifactPreviewContent
						file={selectedFile}
						previewMode={previewMode}
						onSetPreviewMode={onSetPreviewMode}
						onLoadContent={onLoadContent}
					/>
				</div>
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
