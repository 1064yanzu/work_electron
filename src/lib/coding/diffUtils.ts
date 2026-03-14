/**
 * Diff 行级统计工具
 * 基于简单的行比较算法计算 additions/deletions
 */

export interface DiffLineStats {
	additions: number;
	deletions: number;
}

/**
 * 计算两段文本之间的行级变更统计
 * 使用简单的行集合比较（非 LCS，但比纯行数差异更准确）
 */
export function computeLineStats(
	oldContent: string,
	newContent: string,
): DiffLineStats {
	if (!oldContent && !newContent) return { additions: 0, deletions: 0 };
	if (!oldContent)
		return { additions: newContent.split("\n").length, deletions: 0 };
	if (!newContent)
		return { additions: 0, deletions: oldContent.split("\n").length };

	const oldLines = oldContent.split("\n");
	const newLines = newContent.split("\n");

	// 构建行出现次数 map
	const oldMap = new Map<string, number>();
	for (const line of oldLines) {
		oldMap.set(line, (oldMap.get(line) || 0) + 1);
	}

	const newMap = new Map<string, number>();
	for (const line of newLines) {
		newMap.set(line, (newMap.get(line) || 0) + 1);
	}

	// 计算新增行：在 newLines 中出现次数 > oldLines 中的
	let additions = 0;
	for (const [line, count] of newMap) {
		const oldCount = oldMap.get(line) || 0;
		if (count > oldCount) {
			additions += count - oldCount;
		}
	}

	// 计算删除行：在 oldLines 中出现次数 > newLines 中的
	let deletions = 0;
	for (const [line, count] of oldMap) {
		const newCount = newMap.get(line) || 0;
		if (count > newCount) {
			deletions += count - newCount;
		}
	}

	return { additions, deletions };
}
