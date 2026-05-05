import {
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { MessageCircle } from "lucide-react";
import {
	Panel,
	PanelGroup,
	type ImperativePanelHandle,
} from "react-resizable-panels";
import { PanelShell } from "./components/layout/PanelShell";
import ResizeHandle from "./components/layout/ResizeHandle";
import { MouseDragProvider } from "./hooks/useMouseDrag";
import { GlobalContextMenuProvider } from "./components/ui/GlobalContextMenuProvider";
import { useNavigation } from "./hooks/useNavigation";
import {
	useManagedModeStoreSelector,
	managedModeStore,
} from "./lib/managedModeStore";
import { useTerminalStoreSelector } from "./lib/stores/terminalStore";
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
import { commandPaletteStore } from "./lib/stores/commandPaletteStore";
import { useRemoteChatBridge } from "./lib/remoteChatBridge";
import { usePetQuickReplyBridge } from "./lib/usePetQuickReplyBridge";
import type { SettingsTabId } from "./components/Settings/types";

// 右侧栏自动隐藏的阈值（百分比）- 当拖动结束时尺寸小于此值则隐藏
const RIGHT_PANEL_COLLAPSE_THRESHOLD = 12;

const BrowserPanel = lazy(() => import("./components/BrowserPanel"));
const CopilotSidebar = lazy(() => import("./components/CopilotSidebar"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const EditorCanvas = lazy(() => import("./components/EditorCanvas"));
const ResourceSidebar = lazy(() => import("./components/ResourceSidebar"));
const SandboxWorkspace = lazy(
	() => import("./components/sandbox/SandboxWorkspace"),
);
const WikiGraphFullscreen = lazy(() =>
	import("./components/wiki/WikiGraphFullscreen").then((m) => ({
		default: m.WikiGraphFullscreen,
	})),
);
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
const MASCOT_ONBOARDING_KEY = "mascotOnboardingShown";

function PanelLoadingFallback() {
	return (
		<div className="h-full w-full flex items-center justify-center text-xs text-text-muted">
			正在加载...
		</div>
	);
}

export default function App() {
	useRemoteChatBridge();
	usePetQuickReplyBridge();

	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [settingsInitialTab, setSettingsInitialTab] =
		useState<SettingsTabId>("models");
	const [motionPreference, setMotionPreference] =
		useState<MotionPreference>("system");
	const [showMascotOnboarding, setShowMascotOnboarding] = useState(false);
	const activeMainView = useLayoutStoreSelector(
		(state) => state.activeMainView,
	);
	const rightSidebarVisible = useLayoutStoreSelector(
		(state) => state.rightSidebarVisible,
	);
	const toggleRightSidebar =
		workspaceStore.toggleRightSidebar.bind(workspaceStore);
	const setRightSidebarVisible =
		workspaceStore.setRightSidebarVisible.bind(workspaceStore);
	const isManagedMode = useManagedModeStoreSelector((state) => state.isActive);
	const terminalVisible = useTerminalStoreSelector((s) => s.isVisible);

	// 右侧 Panel 的命令式句柄
	const rightPanelRef = useRef<ImperativePanelHandle>(null);
	// 记录右侧 Panel 当前尺寸（用于拖动结束时判断）
	const rightPanelSizeRef = useRef<number>(25);

	// 使用解耦的导航 Hook
	const {
		navigateToDashboard,
		navigateToProject,
		navigateToWorkbench,
		isInDashboard,
		currentProjectId,
		currentDocId,
	} = useNavigation("dashboard");

	// 同步当前项目到工作区
	useEffect(() => {
		workspaceStore.setCurrentProject(currentProjectId || null);
	}, [currentProjectId]);

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

	// Cmd+L 快捷键切换右侧栏 / Cmd+K 打开命令面板
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isMod = e.metaKey || e.ctrlKey;
			if (!isMod) return;
			const key = e.key.toLowerCase();
			if (key === "l") {
				e.preventDefault();
				toggleRightSidebar();
			} else if (key === "k") {
				e.preventDefault();
				commandPaletteStore.toggle();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [toggleRightSidebar]);

	// 处理右侧 Panel 尺寸变化（只记录尺寸，不触发隐藏）
	const handleRightPanelResize = useCallback((size: number) => {
		rightPanelSizeRef.current = size;
	}, []);

	// 处理右侧 ResizeHandle 拖动状态变化（拖动结束时检查是否隐藏）
	const handleRightResizeHandleDragging = useCallback(
		(isDragging: boolean) => {
			// 拖动结束时检查尺寸
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

	const handleOpenSettings = useCallback((tab?: SettingsTabId) => {
		setSettingsInitialTab(tab ?? "models");
		setIsSettingsOpen(true);
	}, []);

	return (
		<GlobalContextMenuProvider>
			<MouseDragProvider>
				{isInDashboard ? (
					<Suspense fallback={<PanelLoadingFallback />}>
						<Dashboard
							onOpenSettings={() => handleOpenSettings()}
							onOpenProject={(projectId) => {
								navigateToProject(projectId);
							}}
						/>
					</Suspense>
				) : (
					<div className="h-screen w-screen font-sans overflow-hidden relative transition-colors duration-300 flex selection:bg-primary/20 p-0 gap-0 animate-in fade-in zoom-in-95 bg-background text-text-secondary">
						<PanelGroup
							direction="horizontal"
							className="gap-0"
							autoSaveId="main_three_panel_layout_v2"
						>
							{/* Left Panel: Resources */}
							<Panel
								defaultSize={20}
								minSize={15}
								maxSize={50}
								className="overflow-hidden"
							>
								<PanelShell>
									<Suspense fallback={<PanelLoadingFallback />}>
										<ResourceSidebar
											onOpenSettings={() => handleOpenSettings()}
											onNavigateHome={() => navigateToDashboard()}
											onNavigateWorkbench={() => navigateToWorkbench()}
										/>
									</Suspense>
								</PanelShell>
							</Panel>

							<ResizeHandle />

							{/* Center Panel: Editor Canvas OR Browser OR Sandbox (Managed Mode) + Terminal */}
							<Panel
								defaultSize={rightSidebarVisible ? 55 : 80}
								minSize={30}
								className="overflow-hidden"
							>
								<PanelShell variant="center" className="relative">
									<PanelGroup
										direction="vertical"
										className="h-full"
										autoSaveId="center_vertical_split"
									>
										{/* 主内容区 */}
										<Panel
											defaultSize={terminalVisible ? 65 : 100}
											minSize={20}
											className="overflow-hidden"
										>
											{activeMainView === "wiki-graph" ? (
												<Suspense fallback={<PanelLoadingFallback />}>
													<WikiGraphFullscreen />
												</Suspense>
											) : activeMainView === "browser" ? (
												<Suspense fallback={<PanelLoadingFallback />}>
													<BrowserPanel />
												</Suspense>
											) : isManagedMode ? (
												<Suspense fallback={<PanelLoadingFallback />}>
													<SandboxWorkspace
														onExitManagedMode={() =>
															managedModeStore.disableManagedMode()
														}
													/>
												</Suspense>
											) : (
												<Suspense fallback={<PanelLoadingFallback />}>
													<EditorCanvas
														projectId={currentProjectId}
														initialDocId={currentDocId}
														onBack={() => {
															navigateToDashboard();
														}}
													/>
												</Suspense>
											)}
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

							{rightSidebarVisible && (
								<>
									<ResizeHandle onDragging={handleRightResizeHandleDragging} />
									<Panel
										ref={rightPanelRef}
										defaultSize={25}
										minSize={5}
										maxSize={50}
										onResize={handleRightPanelResize}
										className="overflow-hidden"
									>
										<PanelShell>
											<Suspense fallback={<PanelLoadingFallback />}>
												<CopilotSidebar />
											</Suspense>
										</PanelShell>
									</Panel>
								</>
							)}
						</PanelGroup>

						{/* 右侧栏隐藏时的悬浮唤起按钮 - 放在 PanelGroup 外部避免叠压 */}
						{!rightSidebarVisible && (
							<button
								type="button"
								onClick={handleShowRightSidebar}
								className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 backdrop-blur-xl rounded-full transition-[background-color,box-shadow,transform,color] duration-200 active:scale-[0.98]"
								style={{
									backgroundColor: "var(--t-bg-surface)",
									color: "var(--t-text-primary)",
									border: "1px solid var(--t-border)",
									boxShadow: "0 4px 12px 0 rgb(26 26 25 / 0.06)",
								}}
								title="打开 AI 对话 (⌘L)"
							>
								<MessageCircle className="w-4 h-4" strokeWidth={1.5} />
								<span className="text-sm font-medium">AI 对话</span>
							</button>
						)}
					</div>
				)}

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

				{/* Command Palette — Cmd+K 全局唤起，挂在最高层级避免被其它 modal 遮挡 */}
				<Suspense fallback={null}>
					<CommandPalette
						onOpenProject={navigateToProject}
						onOpenDashboard={navigateToDashboard}
						onOpenSettings={(tab) =>
							handleOpenSettings(tab as SettingsTabId | undefined)
						}
					/>
				</Suspense>

				{/* 阅读器全屏 Overlay — 由 readerStore.openedBookId 控制 */}
				<Suspense fallback={null}>
					<ReaderApp
						onOpenSettings={() => handleOpenSettings("reader" as SettingsTabId)}
					/>
				</Suspense>
			</MouseDragProvider>
		</GlobalContextMenuProvider>
	);
}
