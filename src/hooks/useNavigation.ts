import { useCallback, useState } from "react";
import { chatStore } from "../lib/chat/store";
import { debugUiLog } from "../lib/debug/uiDebug";
import { managedModeStore } from "../lib/managedModeStore";

export type ViewType = "dashboard" | "workbench";

export interface NavigationState {
	view: ViewType;
	projectId?: string;
	docId?: string;
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

	return {
		navState,
		navigateToDashboard,
		navigateToWorkbench,
		navigateToProject,
		isInDashboard: navState.view === "dashboard",
		isInWorkbench: navState.view === "workbench",
		currentProjectId: navState.projectId,
		currentDocId: navState.docId,
	};
}
