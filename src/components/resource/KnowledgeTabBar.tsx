/**
 * 「知识」区一级 tab 条：资料库 / 卡片。
 *
 * 视觉上刻意做成 pill 分段控件，与卡片视图内部的二级 tab（轻量文字 + 下划线）
 * 区分层级——一级用"块"，二级用"线"，两条 tab 上下叠放时不会互相打架。
 */
import {
	KNOWLEDGE_TABS,
	type KnowledgeTabId,
	rememberKnowledgeTab,
} from "./knowledgeSection";

interface KnowledgeTabBarProps {
	active: KnowledgeTabId;
	onSelect: (tab: KnowledgeTabId) => void;
}

export function KnowledgeTabBar({ active, onSelect }: KnowledgeTabBarProps) {
	return (
		<div
			role="tablist"
			aria-label="知识视图切换"
			className="flex shrink-0 items-center gap-1 px-3 pb-1.5 pt-2.5"
		>
			{KNOWLEDGE_TABS.map((tab) => {
				const isActive = tab.id === active;
				return (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={isActive}
						onClick={() => {
							rememberKnowledgeTab(tab.id);
							onSelect(tab.id);
						}}
						className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
							isActive
								? "bg-warm-200 text-text-primary dark:bg-white/[0.09]"
								: "text-text-muted hover:bg-warm-200/60 hover:text-text-primary dark:hover:bg-white/[0.05]"
						}`}
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
