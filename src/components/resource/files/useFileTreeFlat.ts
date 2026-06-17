/**
 * 文件树扁平化 hook
 *
 * 将递归树结构扁平化为一维 FlatRow[]，供虚拟化列表消费。
 * 只在 entriesByDir / expandedDirs / editing 变化时重新计算。
 */
import { useMemo } from "react";
import type { FileEntry } from "./FileTreeNode";

/** 扁平化后的行类型 */
export type FlatRow =
	| { kind: "node"; entry: FileEntry; level: number }
	| {
			kind: "create";
			parentPath: string;
			level: number;
			type: "file" | "folder";
	  };

type EditingState =
	| { mode: "rename"; targetPath: string }
	| {
			mode: "create";
			parentPath: string;
			level: number;
			type: "file" | "folder";
	  };

/**
 * 把递归树拍平。
 *
 * - entriesByDir: Map<dirPath, FileEntry[]> 每个目录的直接子项（已排序）
 * - expandedDirs: 展开的目录集合
 * - editing: 当前正在新建的行
 */
export function useFileTreeFlat(
	entriesByDir: Map<string, FileEntry[]>,
	expandedDirs: Set<string>,
	projectPath: string | null,
	editing: EditingState | null,
): FlatRow[] {
	return useMemo(() => {
		if (!projectPath) return [];
		const rows: FlatRow[] = [];

		function walk(parentPath: string, level: number) {
			const items = entriesByDir.get(parentPath);
			const isCreatingHere =
				editing?.mode === "create" && editing.parentPath === parentPath;

			if (!items) {
				// 目录还没加载，但有新建行要显示
				if (isCreatingHere) {
					rows.push({
						kind: "create",
						parentPath,
						level: editing.level,
						type: editing.type,
					});
				}
				return;
			}

			for (const entry of items) {
				rows.push({ kind: "node", entry, level });
				if (entry.isDir && expandedDirs.has(entry.path)) {
					walk(entry.path, level + 1);
				}
			}

			if (isCreatingHere) {
				rows.push({
					kind: "create",
					parentPath,
					level: editing.level,
					type: editing.type,
				});
			}
		}

		walk(projectPath, 0);
		return rows;
	}, [entriesByDir, expandedDirs, projectPath, editing]);
}
