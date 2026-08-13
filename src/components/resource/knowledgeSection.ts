/**
 * 左栏「知识」区：资料库 / 卡片 两个视图合成一个 rail 入口。
 *
 * 背景：活动栏平铺入口时，「资料库 / 卡片」其实是同一类东西
 * （沉淀下来的知识），各占一格既拉长了 rail，也没表达出它们的亲缘关系。
 * 合并后 rail 只剩 4 个入口，二者改由面板顶部的一条 pill tab 切换。
 *
 * `leftSidebarView` 的取值**保持不变**（仍是 "sources" / "cards"），
 * 所以所有依赖这些值的地方（命令面板、ResourceSidebar 分支、深链）零改动。
 */

export const KNOWLEDGE_TABS = [
	{ id: "sources", label: "资料库" },
	{ id: "cards", label: "卡片" },
] as const;

export type KnowledgeTabId = (typeof KNOWLEDGE_TABS)[number]["id"];

/** 资料库的二级页：从资料库钻进去的，仍算在「知识」区里（rail 保持高亮） */
const KNOWLEDGE_SUB_VIEWS = ["detail", "research"];

const STORAGE_KEY = "left_sidebar_knowledge_tab";

/** 只有三个主 tab 才显示 tab 条——二级页有自己的返回，再挂一条 tab 会打架 */
export function isKnowledgeTabView(view: string): view is KnowledgeTabId {
	return KNOWLEDGE_TABS.some((tab) => tab.id === view);
}

/** rail 上「知识」入口是否高亮（含二级页） */
export function isKnowledgeSectionView(view: string): boolean {
	return isKnowledgeTabView(view) || KNOWLEDGE_SUB_VIEWS.includes(view);
}

/** 从 rail 点进「知识」时回到上次看的那个 tab */
export function getLastKnowledgeTab(): KnowledgeTabId {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw && isKnowledgeTabView(raw)) return raw;
	} catch {
		// localStorage 不可用时用默认值即可
	}
	return "sources";
}

export function rememberKnowledgeTab(tab: KnowledgeTabId): void {
	try {
		localStorage.setItem(STORAGE_KEY, tab);
	} catch {
		// 记不住就下次回到默认 tab，不影响功能
	}
}
