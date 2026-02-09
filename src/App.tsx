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
import Dashboard from "./components/Dashboard";
import EditorCanvas from "./components/EditorCanvas";
import ResizeHandle from "./components/layout/ResizeHandle";
import ResourceSidebar from "./components/ResourceSidebar";
import { MouseDragProvider } from "./hooks/useMouseDrag";
import { useNavigation } from "./hooks/useNavigation";
import { useManagedModeStore } from "./lib/managedModeStore";
import { themeManager } from "./lib/theme";
import { getMotionPreference } from "./lib/config";
import {
	applyMotionPreferenceToDocument,
	MOTION_PREFERENCE_EVENT,
	normalizeMotionPreference,
	subscribeSystemMotionPreference,
	type MotionPreference,
} from "./lib/interaction/motionPreference";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "./lib/workspaceStore";

// 右侧栏自动隐藏的阈值（百分比）- 当拖动结束时尺寸小于此值则隐藏
const RIGHT_PANEL_COLLAPSE_THRESHOLD = 12;

const BrowserPanel = lazy(() => import("./components/BrowserPanel"));
const CopilotSidebar = lazy(() => import("./components/CopilotSidebar"));
const SandboxWorkspace = lazy(
	() => import("./components/sandbox/SandboxWorkspace"),
);
const SettingsModal = lazy(async () => {
	const mod = await import("./components/Settings/SettingsModal");
	return { default: mod.SettingsModal };
});

function PanelLoadingFallback() {
	return (
		<div className="h-full w-full flex items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
			正在加载...
		</div>
	);
}

export default function App() {
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [motionPreference, setMotionPreference] =
		useState<MotionPreference>("system");
	const activeMainView = useWorkspaceStoreSelector(
		(state) => state.activeMainView,
	);
	const rightSidebarVisible = useWorkspaceStoreSelector(
		(state) => state.rightSidebarVisible,
	);
	const toggleRightSidebar =
		workspaceStore.toggleRightSidebar.bind(workspaceStore);
	const setRightSidebarVisible =
		workspaceStore.setRightSidebarVisible.bind(workspaceStore);
	const { isActive: isManagedMode, store: managedModeStore } =
		useManagedModeStore();

	// 右侧 Panel 的命令式句柄
	const rightPanelRef = useRef<ImperativePanelHandle>(null);
	// 记录右侧 Panel 当前尺寸（用于拖动结束时判断）
	const rightPanelSizeRef = useRef<number>(25);

	// 使用解耦的导航 Hook
	const {
		navState,
		navigateToDashboard,
		navigateToProject,
		isInDashboard,
		currentProjectId,
		currentDocId,
	} = useNavigation("dashboard");

	// 同步当前项目到工作区
	useEffect(() => {
		workspaceStore.setCurrentProject(currentProjectId || null);
	}, [currentProjectId]);

	// 添加导航变化日志
	useEffect(() => {
		console.log("[App] 导航状态变化:", navState);
	}, [navState]);

	// 初始化主题管理器
	useEffect(() => {
		const theme = themeManager.getTheme();
		console.log("当前主题:", theme);
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

	// Cmd+L 快捷键切换右侧栏
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
				e.preventDefault();
				toggleRightSidebar();
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

	return (
		<MouseDragProvider>
			{isInDashboard ? (
				<Dashboard
					onOpenSettings={() => setIsSettingsOpen(true)}
					onOpenProject={(projectId) => {
						console.log("[App] 打开项目:", projectId);
						navigateToProject(projectId);
					}}
				/>
			) : (
				<div className="h-screen w-screen bg-[#F9F9F8] dark:bg-[#0a0a0a] text-zinc-800 dark:text-zinc-200 font-sans overflow-hidden relative transition-colors flex selection:bg-primary/20 p-1.5 gap-1.5 animate-in fade-in zoom-in-95 duration-300">
					<PanelGroup
						direction="horizontal"
						className="gap-1.5"
						autoSaveId="main_three_panel_layout_v2"
					>
						{/* Left Panel: Resources */}
						<Panel
							defaultSize={20}
							minSize={15}
							maxSize={50}
							className="flex flex-col bg-white/80 dark:bg-[#1E1E1E]/90 backdrop-blur-xl rounded-[16px] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] border border-black/[0.06] dark:border-white/[0.06] ring-1 ring-black/[0.02] overflow-hidden transition-[background-color,border-color,box-shadow]"
						>
							<ResourceSidebar onOpenSettings={() => setIsSettingsOpen(true)} />
						</Panel>

						<ResizeHandle />

						{/* Center Panel: Editor Canvas OR Browser OR Sandbox (Managed Mode) */}
						<Panel
							defaultSize={rightSidebarVisible ? 55 : 80}
							minSize={30}
							className="mid-center-panel flex flex-col bg-white/80 dark:bg-[#1E1E1E]/90 backdrop-blur-xl rounded-[16px] shadow-[0_6px_30px_-12px_rgba(0,0,0,0.14)] border border-black/[0.06] dark:border-white/[0.06] ring-1 ring-black/[0.02] overflow-hidden relative transition-[background-color,border-color,box-shadow]"
						>
							{isManagedMode ? (
								<Suspense fallback={<PanelLoadingFallback />}>
									<SandboxWorkspace
										onExitManagedMode={() =>
											managedModeStore.disableManagedMode()
										}
									/>
								</Suspense>
							) : activeMainView === "browser" ? (
								<Suspense fallback={<PanelLoadingFallback />}>
									<BrowserPanel />
								</Suspense>
							) : (
								<EditorCanvas
									projectId={currentProjectId}
									initialDocId={currentDocId}
									onBack={() => {
										console.log("[App] 返回首页");
										navigateToDashboard();
									}}
								/>
							)}
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
									className="flex flex-col bg-white/80 dark:bg-[#1E1E1E]/90 backdrop-blur-xl rounded-[16px] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] border border-black/[0.06] dark:border-white/[0.06] ring-1 ring-black/[0.02] overflow-hidden transition-[background-color,border-color,box-shadow]"
								>
									<Suspense fallback={<PanelLoadingFallback />}>
										<CopilotSidebar />
									</Suspense>
								</Panel>
							</>
						)}
					</PanelGroup>

					{/* 右侧栏隐藏时的悬浮唤起按钮 - 放在 PanelGroup 外部避免叠压 */}
					{!rightSidebarVisible && (
						<button
							type="button"
							onClick={handleShowRightSidebar}
							className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-white/90 dark:bg-[#1E1E1E]/90 backdrop-blur-xl hover:bg-white dark:hover:bg-[#2a2a2a] text-zinc-600 dark:text-zinc-300 rounded-2xl shadow-[0_4px_24px_-8px_rgba(0,0,0,0.15)] border border-black/[0.06] dark:border-white/[0.08] ring-1 ring-black/[0.02] transition-[transform,box-shadow,background-color,color,border-color] duration-200 hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.2)] hover:scale-[1.02] active:scale-[0.98]"
							title="打开 AI 对话 (⌘L)"
						>
							<MessageCircle className="w-4 h-4" />
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
					/>
				</Suspense>
			) : null}
		</MouseDragProvider>
	);
}
