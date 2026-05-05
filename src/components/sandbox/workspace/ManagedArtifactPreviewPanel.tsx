import {
	ChevronLeft,
	ChevronRight,
	FileCode,
	FileJson,
	FileText,
	History,
	Image as ImageIcon,
	Table,
	Terminal as TerminalIcon,
	X,
	Zap,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { buildFileItemContextMenu } from "../../../lib/contextMenu/actions";
import type { SandboxFile } from "../../../lib/managedModeStore";
import {
	sandboxEditorStore,
	useSandboxEditorStoreSelector,
} from "../../../lib/sandboxEditorStore";
import { cn } from "../../../lib/utils";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { ContextMenu } from "../../ui/ContextMenu";
import { FilePreviewContent } from "./FilePreviewContent";
import { SandboxTerminalDock } from "./SandboxTerminalDock";
import { useArtifactNavigator } from "./useArtifactNavigator";

interface ManagedArtifactPreviewPanelProps {
	selectedFile: SandboxFile | null;
	artifactFiles: SandboxFile[];
	taskId?: string;
	sandboxDir?: string;
	previewMode: "preview" | "source";
	density?: "comfortable" | "compact";
	terminalDockCollapsed: boolean;
	onSetPreviewMode: (mode: "preview" | "source") => void;
	onLoadContent: (fileId: string) => Promise<void>;
	onSelectArtifact: (fileId: string) => void;
	onCopyPath: (file: SandboxFile) => Promise<void> | void;
	onRevealFile: (file: SandboxFile) => Promise<void> | void;
	onMoveFile: (file: SandboxFile) => Promise<void> | void;
	onDeleteFile: (file: SandboxFile) => Promise<void> | void;
	onSetTerminalDockCollapsed: (collapsed: boolean) => void;
	devLogs?: string[];
	onClearDevLogs?: () => void;
}

const CODE_EXTENSIONS = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"py",
	"go",
	"rs",
	"java",
	"c",
	"cpp",
	"h",
	"hpp",
	"cs",
	"swift",
	"kt",
	"rb",
	"php",
	"sh",
	"bash",
	"zsh",
	"sql",
	"vue",
	"svelte",
	"html",
	"htm",
	"css",
	"scss",
	"less",
	"sass",
]);
const DATA_EXTENSIONS = new Set([
	"json",
	"jsonc",
	"yaml",
	"yml",
	"toml",
	"xml",
]);
const DOC_EXTENSIONS = new Set(["md", "markdown", "txt", "rtf"]);
const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"svg",
	"webp",
	"bmp",
]);
const TABLE_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);

function getTabIcon(extension: string) {
	const ext = extension.toLowerCase().replace(/^\./, "");
	if (CODE_EXTENSIONS.has(ext)) return <FileCode className="w-3 h-3" />;
	if (DATA_EXTENSIONS.has(ext)) return <FileJson className="w-3 h-3" />;
	if (IMAGE_EXTENSIONS.has(ext)) return <ImageIcon className="w-3 h-3" />;
	if (TABLE_EXTENSIONS.has(ext)) return <Table className="w-3 h-3" />;
	if (DOC_EXTENSIONS.has(ext)) return <FileText className="w-3 h-3" />;
	return <FileText className="w-3 h-3" />;
}

export const ManagedArtifactPreviewPanel = memo(
	function ManagedArtifactPreviewPanel({
		selectedFile,
		artifactFiles,
		taskId,
		sandboxDir,
		previewMode,
		density = "comfortable",
		terminalDockCollapsed,
		onSetPreviewMode,
		onLoadContent,
		onSelectArtifact,
		onCopyPath,
		onRevealFile,
		onMoveFile,
		onDeleteFile,
		onSetTerminalDockCollapsed,
		devLogs,
		onClearDevLogs,
	}: ManagedArtifactPreviewPanelProps) {
		const [contextMenu, setContextMenu] = useState<{
			x: number;
			y: number;
			file: SandboxFile;
		} | null>(null);

		const openTabs = useSandboxEditorStoreSelector((s) => s.openTabs);

		// graph 标记的产物 id 集合（用于角标显示）
		const artifactIdSet = useMemo(
			() => new Set(artifactFiles.map((f) => f.id)),
			[artifactFiles],
		);

		// openTabs 反查到 SandboxFile（与 managedModeStore.files 共享 id）
		// 若反查失败（罕见），用 EditorTab 信息合成最小 SandboxFile
		const navigableFiles = useMemo<SandboxFile[]>(() => {
			const byId = new Map(artifactFiles.map((f) => [f.id, f] as const));
			return openTabs.map((tab) => {
				const existing = byId.get(tab.id);
				if (existing) return existing;
				return {
					id: tab.id,
					name: tab.name,
					path: tab.path,
					type: "file" as const,
					extension: tab.extension,
					size: 0,
					content: tab.content,
					mimeType: "application/octet-stream",
					createdAt: tab.lastActiveAt,
					modifiedAt: tab.lastActiveAt,
					category: "other" as const,
				};
			});
		}, [openTabs, artifactFiles]);

		const {
			recentArtifacts,
			selectedArtifactIndex,
			totalArtifacts,
			selectNeighborId,
		} = useArtifactNavigator({
			artifactFiles: navigableFiles,
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

		const handleCloseTab = useCallback(
			async (tabId: string) => {
				const tab = sandboxEditorStore
					.getState()
					.openTabs.find((t) => t.id === tabId);
				if (!tab) return;
				if (tab.dirty) {
					const confirmed = await confirmDialog.danger(
						`「${tab.name}」有未保存的修改，关闭后将丢失。确定关闭吗？`,
						"关闭未保存的标签页",
					);
					if (!confirmed) return;
				}
				const remainingAfter = sandboxEditorStore
					.getState()
					.openTabs.filter((t) => t.id !== tabId);
				sandboxEditorStore.closeTab(tabId);
				// 同步 selectedFile：关闭的是当前选中文件时，切到剩余 tab 的 active
				if (selectedFile?.id === tabId) {
					const next = sandboxEditorStore.getState().activeTabId;
					if (next) {
						onSelectArtifact(next);
					} else if (remainingAfter.length === 0) {
						// 没有可切换的 tab，清空选择
						onSelectArtifact("");
					}
				}
			},
			[onSelectArtifact, selectedFile?.id],
		);

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

		const tabsWithStatus = useMemo(
			() =>
				navigableFiles.map((file) => {
					const tab = openTabs.find((t) => t.id === file.id);
					return {
						file,
						dirty: tab?.dirty ?? false,
						isArtifact: artifactIdSet.has(file.id),
					};
				}),
			[navigableFiles, openTabs, artifactIdSet],
		);

		const isCompact = density === "compact";

		return (
			<div className="h-full flex flex-col bg-surface">
				<div
					className={cn(
						"border-b border-border bg-gradient-to-b from-zinc-50/95 to-zinc-50/70 dark:from-zinc-900/95 dark:to-zinc-900/70 backdrop-blur-sm space-y-2.5",
						isCompact ? "px-2.5 py-2" : "px-3 py-2.5",
					)}
				>
					<div className="flex items-center justify-between">
						<div className="inline-flex items-center gap-1.5 text-xs text-text-muted">
							<Zap className="w-3.5 h-3.5" />
							已打开
							<span className="text-text-light">·</span>
							<span className="tabular-nums">{totalArtifacts}</span>
						</div>
						<div className="inline-flex items-center gap-1.5 text-[11px] text-text-light">
							<button
								type="button"
								onClick={() => jumpArtifact(-1)}
								disabled={totalArtifacts === 0}
								className="p-1 rounded-md border border-border text-text-muted hover:bg-warm-200 disabled:opacity-40 focus-ring"
								title="上一个 (Alt+[)"
								aria-label="上一个标签页"
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
								className="p-1 rounded-md border border-border text-text-muted hover:bg-warm-200 disabled:opacity-40 focus-ring"
								title="下一个 (Alt+])"
								aria-label="下一个标签页"
							>
								<ChevronRight className="w-3 h-3" />
							</button>
						</div>
					</div>
					{/* 多 Tab 标签栏 */}
					<div className="relative">
						<div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-zinc-50 dark:from-zinc-900 to-transparent z-10 pointer-events-none" />
						<div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-50 dark:from-zinc-900 to-transparent z-10 pointer-events-none" />
						<div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1 px-1">
							{totalArtifacts === 0 ? (
								<span className="text-xs text-text-light px-2 py-1">
									暂无打开的文件
								</span>
							) : (
								tabsWithStatus.map(({ file, dirty, isArtifact }) => {
									const isActive = selectedFile?.id === file.id;
									return (
										<div
											key={file.id}
											className={cn(
												"group inline-flex items-center gap-1.5 pl-2.5 pr-1.5 min-h-9 py-1.5 rounded-xl text-xs border whitespace-nowrap transition-all focus-ring active:scale-[0.98] cursor-pointer",
												isActive
													? "bg-dark-muted text-white border-black/[0.06] dark:border-white/[0.08] shadow-sm"
													: "bg-surface text-text-secondary border-border hover:bg-warm-200 dark:hover:bg-cream-700",
											)}
											onClick={() => onSelectArtifact(file.id)}
											onContextMenu={(e) => {
												e.preventDefault();
												e.stopPropagation();
												setContextMenu({
													x: e.clientX,
													y: e.clientY,
													file,
												});
											}}
											role="button"
											tabIndex={0}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													onSelectArtifact(file.id);
												}
											}}
											aria-label={`切换到 ${file.name}`}
										>
											<span className="shrink-0 opacity-70">
												{getTabIcon(file.extension)}
											</span>
											{isArtifact ? (
												<span
													className="shrink-0 text-amber-400"
													title="Agent 标记的产物"
												>
													<Zap className="w-3 h-3" />
												</span>
											) : null}
											{dirty ? (
												<span
													className={cn(
														"w-1.5 h-1.5 rounded-full shrink-0",
														isActive ? "bg-amber-300" : "bg-primary",
													)}
													title="未保存的修改"
												/>
											) : null}
											<span className="truncate max-w-[140px]">
												{file.name}
											</span>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													void handleCloseTab(file.id);
												}}
												className={cn(
													"ml-0.5 p-0.5 rounded transition-all shrink-0 cursor-pointer",
													isActive
														? "opacity-60 hover:opacity-100 hover:bg-white/10"
														: "opacity-0 group-hover:opacity-100 hover:bg-warm-300 dark:hover:bg-cream-700",
												)}
												aria-label={`关闭 ${file.name}`}
												title="关闭"
											>
												<X className="w-3 h-3" />
											</button>
										</div>
									);
								})
							)}
						</div>
					</div>
					{recentArtifacts.length > 0 ? (
						<div className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
							<History className="w-3 h-3" />
							最近预览：
							<div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
								{recentArtifacts.map((artifact) => (
									<button
										key={artifact.id}
										type="button"
										onClick={() => onSelectArtifact(artifact.id)}
										className="px-2 py-0.5 rounded-md bg-warm-200 hover:bg-warm-300 dark:hover:bg-cream-700 text-[11px]"
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
					<PanelGroup direction="vertical">
						<Panel defaultSize={terminalDockCollapsed ? 96 : 70} minSize={30}>
							<FilePreviewContent
								file={selectedFile}
								taskId={taskId}
								sandboxDir={sandboxDir}
								previewMode={previewMode}
								onSetPreviewMode={onSetPreviewMode}
								onLoadContent={onLoadContent}
								onRevealFile={onRevealFile}
								emptyTitle="暂无预览"
								emptyDescription="从左侧文件树或上方标签页选择文件"
							/>
						</Panel>
						<PanelResizeHandle
							className={cn(
								"h-1 bg-warm-200 hover:bg-warm-300 dark:hover:bg-cream-700 transition-colors",
								terminalDockCollapsed
									? "cursor-default opacity-0"
									: "cursor-row-resize",
							)}
							disabled={terminalDockCollapsed}
						/>
						<Panel
							defaultSize={terminalDockCollapsed ? 4 : 30}
							minSize={terminalDockCollapsed ? 4 : 12}
							maxSize={terminalDockCollapsed ? 4 : 70}
						>
							{terminalDockCollapsed ? (
								<button
									type="button"
									onClick={() => onSetTerminalDockCollapsed(false)}
									className="w-full h-full flex items-center justify-between px-3 text-[11px] text-text-muted bg-warm-50 hover:bg-warm-100 dark:bg-cream-900/60 dark:hover:bg-cream-900 border-t border-border transition-colors cursor-pointer"
									title="展开终端面板"
								>
									<span className="inline-flex items-center gap-1.5">
										<TerminalIcon className="w-3 h-3" />
										终端 / 日志
									</span>
									<span className="text-text-light">点击展开</span>
								</button>
							) : (
								<SandboxTerminalDock
									taskId={taskId || ""}
									sandboxDir={sandboxDir || ""}
									logs={devLogs || []}
									onClearLogs={onClearDevLogs}
									onCollapse={() => onSetTerminalDockCollapsed(true)}
								/>
							)}
						</Panel>
					</PanelGroup>
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
