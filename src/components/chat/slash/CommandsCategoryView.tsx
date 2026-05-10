/**
 * Claude Code 风格斜杠命令 —— 二级分组菜单视图（T7.7）。
 *
 * 职责：
 * - 渲染「命令」类别下的所有命令（按 group 分区：会话 / 运行时 / 诊断 / 工作区 / 自定义）；
 * - 支持键盘导航（↑↓ 循环，Enter 选中），高亮态与现有菜单保持一致；
 * - 禁用态以降低对比度展示，Tooltip 通过 {@link DisabledTooltip} 延时出现；
 * - 对 `kind === "submenu"` 的命令提供 chevron 指示，点击/Enter 后交由调用方进入三级菜单。
 *
 * 约束：
 * - 不持有业务副作用，只通过 props.onSelect / onEnterSubmenu 抛事件；
 * - 不直接引用 `executor`，保持 UI 与业务解耦；
 * - 禁用态命令依然被渲染，但 `onSelect` 回调**不会被触发**（交互守护由本组件负责）。
 */

import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type {
	CommandAvailability,
	SlashCommandDefinition,
} from "../../../lib/slashCommands";
import { SLASH_MESSAGES } from "../../../lib/slashCommands";
import { DisabledTooltip } from "./DisabledTooltip";

// ---------------------------------------------------------------------------
// 分组标签
// ---------------------------------------------------------------------------

const GROUP_LABEL: Record<string, string> = {
	session: "会话管理",
	runtime: "运行时",
	inspect: "查看与诊断",
	workspace: "工作区",
	custom: "自定义",
};

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface CommandsCategoryViewItem {
	definition: SlashCommandDefinition;
	availability: CommandAvailability;
}

interface CommandsCategoryViewProps {
	items: CommandsCategoryViewItem[];
	activeId: string | null;
	onActiveChange: (id: string) => void;
	onSelect: (item: CommandsCategoryViewItem) => void;
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export function CommandsCategoryView({
	items,
	activeId,
	onActiveChange,
	onSelect,
}: CommandsCategoryViewProps) {
	const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

	// 活跃项变化时滚动到可见区域
	useEffect(() => {
		if (!activeId) return;
		const el = itemRefs.current[activeId];
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "nearest" });
		}
	}, [activeId]);

	const handleClick = useCallback(
		(item: CommandsCategoryViewItem) => {
			if (item.availability.state !== "available") return;
			onSelect(item);
		},
		[onSelect],
	);

	if (items.length === 0) {
		return (
			<div className="px-4 py-8 text-center">
				<p className="text-[13px] text-[#999] dark:text-[#666]">
					{SLASH_MESSAGES.empty.noMatch}
				</p>
			</div>
		);
	}

	// 按 group 分区（保持 Registry 的稳定序）
	const sections: Array<{ groupId: string; items: CommandsCategoryViewItem[] }> = [];
	let currentGroup: string | null = null;
	for (const item of items) {
		if (item.definition.group !== currentGroup) {
			currentGroup = item.definition.group;
			sections.push({ groupId: currentGroup, items: [] });
		}
		sections[sections.length - 1]!.items.push(item);
	}

	return (
		<div className="py-0.5">
			{sections.map((section) => (
				<div key={section.groupId}>
					<div className="px-4 py-1.5">
						<span className="text-[11px] font-medium text-[#aaa] dark:text-[#666]">
							{GROUP_LABEL[section.groupId] ?? section.groupId}
						</span>
						<span className="ml-1.5 text-[10px] text-[#ccc] dark:text-[#555]">
							{section.items.length}
						</span>
					</div>
					<div className="px-1.5 pb-1">
						{section.items.map((item) => {
							const { definition, availability } = item;
							const isSelected = definition.id === activeId;
							const disabled = availability.state !== "available";
							const isSubmenu = definition.kind === "submenu";
							const disabledReason =
								availability.state === "disabled" ? availability.reason : "";

							const button = (
								<div
									key={definition.id}
									ref={(el) => {
										itemRefs.current[definition.id] = el;
									}}
									role="option"
									aria-selected={isSelected}
									aria-disabled={disabled}
									tabIndex={-1}
									onClick={() => handleClick(item)}
									onMouseEnter={() => onActiveChange(definition.id)}
									className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-left select-none transition-all duration-[120ms] ease-out
                    ${isSelected ? "bg-[#f3f3f3] dark:bg-[#363636]" : ""}
                    ${disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer"}`}
								>
									<div
										className={`w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0 transition-all duration-[120ms]
                      ${
											isSelected && !disabled
												? "bg-surface dark:bg-[#404040] shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
												: "bg-[#f5f5f5] dark:bg-[#363636]"
										}`}
									>
										<span
											className={`font-mono text-[10px] transition-colors duration-[120ms]
                        ${isSelected && !disabled ? "text-[#555] dark:text-[#ccc]" : "text-[#999] dark:text-[#666]"}`}
										>
											/
										</span>
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-baseline gap-1.5">
											<span
												className={`text-[13px] font-medium truncate transition-colors duration-[120ms]
                          ${
													isSelected && !disabled
														? "text-[#1a1a1a] dark:text-[#eee]"
														: "text-[#666] dark:text-[#999]"
												}`}
											>
												{definition.name}
											</span>
											<span className="text-[10px] text-[#ccc] dark:text-[#555] font-mono truncate">
												/{definition.id}
											</span>
										</div>
										<div className="text-[11px] truncate text-[#bbb] dark:text-[#555]">
											{definition.description}
										</div>
									</div>
									{isSubmenu ? (
										<ChevronRight
											className={`w-3.5 h-3.5 flex-shrink-0 transition-all duration-[120ms] ease-out
                        ${isSelected && !disabled ? "text-[#999] dark:text-[#666] opacity-100" : "text-[#ccc] dark:text-[#555] opacity-60"}`}
										/>
									) : isSelected && !disabled ? (
										<span className="text-[10px] font-mono text-[#ccc] dark:text-[#555] flex-shrink-0">
											↵
										</span>
									) : null}
								</div>
							);

							return disabled && disabledReason ? (
								<DisabledTooltip key={definition.id} reason={disabledReason}>
									{button}
								</DisabledTooltip>
							) : (
								button
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}
