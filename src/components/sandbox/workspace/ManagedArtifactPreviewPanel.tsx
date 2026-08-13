import {
	ChevronLeft,
	ChevronRight,
	FileCode,
	FileJson,
	FileText,
	Image as ImageIcon,
	RefreshCw,
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
	terminalDockCollapsed: boolean;
	onSetPreviewMode: (mode: "preview" | "source") => void;
	onLoadContent: (fileId: string) => Promise<void>;
	onSelectArtifact: (fileId: string) => void;
	onCopyPath: (file: SandboxFile) => Promise<void> | void;
	onRevealFile: (file: SandboxFile) => Promise<void> | void;
	onMoveFile: (file: SandboxFile) => Promise<void> | void;
	onDeleteFile: (file: SandboxFile) => Promise<void> | void;
	onSetTerminalDockCollapsed: (collapsed: boolean) => void;
	/** 刷新沙盒文件列表（原 ManagedCenterHeader 的刷新入口，随头部裁撤移入 Tab 栏右端） */
	onRefreshFiles?: () => void;
	isRefreshingFiles?: boolean;
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
		terminalDockCollapsed,
		onSetPreviewMode,
		onLoadContent,
		onSelectArtifact,
		onCopyPath,
		onRevealFile,
		onMoveFile,
		onDeleteFile,
		onSetTerminalDockCollapsed,
		onRefreshFiles,
		isRefreshingFiles,
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

		const { selectedArtifactIndex, totalArtifacts, selectNeighborId } =
			useArtifactNavigator({
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

		return (
			<div className="h-full flex flex-col bg-surface">
				<div className="border-b border-border bg-warm-100/40 dark:bg-cream-900/60 backdrop-blur-sm shrink-0">
					{/* 单行 Tab 栏：左侧滚动 Tab 列表 + 右侧紧凑翻页 */}
					<div className="flex items-stretch min-h-9">
						<div className="flex items-stretch overflow-x-auto scrollbar-hide flex-1 min-w-0">
							{totalArtifacts === 0 ? (
								<span className="text-xs text-text-light px-3 py-2 self-center">
									暂无打开的文件
								</span>
							) : (
								tabsWithStatus.map(({ file, dirty, isArtifact }) => {
									const isActive = selectedFile?.id === file.id;
									return (
										<div
											key={file.id}
											className={cn(
												"group inline-flex items-center gap-1.5 pl-3 pr-1.5 text-xs whitespace-nowrap transition-colors cursor-pointer border-r border-border/60 shrink-0 focus-ring",
												isActive
													? "bg-surface text-text-primary shadow-[inset_0_2px_0_0_rgba(217,108,70,0.6)] dark:bg-cream-800 dark:text-cream-100"
													: "bg-transparent text-text-muted hover:bg-warm-200/60 hover:text-text-secondary dark:hover:bg-cream-700/40",
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
													className="shrink-0 text-amber-500"
													title="Agent 标记的产物"
												>
													<Zap className="w-3 h-3" />
												</span>
											) : null}
											<span className="truncate max-w-[180px]">
												{file.name}
											</span>
											{/* dirty 与关闭按钮共位：未保存时常显 dot，hover 时切换为 X */}
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													void handleCloseTab(file.id);
												}}
												className={cn(
													"ml-0.5 w-4 h-4 inline-flex items-center justify-center rounded transition-[color,background-color,border-color,opacity,box-shadow,transform] shrink-0 cursor-pointer",
													isActive
														? "hover:bg-warm-200 dark:hover:bg-cream-700"
														: "hover:bg-warm-300 dark:hover:bg-cream-700",
												)}
												aria-label={`关闭 ${file.name}`}
												title={dirty ? "未保存，点击关闭" : "关闭"}
											>
												{dirty ? (
													<>
														<span
															className={cn(
																"w-1.5 h-1.5 rounded-full block group-hover:hidden",
																isActive ? "bg-primary" : "bg-text-muted",
															)}
														/>
														<X className="w-3 h-3 hidden group-hover:block" />
													</>
												) : (
													<X
														className={cn(
															"w-3 h-3 transition-opacity",
															isActive
																? "opacity-60 group-hover:opacity-100"
																: "opacity-0 group-hover:opacity-100",
														)}
													/>
												)}
											</button>
										</div>
									);
								})
							)}
						</div>
						{/* 右端：紧凑翻页 */}
						{totalArtifacts > 1 ? (
							<div className="flex items-center gap-0.5 px-2 shrink-0 border-l border-border/60">
								<button
									type="button"
									onClick={() => jumpArtifact(-1)}
									className="p-1 rounded text-text-muted hover:text-text-secondary hover:bg-warm-200/60 focus-ring"
									title="上一个 (Alt+[)"
									aria-label="上一个标签页"
								>
									<ChevronLeft className="w-3 h-3" />
								</button>
								<span className="text-2xs text-text-light tabular-nums px-0.5 min-w-[28px] text-center">
									{selectedArtifactIndex + 1}/{totalArtifacts}
								</span>
								<button
									type="button"
									onClick={() => jumpArtifact(1)}
									className="p-1 rounded text-text-muted hover:text-text-secondary hover:bg-warm-200/60 focus-ring"
									title="下一个 (Alt+])"
									aria-label="下一个标签页"
								>
									<ChevronRight className="w-3 h-3" />
								</button>
							</div>
						) : null}
						{/* 刷新文件列表（原中栏内容头裁撤后移到这里） */}
						{onRefreshFiles ? (
							<div className="flex items-center px-1.5 shrink-0 border-l border-border/60">
								<button
									type="button"
									onClick={onRefreshFiles}
									disabled={isRefreshingFiles}
									className="p-1 rounded text-text-muted hover:text-text-secondary hover:bg-warm-200/60 focus-ring disabled:opacity-50"
									title="刷新文件列表"
									aria-label="刷新文件列表"
								>
									<RefreshCw
										className={cn(
											"w-3 h-3",
											isRefreshingFiles && "animate-spin",
										)}
									/>
								</button>
							</div>
						) : null}
					</div>
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
									className="w-full h-full flex items-center justify-between px-3 text-xs text-text-muted bg-warm-50 hover:bg-warm-100 dark:bg-cream-900/60 dark:hover:bg-cream-900 border-t border-border transition-colors cursor-pointer"
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
