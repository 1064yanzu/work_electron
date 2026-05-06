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
 */

import type { MascotSelection } from "../mascotStore";
import { isBuiltinMascotId, type BuiltinMascotId } from "./manifest";

export interface PersonalityPool {
	/** < 30s 思考态 */
	thinkingShort: string[];
	/** 30s ~ 2min 思考态 */
	thinkingMedium: string[];
	/** > 5min 思考态 */
	thinkingLong: string[];
	/** 完成 */
	done: string[];
	/** 报错 */
	error: string[];
	/** 等待审批 */
	approval: string[];
	/** 当天首次见到（启动后第一次问候） */
	greetFirstTimeToday: string[];
	/** 连续完成激励（连成 3+ 时拼前缀） */
	encouragement: string[];
	/** 连续报错安抚 */
	consolation: string[];
	/** 输入气泡的 quick chip */
	quickSuggestions: string[];
	/** 切换皮肤后第一句问候 */
	contextSwitchSkin: string[];
}

const EFFICIENCY: PersonalityPool = {
	thinkingShort: ["让我想想", "稍等", "正在算", "嗯，确认下"],
	thinkingMedium: [
		"让我再算算",
		"正在分支里看一看",
		"在确认每一步",
		"在拆解这个问题",
	],
	thinkingLong: [
		"这题有点意思，再给我一会儿",
		"信息有点多，让我整理一下",
		"我需要把上下文都过一遍",
	],
	done: ["搞定了", "一气呵成", "✓ 已完成", "完事了，要看结果吗？"],
	error: ["出了点状况", "卡了一下，可以一起看吗？", "刚才那步失败了"],
	approval: ["这一步要继续吗？", "需要你拍个板", "等你决定一下"],
	greetFirstTimeToday: [
		"早，开始今天的工作了？",
		"嗨，准备好了吗？",
		"今天我们做点什么？",
	],
	encouragement: ["效率不错", "三连击 ✓", "节奏稳了", "今天状态在线"],
	consolation: ["先别急", "失败是常事，再来一次", "我们慢慢调"],
	quickSuggestions: ["继续", "暂停一下", "下一步是什么？"],
	contextSwitchSkin: ["切到效率模式", "进入工作状态"],
};

const CLOUD: PersonalityPool = {
	thinkingShort: ["稍等我一下", "我想想看~", "嗯…", "正在感受这个问题"],
	thinkingMedium: [
		"再让我想想看",
		"稍等我一下下，马上就好",
		"在慢慢梳理~",
		"让我把它理顺一下",
	],
	thinkingLong: [
		"嗯…这件事有点复杂呢",
		"再给我一些时间整理~",
		"我想再想得周到一点",
	],
	done: ["好啦~", "搞定，给你看看", "完成啦 ✿", "诶嘿，做好了"],
	error: [
		"呜，出了点小状况",
		"嗯…这里没成功，要不要一起看看？",
		"失败了一下下",
	],
	approval: ["要继续吗？", "你来决定一下吧~", "等你说一声"],
	greetFirstTimeToday: [
		"早呀~ 今天感觉怎么样",
		"嗨，又见面啦",
		"早安，今天我们一起加油呀",
	],
	encouragement: ["你好棒呀✨", "节奏好顺~", "继续保持哦"],
	consolation: ["没关系的~", "慢慢来，别急", "失败也很可爱啦"],
	quickSuggestions: ["还在吗？", "继续吧~", "要不要休息一下"],
	contextSwitchSkin: ["云端模式上线啦~", "我来陪你了~"],
};

const LEISURE: PersonalityPool = {
	thinkingShort: ["想想想…", "嗯", "再想想哈", "稍稍等"],
	thinkingMedium: ["嗯，再想想哈", "思考思考", "让我躺着想想", "再咕嘟一会儿"],
	thinkingLong: [
		"这事儿得慢慢来",
		"想了挺久了，还在想",
		"急啥，我要再咕嘟会儿",
	],
	done: ["完事儿~", "可以摸鱼了", "成", "Done，下一个"],
	error: ["唉，不顺", "嗯…翻车了", "歇会儿再来一次？"],
	approval: ["你定？", "要不你来决定", "等你一声哈"],
	greetFirstTimeToday: ["哟，又来啦", "早安老板", "今天也是要努力的一天吗"],
	encouragement: ["可以可以", "上头了上头了", "继续整"],
	consolation: ["别急别急", "失败也很正常啦", "歇会儿再说"],
	quickSuggestions: ["继续摸", "再来一个", "歇歇？"],
	contextSwitchSkin: ["切到摸鱼模式", "嗨呀，又见面了"],
};

const POOLS: Record<BuiltinMascotId, PersonalityPool> = {
	efficiency: EFFICIENCY,
	cloud: CLOUD,
	leisure: LEISURE,
};

// (id, key) → cursor，环形游标避免短期重复
const CURSORS = new Map<string, number>();

/** 把任意 selection 收敛到话术池支持的 builtin id（兜底 efficiency） */
function resolvePoolKey(id: MascotSelection): BuiltinMascotId {
	if (id !== "off" && isBuiltinMascotId(id)) return id;
	return "efficiency";
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
	const pool = POOLS[safeId][key];
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
	return POOLS[safeId][key];
}

export { POOLS as PERSONALITY_POOLS };
