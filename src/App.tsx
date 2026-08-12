import {
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	Panel,
	PanelGroup,
	type ImperativePanelHandle,
} from "react-resizable-panels";
import { PanelShell } from "./components/layout/PanelShell";
import { SidebarRail } from "./components/layout/SidebarRail";
import ResizeHandle from "./components/layout/ResizeHandle";
import { CenterLayout } from "./components/layout/CenterLayout";
import { CopilotFloatingButton } from "./components/layout/CopilotFloatingButton";
import { PanelErrorBoundary } from "./components/ui/PanelErrorBoundary";
import { MouseDragProvider } from "./hooks/useMouseDrag";
import { GlobalContextMenuProvider } from "./components/ui/GlobalContextMenuProvider";
import { Skeleton } from "./components/ui/Skeleton";
import {
	terminalStore,
	useTerminalStoreSelector,
} from "./lib/stores/terminalStore";
import { getTerminalPrefs } from "./lib/config/terminal";
import { themeManager } from "./lib/theme";
import { getMotionPreference } from "./lib/config";
import { preloadUiDebugSetting } from "./lib/debug/uiDebug";
import {
	applyMotionPreferenceToDocument,
	MOTION_PREFERENCE_EVENT,
	normalizeMotionPreference,
	subscribeSystemMotionPreference,
	type MotionPreference,
} from "./lib/interaction/motionPreference";
import { workspaceStore } from "./lib/workspaceStore";
import { useLayoutStoreSelector } from "./lib/stores/layoutStore";
import { layoutStore } from "./lib/stores/layoutStore";
import { useCommandPaletteStoreSelector } from "./lib/stores/commandPaletteStore";
import { useReaderStoreSelector } from "./lib/stores/readerStore";
import { useCardLibraryStoreSelector } from "./lib/stores/cardLibraryStore";
import {
	installGlobalShortcutListener,
	registerDefaultShortcuts,
} from "./lib/shortcuts";
import { ShortcutCheatSheet } from "./components/ui/ShortcutCheatSheet";
import { useRemoteChatBridge } from "./lib/remoteChatBridge";
import { useRemoteTerminalBridge } from "./lib/remoteTerminalBridge";
import { useHarnessTerminalBridge } from "./lib/harnessTerminalBridge";
import { usePetQuickReplyBridge } from "./lib/usePetQuickReplyBridge";
import type { SettingsTabId } from "./components/Settings/types";
import { normalizeSettingsTabId } from "./components/Settings/settingsCatalog";
import { rescanCustomSlashCommands } from "./lib/slashCommands/customScanner";
import { EVENTS, events } from "./lib/events";
import { invoke } from "./lib/tauriCompat";
import { useIpcListen } from "./hooks/useIpcListen";
import { shortcut } from "./lib/platform";
import { cn } from "./lib/utils";

// 右侧栏自动隐藏的阈值（百分比）- 当拖动结束时尺寸小于此值则隐藏
const RIGHT_PANEL_COLLAPSE_THRESHOLD = 12;

const CopilotSidebar = lazy(() => import("./components/CopilotSidebar"));
const ResourceSidebar = lazy(() => import("./components/ResourceSidebar"));
const SettingsModal = lazy(async () => {
	const mod = await import("./components/Settings/SettingsModal");
	return { default: mod.SettingsModal };
});
const TerminalPanel = lazy(() => import("./components/Terminal/TerminalPanel"));
const MascotOnboarding = lazy(() =>
	import("./components/Mascot/MascotOnboarding").then((m) => ({
		default: m.MascotOnboarding,
	})),
);
const CommandPalette = lazy(() =>
	import("./components/CommandPalette/CommandPaletteHost").then((m) => ({
		default: m.CommandPaletteHost,
	})),
);
const ReaderApp = lazy(() =>
	import("./components/reader/ReaderApp").then((m) => ({
		default: m.ReaderApp,
	})),
);
const KnowledgeCardsApp = lazy(() =>
	import("./components/cards/KnowledgeCardsApp").then((m) => ({
		default: m.KnowledgeCardsApp,
	})),
);
const MASCOT_ONBOARDING_KEY = "mascotOnboardingShown";

function PanelLoadingFallback() {
	return (
		<div className="h-full w-full flex flex-col gap-3 p-4">
			<Skeleton className="h-8 w-2/3" />
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-4 w-5/6" />
			<Skeleton className="h-4 w-3/4" />
			<div className="flex-1" />
			<Skeleton className="h-10 w-full rounded-xl" />
		</div>
	);
}

export default function App() {
	useRemoteChatBridge();
	useRemoteTerminalBridge();
	useHarnessTerminalBridge();
	usePetQuickReplyBridge();

	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [settingsInitialTab, setSettingsInitialTab] =
		useState<SettingsTabId>("ai.models");
	const [motionPreference, setMotionPreference] =
		useState<MotionPreference>("system");
	const [showMascotOnboarding, setShowMascotOnboarding] = useState(false);
	// 三个全屏 overlay 的开关状态：只有为 true 时才挂载对应的 lazy 组件，
	// 避免 React.lazy 在应用启动时就立即拉取对应 chunk（尤其 ReaderApp 相关代码量较大）
	const isCommandPaletteOpen = useCommandPaletteStoreSelector((s) => s.isOpen);
	const isReaderOpen = useReaderStoreSelector((s) => s.openedBookId !== null);
	const isCardLibraryOpen = useCardLibraryStoreSelector((s) => s.open);
	// 中栏渲染什么已经下放给 CenterLayout：分屏之后「当前标签」不再是全局唯一的
	// 一个值，每个编辑器组各有一个。这里不再需要知道它。
	const leftSidebarCollapsed = useLayoutStoreSelector(
		(state) => state.leftSidebarCollapsed,
	);
	const rightSidebarVisible = useLayoutStoreSelector(
		(state) => state.rightSidebarVisible,
	);
	const setRightSidebarVisible =
		workspaceStore.setRightSidebarVisible.bind(workspaceStore);
	const terminalVisible = useTerminalStoreSelector((s) => s.isVisible);

	// 右侧 Panel 的命令式句柄
	const rightPanelRef = useRef<ImperativePanelHandle>(null);
	// 记录右侧 Panel 当前尺寸（用于拖动结束时判断）
	const rightPanelSizeRef = useRef<number>(25);
	// 拖拽状态：拖拽中禁用 flex 过渡（否则拖动有迟滞感）
	const [isLeftHandleDragging, setIsLeftHandleDragging] = useState(false);
	const [isRightHandleDragging, setIsRightHandleDragging] = useState(false);
	// 吸附收起预告（拖到阈值内 handle 变签名色）
	const [rightSnapPreview, setRightSnapPreview] = useState(false);
	// 左栏同款吸附预告：minSize=15，拖到贴边（<17）说明再拖就会 snap 收起
	const [leftSnapPreview, setLeftSnapPreview] = useState(false);
	const anyHandleDragging = isLeftHandleDragging || isRightHandleDragging;
	// 面板收起/展开的平滑过渡（拖拽中必须禁用）
	const panelTransitionClass = anyHandleDragging
		? ""
		: "transition-[flex] duration-150 ease-out-expo";

	// 左侧 Panel 的命令式句柄（用于响应 leftSidebarCollapsed 切换）
	const leftPanelRef = useRef<ImperativePanelHandle>(null);

	// 项目概念已从 UI 移除，工作区始终处于"无项目（global）"状态
	useEffect(() => {
		workspaceStore.setCurrentProject(null);
	}, []);

	// 把 leftSidebarCollapsed 同步给 PanelGroup 的左 Panel（命令式 collapse/expand）
	useEffect(() => {
		const panel = leftPanelRef.current;
		if (!panel) return;
		if (leftSidebarCollapsed) {
			panel.collapse();
		} else {
			panel.expand();
		}
	}, [leftSidebarCollapsed]);

	// 把 rightSidebarVisible 同步给右 Panel：collapse 而非卸载，
	// 保留 Copilot 的滚动位置与输入草稿，且收起/展开有 flex 过渡
	useEffect(() => {
		const panel = rightPanelRef.current;
		if (!panel) return;
		if (rightSidebarVisible) {
			if (panel.isCollapsed()) panel.expand();
		} else if (!panel.isCollapsed()) {
			panel.collapse();
		}
	}, [rightSidebarVisible]);

	// 初始化主题管理器
	useEffect(() => {
		void themeManager.getTheme();
		void preloadUiDebugSetting();
	}, []);

	// 首启 Mascot 引导：仅在未读标记时显示一次
	useEffect(() => {
		if (typeof window === "undefined") return;
		const shown = window.localStorage.getItem(MASCOT_ONBOARDING_KEY);
		if (!shown) {
			const id = window.setTimeout(() => {
				setShowMascotOnboarding(true);
			}, 600);
			return () => window.clearTimeout(id);
		}
	}, []);

	// 终端：启动时自动打开（如果用户开启了 openOnLaunch）
	useEffect(() => {
		void getTerminalPrefs().then((prefs) => {
			if (prefs.openOnLaunch) {
				terminalStore.toggleVisible();
			}
		});
	}, []);

	const handleMascotOnboardingFinish = useCallback(() => {
		setShowMascotOnboarding(false);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(MASCOT_ONBOARDING_KEY, "1");
		}
	}, []);

	useEffect(() => {
		let disposed = false;

		const applyPreference = (next: MotionPreference) => {
			if (disposed) return;
			setMotionPreference(next);
			applyMotionPreferenceToDocument(next);
		};

		void getMotionPreference().then((next) => {
			applyPreference(next);
		});

		const handlePreferenceChange = (event: Event) => {
			const custom = event as CustomEvent<unknown>;
			applyPreference(normalizeMotionPreference(custom.detail));
		};

		window.addEventListener(MOTION_PREFERENCE_EVENT, handlePreferenceChange);
		const unsubscribeSystem = subscribeSystemMotionPreference(() => {
			if (motionPreference === "system") {
				applyMotionPreferenceToDocument("system");
			}
		});

		return () => {
			disposed = true;
			window.removeEventListener(
				MOTION_PREFERENCE_EVENT,
				handlePreferenceChange,
			);
			unsubscribeSystem();
		};
	}, [motionPreference]);

	// 全局快捷键：唯一 keydown 分发器 + 注册中心
	// （⌘K 命令面板 / ⌘L 右栏 / ⌘B 左栏 / ⌘` 终端 / ⌘/ 速查表，见 defaultShortcuts.ts）
	useEffect(() => {
		const uninstall = installGlobalShortcutListener();
		const unregister = registerDefaultShortcuts();
		return () => {
			unregister();
			uninstall();
		};
	}, []);

	// 处理右侧 Panel 尺寸变化：记录尺寸 + 维护吸附预告（仅跨越阈值时 setState，低频）
	const handleRightPanelResize = useCallback((size: number) => {
		rightPanelSizeRef.current = size;
		setRightSnapPreview((prev) => {
			const next = size > 0 && size < RIGHT_PANEL_COLLAPSE_THRESHOLD + 2;
			return prev === next ? prev : next;
		});
	}, []);

	// 左侧 Panel 尺寸变化：维护吸附预告（与右侧对称，反馈一致）
	const handleLeftPanelResize = useCallback((size: number) => {
		setLeftSnapPreview((prev) => {
			const next = size > 0 && size < 17;
			return prev === next ? prev : next;
		});
	}, []);

	// 处理右侧 ResizeHandle 拖动状态变化（拖动结束时检查是否吸附收起）
	const handleRightResizeHandleDragging = useCallback(
		(isDragging: boolean) => {
			setIsRightHandleDragging(isDragging);
			// 拖动结束时检查尺寸（collapsible 面板通常已自动吸附，此处兜底同步 store）
			if (!isDragging && rightSidebarVisible) {
				if (rightPanelSizeRef.current < RIGHT_PANEL_COLLAPSE_THRESHOLD) {
					setRightSidebarVisible(false);
				}
			}
		},
		[rightSidebarVisible, setRightSidebarVisible],
	);

	// 显示右侧栏时恢复 Panel
	const handleShowRightSidebar = useCallback(() => {
		setRightSidebarVisible(true);
		// 如果 Panel 被收起，恢复到默认大小
		if (rightPanelRef.current) {
			rightPanelRef.current.resize(25);
		}
	}, [setRightSidebarVisible]);

	const handleOpenSettings = useCallback((tab?: string) => {
		setSettingsInitialTab(normalizeSettingsTabId(tab));
		setIsSettingsOpen(true);
	}, []);

	// 订阅斜杠命令发出的「打开设置」事件（/settings）
	useEffect(() => {
		const off = events.on(
			EVENTS.OPEN_SETTINGS,
			(payload: { tab?: string } | undefined) => {
				const tab = typeof payload?.tab === "string" ? payload.tab : undefined;
				handleOpenSettings(tab);
			},
		);
		return off;
	}, [handleOpenSettings]);

	// 订阅原生菜单事件 — 帮助菜单里的"导出日志…/打开日志目录"
	// 转发到设置面板的"关于与更新"页，让用户在熟悉的 UI 里完成动作。
	// 用 useIpcListen 统一处理异步订阅的竞态清理（避免组件在 .then() 回调前卸载产生孤儿监听器）
	useIpcListen<{ type: string; action: string }>(
		"app-menu-action",
		(payload) => {
			if (payload?.type !== "logs") return;
			handleOpenSettings("general.about");
			if (payload.action === "reveal") {
				void invoke("logs_reveal").catch(() => {});
			} else if (payload.action === "export") {
				void invoke("logs_export", { days: 7 }).catch(() => {});
			}
		},
		[handleOpenSettings],
	);

	// 启动 + 工作区目录切换时扫描自定义命令（.claude/commands/）
	useEffect(() => {
		void rescanCustomSlashCommands();
		// 只在 currentThreadPath 变化时重扫，避免 layout 变化触发无谓扫描
		let lastPath: string | null =
			workspaceStore.getCoreState().currentThreadPath;
		const unsubscribe = workspaceStore.subscribe(() => {
			const nextPath = workspaceStore.getCoreState().currentThreadPath;
			if (nextPath !== lastPath) {
				lastPath = nextPath;
				void rescanCustomSlashCommands();
			}
		});
		return unsubscribe;
	}, []);

	return (
		<GlobalContextMenuProvider>
			<MouseDragProvider>
				<div className="h-screen w-screen font-sans overflow-hidden relative transition-colors duration-250 flex selection:bg-primary/20 p-0 gap-0 animate-in fade-in zoom-in-95 bg-background text-text-secondary">
					{/* 活动栏（rail）固定 52px，不参与 PanelGroup 的百分比布局——
					    避免折叠时 collapsedSize 百分比在宽窗口下比 rail 宽，露出一条空白残条 */}
					<SidebarRail onOpenSettings={() => handleOpenSettings()} />
					<PanelGroup
						direction="horizontal"
						className="gap-0"
						autoSaveId="main_three_panel_layout_v4"
					>
						{/* Left Panel: Resources */}
						<Panel
							ref={leftPanelRef}
							defaultSize={20}
							minSize={15}
							maxSize={50}
							collapsible
							collapsedSize={0}
							onResize={handleLeftPanelResize}
							onCollapse={() => {
								// Panel 自身被折叠时同步给 store（用户拖到极窄）
								if (!layoutStore.getState().leftSidebarCollapsed) {
									layoutStore.setLeftSidebarCollapsed(true);
								}
							}}
							onExpand={() => {
								if (layoutStore.getState().leftSidebarCollapsed) {
									layoutStore.setLeftSidebarCollapsed(false);
								}
							}}
							className={cn("overflow-hidden", panelTransitionClass)}
						>
							<PanelShell>
								<PanelErrorBoundary label="资源栏">
									<Suspense fallback={<PanelLoadingFallback />}>
										<ResourceSidebar
											onOpenSettings={() => handleOpenSettings()}
										/>
									</Suspense>
								</PanelErrorBoundary>
							</PanelShell>
						</Panel>

						<ResizeHandle
							onDragging={setIsLeftHandleDragging}
							onDoubleClick={() => leftPanelRef.current?.resize(20)}
							willSnapCollapse={isLeftHandleDragging && leftSnapPreview}
						/>

						{/* Center Panel: Editor Canvas OR Browser OR Sandbox (Managed Mode) + Terminal */}
						<Panel
							defaultSize={55}
							minSize={30}
							className={cn("overflow-hidden", panelTransitionClass)}
						>
							<PanelShell variant="center" className="relative">
								<PanelGroup
									direction="vertical"
									className="h-full"
									autoSaveId="center_vertical_split"
								>
									{/* 主内容区：可分屏的编辑器组树（每组自带标签条） */}
									<Panel
										defaultSize={terminalVisible ? 65 : 100}
										minSize={20}
										className="overflow-hidden"
									>
										<CenterLayout />
									</Panel>

									{/* 终端面板 - 仅在可见时渲染 */}
									{terminalVisible && (
										<>
											<ResizeHandle direction="vertical" />
											<Panel
												defaultSize={35}
												minSize={10}
												maxSize={80}
												className="overflow-hidden"
											>
												<Suspense fallback={<PanelLoadingFallback />}>
													<TerminalPanel />
												</Suspense>
											</Panel>
										</>
									)}
								</PanelGroup>
							</PanelShell>
						</Panel>

						{/* Right Panel: Copilot — 始终挂载，collapse 而非卸载（保留滚动位置/输入草稿） */}
						<ResizeHandle
							onDragging={handleRightResizeHandleDragging}
							onDoubleClick={() => rightPanelRef.current?.resize(25)}
							willSnapCollapse={isRightHandleDragging && rightSnapPreview}
						/>
						<Panel
							ref={rightPanelRef}
							defaultSize={25}
							minSize={12}
							maxSize={50}
							collapsible
							collapsedSize={0}
							onResize={handleRightPanelResize}
							onCollapse={() => {
								if (layoutStore.getState().rightSidebarVisible) {
									setRightSidebarVisible(false);
								}
							}}
							onExpand={() => {
								if (!layoutStore.getState().rightSidebarVisible) {
									setRightSidebarVisible(true);
								}
							}}
							className={cn("overflow-hidden", panelTransitionClass)}
						>
							<PanelShell>
								<PanelErrorBoundary label="AI 对话栏">
									<Suspense fallback={<PanelLoadingFallback />}>
										<CopilotSidebar />
									</Suspense>
								</PanelErrorBoundary>
							</PanelShell>
						</Panel>
					</PanelGroup>

					{/* 右侧栏隐藏时的悬浮唤起按钮 - 放在 PanelGroup 外部避免叠压 */}
					{!rightSidebarVisible && (
						<CopilotFloatingButton
							onClick={handleShowRightSidebar}
							shortcutHint={shortcut("L")}
						/>
					)}
				</div>

				{/* Global Settings Modal - Always rendered */}
				{isSettingsOpen ? (
					<Suspense fallback={null}>
						<SettingsModal
							isOpen={isSettingsOpen}
							onClose={() => setIsSettingsOpen(false)}
							initialTab={settingsInitialTab}
						/>
					</Suspense>
				) : null}

				{showMascotOnboarding ? (
					<Suspense fallback={null}>
						<MascotOnboarding onFinish={handleMascotOnboardingFinish} />
					</Suspense>
				) : null}

				{/* Command Palette — Cmd+K 全局唤起，挂在最高层级避免被其它 modal 遮挡。
        					全局快捷键监听在 registerDefaultShortcuts 中注册，与本组件是否挂载无关，
        					因此这里可以安全地在关闭状态下完全不挂载该 lazy 组件，避免启动时预拉取 chunk */}
				{isCommandPaletteOpen ? (
					<Suspense fallback={null}>
						<CommandPalette onOpenSettings={(tab) => handleOpenSettings(tab)} />
					</Suspense>
				) : null}

				{/* 快捷键速查表 — Cmd+/ 唤起，数据来自 shortcutRegistry */}
				<ShortcutCheatSheet />

				{/* 阅读器全屏 Overlay — 由 readerStore.openedBookId 控制，关闭时完全不挂载 */}
				{isReaderOpen ? (
					<Suspense fallback={null}>
						<ReaderApp onOpenSettings={() => handleOpenSettings("reader")} />
					</Suspense>
				) : null}

				{/* 知识卡片库全屏 Overlay — 由 cardLibraryStore.open 控制（CardsHubView 的"放大"按钮触发），关闭时完全不挂载 */}
				{isCardLibraryOpen ? (
					<Suspense fallback={null}>
						<KnowledgeCardsApp />
					</Suspense>
				) : null}
			</MouseDragProvider>
		</GlobalContextMenuProvider>
	);
}
