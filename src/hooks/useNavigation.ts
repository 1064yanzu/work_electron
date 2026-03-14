import { useCallback, useState } from "react";
import { chatStore } from "../lib/chat/store";
import { debugUiLog } from "../lib/debug/uiDebug";
import { managedModeStore } from "../lib/managedModeStore";

export type ViewType = "dashboard" | "workbench" | "coding";

export interface NavigationState {
	view: ViewType;
	projectId?: string;
	docId?: string;
	/** 编程工作区：项目路径（可选，线程化后由 threadStore 管理） */
	codingProjectPath?: string;
	/** 编程工作区：直接导航到指定线程 */
	codingThreadId?: string;
}

/**
 * 导航状态管理 Hook
 * 解耦导航逻辑，便于复用和测试
 */
export function useNavigation(initialView: ViewType = "dashboard") {
	const [navState, setNavState] = useState<NavigationState>({
		view: initialView,
	});

	const navigateToDashboard = useCallback(() => {
		debugUiLog("[useNavigation] 导航到 Dashboard");
		setNavState({ view: "dashboard" });
	}, []);

	const navigateToWorkbench = useCallback(
		(projectId?: string, docId?: string) => {
			debugUiLog(
				"[useNavigation] 导航到 Workbench, projectId:",
				projectId,
				"docId:",
				docId,
			);
			setNavState({ view: "workbench", projectId, docId });
		},
		[],
	);

	const navigateToProject = useCallback((projectId: string) => {
		debugUiLog("[useNavigation] 导航到项目:", projectId);
		// 打开项目时自动新建对话并启用托管模式
		chatStore.createNewSession();
		managedModeStore.enableManagedMode();
		setNavState({ view: "workbench", projectId });
	}, []);

	/** 导航到编程工作区（可选参数：不传则进入线程首页） */
	const navigateToCoding = useCallback((projectPath?: string) => {
		debugUiLog(
			"[useNavigation] 导航到编程工作区:",
			projectPath || "(线程首页)",
		);
		setNavState({ view: "coding", codingProjectPath: projectPath });
	}, []);

	/** 直接导航到指定线程 */
	const navigateToCodingThread = useCallback((threadId: string) => {
		debugUiLog("[useNavigation] 导航到编程线程:", threadId);
		setNavState({ view: "coding", codingThreadId: threadId });
	}, []);

	return {
		navState,
		navigateToDashboard,
		navigateToWorkbench,
		navigateToProject,
		navigateToCoding,
		navigateToCodingThread,
		isInDashboard: navState.view === "dashboard",
		isInWorkbench: navState.view === "workbench",
		isInCoding: navState.view === "coding",
		currentProjectId: navState.projectId,
		currentDocId: navState.docId,
		currentCodingProjectPath: navState.codingProjectPath,
		currentCodingThreadId: navState.codingThreadId,
	};
}
