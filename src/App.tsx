import { useEffect, useState } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";
import BrowserPanel from "./components/BrowserPanel";
import CopilotSidebar from "./components/CopilotSidebar";
import Dashboard from "./components/Dashboard";
import EditorCanvas from "./components/EditorCanvas";
import ResizeHandle from "./components/layout/ResizeHandle";
import ResourceSidebar from "./components/ResourceSidebar";
import { SandboxWorkspace } from "./components/sandbox";
import { SettingsModal } from "./components/Settings/SettingsModal";
import { MouseDragProvider } from "./hooks/useMouseDrag";
import { useNavigation } from "./hooks/useNavigation";
import { useManagedModeStore } from "./lib/managedModeStore";
import { themeManager } from "./lib/theme";
import { useWorkspaceStore, workspaceStore } from "./lib/workspaceStore";


export default function App() {
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const { activeMainView } = useWorkspaceStore();
	const { isActive: isManagedMode, store: managedModeStore } = useManagedModeStore();

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
		// 主题管理器在导入时就会自动初始化
		// 这里确保它被引用，避免被 tree-shaking 移除
		const theme = themeManager.getTheme();
		console.log("当前主题:", theme);
	}, []);

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
						autoSaveId="main_three_panel_layout_v1"
					>
						{/* Left Panel: Resources */}
						<Panel
							defaultSize={20}
							minSize={15}
							maxSize={50}
							className="flex flex-col bg-white/80 dark:bg-[#1E1E1E]/90 backdrop-blur-xl rounded-[16px] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] border border-black/[0.06] dark:border-white/[0.06] ring-1 ring-black/[0.02] overflow-hidden transition-all"
						>
							<ResourceSidebar onOpenSettings={() => setIsSettingsOpen(true)} />
						</Panel>

						<ResizeHandle />

						{/* Center Panel: Editor Canvas OR Browser OR Sandbox (Managed Mode) */}
						<Panel
							defaultSize={55}
							minSize={30}
							className="flex flex-col bg-white/80 dark:bg-[#1E1E1E]/90 backdrop-blur-xl rounded-[16px] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] border border-black/[0.06] dark:border-white/[0.06] ring-1 ring-black/[0.02] overflow-hidden relative transition-all"
						>
							{isManagedMode ? (
								<SandboxWorkspace
									onExitManagedMode={() => managedModeStore.disableManagedMode()}
								/>
							) : activeMainView === "browser" ? (
								<BrowserPanel />
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

						<ResizeHandle />

						{/* Right Panel: Copilot */}
						<Panel
							defaultSize={25}
							minSize={20}
							maxSize={50}
							className="flex flex-col bg-white/80 dark:bg-[#1E1E1E]/90 backdrop-blur-xl rounded-[16px] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] border border-black/[0.06] dark:border-white/[0.06] ring-1 ring-black/[0.02] overflow-hidden transition-all"
						>
							<CopilotSidebar />
						</Panel>
					</PanelGroup>
				</div>
			)}

			{/* Global Settings Modal - Always rendered */}
			<SettingsModal
				isOpen={isSettingsOpen}
				onClose={() => setIsSettingsOpen(false)}
			/>
		</MouseDragProvider>
	);
}
