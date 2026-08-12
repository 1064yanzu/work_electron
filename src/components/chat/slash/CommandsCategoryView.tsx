/**
 * Claude Code 风格斜杠命令 —— 二级分组菜单视图（T7.7 + 2026-05 字符高亮）。
 *
 * 职责：
 * - 渲染「命令」类别下的所有命令（按 group 分区：会话 / 运行时 / 诊断 / 工作区 / 自定义）；
 * - 支持键盘导航（↑↓ 循环，Enter 选中），高亮态与现有菜单保持一致；
 * - **2026-05**：根据 matchFilter 返回的 matchPositions 在 name 中高亮命中字符；
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
	recent: "最近使用",
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
	/**
	 * 在 `definition.name`（小写后）上的命中字符位置数组；
	 * 由 `matchFilter` 返回的 `matchPositions` 透传过来。
	 * 空数组表示不渲染高亮（如仅在 id 或 desc 上命中时）。
	 */
	matchPositions?: readonly number[];
	/**
	 * 自定义分区 id；若设置则覆盖 `definition.group` 进行分组。
	 * 主要用于"最近使用"虚拟分组（sectionId === "recent"）。
	 */
	sectionId?: string;
}

interface CommandsCategoryViewProps {
	items: CommandsCategoryViewItem[];
	activeId: string | null;
	onActiveChange: (id: string) => void;
	onSelect: (item: CommandsCategoryViewItem) => void;
}

// ---------------------------------------------------------------------------
// 字符高亮辅助
// ---------------------------------------------------------------------------

/**
 * 把 `text` 按 `positions` 拆成普通片段与高亮片段。
 *
 * positions 必须升序、范围在 `[0, text.length)`。
 * 输出为交替的 plain / highlight 段，UI 渲染时按 isHighlight 决定样式。
 */
function splitByPositions(
	text: string,
	positions: readonly number[],
): Array<{ text: string; isHighlight: boolean }> {
	if (!positions || positions.length === 0) {
		return [{ text, isHighlight: false }];
	}
	const out: Array<{ text: string; isHighlight: boolean }> = [];
	let cursor = 0;
	const posSet = new Set(positions);
	let buf = "";
	let bufHighlight = false;
	for (let i = 0; i < text.length; i++) {
		const isHl = posSet.has(i);
		if (i === 0) {
			buf = text[i] ?? "";
			bufHighlight = isHl;
			continue;
		}
		if (isHl === bufHighlight) {
			buf += text[i] ?? "";
		} else {
			out.push({ text: buf, isHighlight: bufHighlight });
			buf = text[i] ?? "";
			bufHighlight = isHl;
		}
	}
	if (buf) out.push({ text: buf, isHighlight: bufHighlight });
	// cursor used below to silence lint; keep simple linear walk above
	void cursor;
	return out;
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
				<p className="text-[13px] text-text-muted">
					{SLASH_MESSAGES.empty.noMatch}
				</p>
			</div>
		);
	}

	// 按 group 分区（保持 Registry 的稳定序）；sectionId 优先于 definition.group
	const sections: Array<{
		groupId: string;
		items: CommandsCategoryViewItem[];
	}> = [];
	let currentGroup: string | null = null;
	for (const item of items) {
		const groupId = item.sectionId ?? item.definition.group;
		if (groupId !== currentGroup) {
			currentGroup = groupId;
			sections.push({ groupId, items: [] });
		}
		sections[sections.length - 1]!.items.push(item);
	}

	return (
		<div className="py-0.5">
			{sections.map((section) => (
				<div key={section.groupId}>
					<div className="px-4 py-1.5">
						<span className="text-[11px] font-medium text-text-light">
							{GROUP_LABEL[section.groupId] ?? section.groupId}
						</span>
						<span className="ml-1.5 text-[10px] text-text-light">
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
							// matchPositions 是相对 lowerName 的位置；这里用原 name 的相同位置去渲染
							// （toLowerCase 不会改变字符数与 index 对齐）。
							const nameSegments = splitByPositions(
								definition.name,
								item.matchPositions ?? [],
							);

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
									className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-left select-none transition-all duration-120 ease-out
                    ${isSelected ? "bg-warm-200" : ""}
                    ${disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer"}`}
								>
									<div
										className={`w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0 transition-all duration-120
                      ${
												isSelected && !disabled
													? "bg-surface dark:bg-warm-800 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
													: "bg-warm-200"
											}`}
									>
										<span
											className={`font-mono text-[10px] transition-colors duration-120
                        ${isSelected && !disabled ? "text-text-secondary" : "text-text-muted"}`}
										>
											/
										</span>
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-baseline gap-1.5">
											<span
												className={`text-[13px] font-medium truncate transition-colors duration-120
                          ${
														isSelected && !disabled
															? "text-text-primary"
															: "text-text-secondary"
													}`}
											>
												{nameSegments.map((seg, i) =>
													seg.isHighlight ? (
														// biome-ignore lint/suspicious/noArrayIndexKey: 索引在段数组里稳定
														<mark
															key={i}
															className="bg-transparent text-primary dark:text-primary font-semibold"
														>
															{seg.text}
														</mark>
													) : (
														// biome-ignore lint/suspicious/noArrayIndexKey: 索引在段数组里稳定
														<span key={i}>{seg.text}</span>
													),
												)}
											</span>
											<span className="text-[10px] text-text-light font-mono truncate">
												/{definition.id}
											</span>
										</div>
										<div className="text-[11px] truncate text-text-light">
											{definition.description}
										</div>
									</div>
									{isSubmenu ? (
										<ChevronRight
											className={`w-3.5 h-3.5 flex-shrink-0 transition-all duration-120 ease-out
                        ${isSelected && !disabled ? "text-text-muted opacity-100" : "text-text-light opacity-60"}`}
										/>
									) : isSelected && !disabled ? (
										<span className="text-[10px] font-mono text-text-light flex-shrink-0">
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
