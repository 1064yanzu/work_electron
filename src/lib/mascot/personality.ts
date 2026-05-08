/**
 * personality — 三个 IP 的个性化话术池
 *
 * 设计意图：让每个 IP 的气泡文案有自己的语气，避免"千篇一律"。
 * - efficiency（聪明冷静）：简洁、目标导向
 * - cloud（温柔轻盈）：柔和、轻语
 * - leisure（松弛俏皮）：松弛、爱拖延但又靠谱
 *
 * selectLine 内置环形游标：每个 (id, key) 对维护一个独立游标，
 * 避免短期内重复同一句。
 *
 * 话术池数据本身放在 electron/shared/petPersonality.ts，主进程的
 * pet_generate_line handler 也复用这一份，避免前后端话术发散。
 */

import type { MascotSelection } from "../mascotStore";
import {
	PET_PERSONALITY_POOLS,
	resolvePoolKey as resolvePoolKeyShared,
	type BuiltinMascotId,
	type PersonalityPool,
} from "../../../electron/shared/petPersonality";
import { isBuiltinMascotId } from "./manifest";

export type { PersonalityPool, BuiltinMascotId };

// (id, key) → cursor，环形游标避免短期重复
const CURSORS = new Map<string, number>();

/** 把任意 selection 收敛到话术池支持的 builtin id（兜底 efficiency） */
function resolvePoolKey(id: MascotSelection): BuiltinMascotId {
	if (id !== "off" && isBuiltinMascotId(id)) return id;
	return resolvePoolKeyShared(typeof id === "string" ? id : null);
}

/**
 * 从指定 IP 的指定话术池里取一句。
 * - 同一 (id, key) 对会按顺序循环，避免连发同一句
 * - id === "off" 或 自定义桌宠时回退到 efficiency
 */
export function selectLine(
	id: MascotSelection,
	key: keyof PersonalityPool,
): string {
	const safeId = resolvePoolKey(id);
	const pool = PET_PERSONALITY_POOLS[safeId][key];
	if (!pool || pool.length === 0) return "";
	const cursorKey = `${safeId}:${key}`;
	const idx = CURSORS.get(cursorKey) ?? 0;
	const next = (idx + 1) % pool.length;
	CURSORS.set(cursorKey, next);
	return pool[idx];
}

/** 取整池（不挪游标）；用于 input chip 这种需要并列展示的地方 */
export function getPool(
	id: MascotSelection,
	key: keyof PersonalityPool,
): readonly string[] {
	const safeId = resolvePoolKey(id);
	return PET_PERSONALITY_POOLS[safeId][key];
}

export { PET_PERSONALITY_POOLS as PERSONALITY_POOLS };
