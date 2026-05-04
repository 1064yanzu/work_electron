// i18n 入口 — 提供 t() 函数 + 类型化 key 路径
//
// 使用：
//   import { t } from "@/i18n";
//   t("dashboard.greeting.morning"); // "早上好"
//
// 设计选择：
// 1. 不引 i18next，因为只有中文 + 简单字典即可
// 2. 用点路径 key（"dashboard.greeting.morning"）而非嵌套对象访问
// 3. 函数 value 自动调用：t("chat.dateGroup.daysAgo", 3) → "3 天前"
// 4. 找不到 key 时返回 key 本身（开发者立刻看见漏配）

import { zhCN } from "./zh-CN";

type Primitive = string | number | boolean;

/** 解析点路径为字典里的值 */
function resolve(key: string): unknown {
	const parts = key.split(".");
	let cursor: unknown = zhCN;
	for (const part of parts) {
		if (cursor && typeof cursor === "object" && part in cursor) {
			cursor = (cursor as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}
	return cursor;
}

/**
 * 获取本地化文案。
 * - 命中字符串：直接返回
 * - 命中函数：调用 fn(...args) 返回结果
 * - 未命中：返回 key 本身（让开发者立即发现漏配）
 */
export function t(key: string, ...args: Primitive[]): string {
	const value = resolve(key);
	if (typeof value === "string") return value;
	if (typeof value === "function") {
		try {
			const result = (value as (...a: Primitive[]) => unknown)(...args);
			return typeof result === "string" ? result : key;
		} catch {
			return key;
		}
	}
	return key;
}

/** 检查 key 是否存在（开发期 lint 用） */
export function hasKey(key: string): boolean {
	return resolve(key) !== undefined;
}

export { zhCN };
