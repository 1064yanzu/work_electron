import { useCallback } from "react";
import {
	createSource,
	fetchUrlContent,
	revealProjectDirectory,
	uploadFileContent,
} from "../../../lib/api";
import { workspaceStore } from "../../../lib/workspaceStore";
import { SourceType } from "../../../types";
import { toast } from "../../ui/Toast";

export type ResourceCreateTab = "web" | "text" | "file";

interface CreateSourceParams {
	title: string;
	content: string;
	activeTab: ResourceCreateTab;
}

interface UseResourceSidebarActionsOptions {
	onCreated?: () => void | Promise<void>;
}

export function useResourceSidebarActions({
	onCreated,
}: UseResourceSidebarActionsOptions) {
	const createSourceFromModal = useCallback(
		async ({
			title,
			content,
			activeTab,
		}: CreateSourceParams): Promise<boolean> => {
			if (!title.trim()) {
				toast.warning("请输入标题");
				return false;
			}

			const state = workspaceStore.getState();
			const projectId = state.currentProjectId || undefined;
			const folderId =
				state.currentFolderId && state.currentFolderId !== "__unassigned__"
					? state.currentFolderId
					: undefined;

			try {
				if (activeTab === "web") {
					if (!content.trim()) {
						toast.warning("请输入 URL");
						return false;
					}
					await fetchUrlContent({
						url: content,
						title,
						tags: [],
						project_id: projectId,
						folder_id: folderId,
					});
				} else if (activeTab === "text") {
					await createSource({
						title,
						kind: SourceType.Text,
						tags: [],
						project_id: projectId,
						folder_id: folderId,
					});
				} else {
					if (!content.trim()) {
						toast.warning("请选择文件");
						return false;
					}
					await uploadFileContent({
						title,
						content,
						file_type: "txt",
						tags: [],
						project_id: projectId,
						folder_id: folderId,
					});
				}

				if (onCreated) {
					await onCreated();
				}
				toast.success("资料创建成功");
				return true;
			} catch (error) {
				console.error("创建资源失败:", error);
				toast.error(
					`创建失败: ${error instanceof Error ? error.message : String(error)}`,
				);
				return false;
			}
		},
		[onCreated],
	);

	const revealFolderProjectDirectory = useCallback(
		async (projectId?: string) => {
			if (!projectId) {
				toast.warning("该文件夹不属于具体项目，暂不支持定位目录");
				return false;
			}

			try {
				const result = await revealProjectDirectory(projectId);
				if (!result.success) {
					toast.error(result.error || "打开目录失败");
					return false;
				}
				return true;
			} catch (error) {
				console.error("打开目录失败:", error);
				toast.error(
					`打开目录失败: ${error instanceof Error ? error.message : String(error)}`,
				);
				return false;
			}
		},
		[],
	);

	return {
		createSourceFromModal,
		revealFolderProjectDirectory,
	};
}
