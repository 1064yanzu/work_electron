/**
 * 路径规范化工具
 * 用于比较来自不同来源的项目路径（本地线程 vs 外部 CLI 历史）
 */

/** 规范化路径：移除尾部斜杠、统一分隔符 */
export function normalizePath(path: string): string {
	// 统一为 POSIX 分隔符
	let normalized = path.replace(/\\/g, '/');
	// 移除尾部斜杠（根路径 "/" 除外）
	if (normalized.length > 1 && normalized.endsWith('/')) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

/** 比较两个路径是否等价（规范化后比较） */
export function pathsEqual(a: string, b: string): boolean {
	return normalizePath(a) === normalizePath(b);
}

/** 从规范化路径中查找匹配的 key（用于 Map 查找） */
export function findMatchingPathKey<T>(
	map: Map<string, T>,
	targetPath: string,
): string | null {
	const normalizedTarget = normalizePath(targetPath);
	for (const key of map.keys()) {
		if (normalizePath(key) === normalizedTarget) {
			return key;
		}
	}
	return null;
}
