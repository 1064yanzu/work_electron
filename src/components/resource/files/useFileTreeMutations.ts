import { useCallback } from "react";
import { safeInvoke } from "../../../lib/tauriBridge";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { toast } from "../../ui/Toast";

/**
 * 包装 fs 安全 IPC 的命令式 hook，供 FILES 面板调用。
 * 不维护本地状态——状态由调用者（ProjectFilesView）通过传入的 refresh 回调刷新。
 */
export function useFileTreeMutations(refresh: (dirPath: string) => void) {
	const createFile = useCallback(
		async (parentPath: string, name: string) => {
			const target = joinPath(parentPath, name);
			try {
				await safeInvoke("write_file_safe", {
					payload: {
						path: target,
						content: "",
						create_dirs: true,
						allow_empty: true,
					},
				});
				refresh(parentPath);
				toast.success(`已新建文件 ${name}`);
				return target;
			} catch (error) {
				console.error("[useFileTreeMutations] createFile failed:", error);
				toast.error(formatError("新建文件失败", error));
				return null;
			}
		},
		[refresh],
	);

	const createFolder = useCallback(
		async (parentPath: string, name: string) => {
			const target = joinPath(parentPath, name);
			try {
				await safeInvoke("mkdir_safe", {
					path: target,
					recursive: true,
				});
				refresh(parentPath);
				toast.success(`已新建文件夹 ${name}`);
				return target;
			} catch (error) {
				console.error("[useFileTreeMutations] createFolder failed:", error);
				toast.error(formatError("新建文件夹失败", error));
				return null;
			}
		},
		[refresh],
	);

	const rename = useCallback(
		async (oldPath: string, nextName: string) => {
			const trimmed = nextName.trim();
			if (!trimmed) {
				toast.error("名称不能为空");
				return null;
			}
			const parent = parentOf(oldPath);
			const dest = joinPath(parent, trimmed);
			if (dest === oldPath) return oldPath;
			try {
				await safeInvoke("move_file_safe", {
					src: oldPath,
					dest,
					create_dirs: false,
				});
				refresh(parent);
				return dest;
			} catch (error) {
				console.error("[useFileTreeMutations] rename failed:", error);
				toast.error(formatError("重命名失败", error));
				return null;
			}
		},
		[refresh],
	);

	const remove = useCallback(
		async (entryPath: string, entryName: string, isDir: boolean) => {
			const confirmed = await confirmDialog.danger(
				isDir
					? `确定删除文件夹「${entryName}」及其所有内容吗？此操作不可撤销。`
					: `确定删除文件「${entryName}」吗？此操作不可撤销。`,
				isDir ? "删除文件夹" : "删除文件",
			);
			if (!confirmed) return false;
			try {
				await safeInvoke("delete_file_safe", { path: entryPath });
				refresh(parentOf(entryPath));
				toast.success(`已删除 ${entryName}`);
				return true;
			} catch (error) {
				console.error("[useFileTreeMutations] remove failed:", error);
				toast.error(formatError("删除失败", error));
				return false;
			}
		},
		[refresh],
	);

	const reveal = useCallback(async (entryPath: string) => {
		try {
			await safeInvoke("reveal_file_safe", { path: entryPath });
		} catch (error) {
			console.error("[useFileTreeMutations] reveal failed:", error);
			toast.error(formatError("打开位置失败", error));
		}
	}, []);

	const copyPath = useCallback(async (entryPath: string) => {
		try {
			await navigator.clipboard.writeText(entryPath);
			toast.success("路径已复制");
		} catch (error) {
			console.error("[useFileTreeMutations] copyPath failed:", error);
			toast.error("复制失败");
		}
	}, []);

	return {
		createFile,
		createFolder,
		rename,
		remove,
		reveal,
		copyPath,
	};
}

function joinPath(parent: string, name: string): string {
	const stripped = parent.replace(/[\\/]+$/, "");
	const sep = stripped.includes("\\") && !stripped.includes("/") ? "\\" : "/";
	return `${stripped}${sep}${name}`;
}

function parentOf(p: string): string {
	const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
	if (idx <= 0) return p;
	return p.slice(0, idx);
}

function formatError(prefix: string, error: unknown): string {
	const msg = error instanceof Error ? error.message : String(error);
	return `${prefix}: ${msg}`;
}
