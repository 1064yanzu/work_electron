/**
 * 桌宠人设话术池（前后端共享）
 *
 * 三个内置 IP 的话术池（efficiency / cloud / leisure）。
 * 前端 src/lib/mascot/personality.ts 与主进程 pet_generate_line 共享同一份池数据。
 *
 * 后续接入 LLM 后，未启用 LLM 路径仍走这份池兜底。
 */

export type BuiltinMascotId = "efficiency" | "cloud" | "leisure";

export interface PersonalityPool {
	thinkingShort: string[];
	thinkingMedium: string[];
	thinkingLong: string[];
	done: string[];
	error: string[];
	approval: string[];
	greetFirstTimeToday: string[];
	encouragement: string[];
	consolation: string[];
	quickSuggestions: string[];
	contextSwitchSkin: string[];
}

export type PersonalityKey = keyof PersonalityPool;

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

export const PET_PERSONALITY_POOLS: Record<BuiltinMascotId, PersonalityPool> = {
	efficiency: EFFICIENCY,
	cloud: CLOUD,
	leisure: LEISURE,
};

const VALID_BUILTIN_IDS: ReadonlySet<string> = new Set([
	"efficiency",
	"cloud",
	"leisure",
]);

/** 把任意 selection 收敛到话术池支持的 builtin id（兜底 efficiency） */
export function resolvePoolKey(id: string | null | undefined): BuiltinMascotId {
	if (id && VALID_BUILTIN_IDS.has(id)) return id as BuiltinMascotId;
	return "efficiency";
}

/** 从指定 IP / key 池中随机选一句（无重复保证；call site 自己保证不重复） */
export function pickPetLineFromPool(
	key: PersonalityKey | string,
	mascotId?: string | null,
): string {
	const pool = PET_PERSONALITY_POOLS[resolvePoolKey(mascotId)];
	const list = pool[(key as PersonalityKey) ?? "done"];
	if (!list || list.length === 0) return "";
	return list[Math.floor(Math.random() * list.length)];
}
