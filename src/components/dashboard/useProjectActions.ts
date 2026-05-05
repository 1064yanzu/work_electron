import { useCallback } from "react";
import {
	deleteProject,
	revealProjectDirectory,
	updateProject,
} from "../../lib/api";
import { humanizeError } from "../../lib/errors";
import type { Project } from "../../types";
import { confirmDialog } from "../ui/ConfirmDialog";
import { inputDialog } from "../ui/InputDialog";
import { toast } from "../ui/Toast";

interface UseProjectActionsArgs {
	loadProjects: () => Promise<void>;
}

export function useProjectActions({ loadProjects }: UseProjectActionsArgs) {
	const handleRenameProject = useCallback(
		async (project: Project) => {
			const nextName = await inputDialog.show({
				title: "重命名项目",
				message: "请输入新的项目名称",
				defaultValue: project.name,
				confirmText: "保存",
				cancelText: "取消",
				validate: (value) => {
					const trimmed = value.trim();
					if (!trimmed) return "项目名称不能为空";
					return null;
				},
			});
			if (!nextName?.trim() || nextName.trim() === project.name) return;
			try {
				await updateProject({ id: project.id, name: nextName.trim() });
				await loadProjects();
				toast.success("重命名成功");
			} catch (error) {
				console.error("重命名项目失败:", error);
				toast.errorWithRetry(humanizeError(error, "重命名失败"), () =>
					handleRenameProject(project),
				);
			}
		},
		[loadProjects],
	);

	const handleToggleArchiveProject = useCallback(
		async (project: Project) => {
			try {
				await updateProject({
					id: project.id,
					is_archived: !project.is_archived,
				});
				await loadProjects();
				toast.success(project.is_archived ? "已取消归档" : "已归档");
			} catch (error) {
				console.error("更新项目归档状态失败:", error);
				toast.errorWithRetry(humanizeError(error, "更新失败"), () =>
					handleToggleArchiveProject(project),
				);
			}
		},
		[loadProjects],
	);

	const handleDeleteProject = useCallback(
		async (project: Project) => {
			const confirmed = await confirmDialog.danger(
				`确定要删除项目「${project.name}」吗？此操作不可撤销。`,
				"删除项目",
			);
			if (!confirmed) return;
			try {
				await deleteProject(project.id);
				await loadProjects();
				toast.success("项目已删除");
			} catch (error) {
				console.error("删除项目失败:", error);
				toast.errorWithRetry(humanizeError(error, "删除失败"), () =>
					handleDeleteProject(project),
				);
			}
		},
		[loadProjects],
	);

	const handleRevealProject = useCallback(async (project: Project) => {
		try {
			const result = await revealProjectDirectory(project.id);
			if (!result.success) {
				toast.error(result.error || "打开目录失败");
			} else {
				toast.success("已在文件管理器中打开项目目录");
			}
		} catch (error) {
			toast.error(humanizeError(error, "打开目录失败"));
		}
	}, []);

	return {
		handleRenameProject,
		handleToggleArchiveProject,
		handleDeleteProject,
		handleRevealProject,
	};
}
