// 命令面板主组件 — Cmd+K 唤起，键盘导航 + 模糊匹配 + 最近使用
//
// 设计：
// - 使用 Modal 而非 Dialog 元素，控制焦点 + a11y
// - 顶部输入框，下方分组列表；空查询时「最近使用」置顶
// - ↑↓ 选项 / Enter 触发 / Esc 关闭；键盘顺序与视觉顺序严格一致
// - 自研 fuzzy（见 fuzzy.ts）：标题命中高亮，keywords/描述降权
// - 不含 cmdk 依赖，符合 CLAUDE.md "尽量解耦"

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command, CornerDownLeft, History } from "lucide-react";
import {
	commandPaletteStore,
	useCommandPaletteStoreSelector,
} from "../../lib/stores/commandPaletteStore";
import { cn } from "../../lib/utils";
import { FocusTrap } from "../ui/FocusTrap";
import { scoreCommandItem } from "./fuzzy";
import type { CommandItem } from "./types";

interface CommandPaletteProps {
	commands: CommandItem[];
	isOpen: boolean;
	initialQuery?: string;
}

const RECENT_GROUP = "最近使用";

/** 按命中下标切片高亮标题 */
function HighlightedTitle({
	title,
	indices,
}: {
	title: string;
	indices: number[];
}) {
	if (indices.length === 0) return <>{title}</>;
	const hitSet = new Set(indices);
	const segments: Array<{ text: string; hit: boolean }> = [];
	for (let i = 0; i < title.length; i++) {
		const hit = hitSet.has(i);
		const last = segments[segments.length - 1];
		if (last && last.hit === hit) {
			last.text += title[i];
		} else {
			segments.push({ text: title[i], hit });
		}
	}
	return (
		<>
			{segments.map((seg, i) =>
				seg.hit ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: 纯展示切片，顺序稳定
					<span key={i} className="text-primary font-semibold">
						{seg.text}
					</span>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: 纯展示切片，顺序稳定
					<span key={i}>{seg.text}</span>
				),
			)}
		</>
	);
}

export function CommandPalette({
	commands,
	isOpen,
	initialQuery = "",
}: CommandPaletteProps) {
	const [query, setQuery] = useState(initialQuery);
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const recentIds = useCommandPaletteStoreSelector((s) => s.recentIds);

	// 打开时重置 + 聚焦输入框
	useEffect(() => {
		if (isOpen) {
			setQuery(initialQuery);
			setActiveIndex(0);
			// 等动画下一帧再聚焦
			requestAnimationFrame(() => inputRef.current?.focus());
		}
	}, [isOpen, initialQuery]);

	// 过滤 + 排序 + 标题命中下标
	const { grouped, flatList, titleIndices } = useMemo(() => {
		const indicesMap = new Map<string, number[]>();
		const scored = commands
			.map((c) => ({ command: c, result: scoreCommandItem(c, query) }))
			.filter(
				(
					x,
				): x is {
					command: CommandItem;
					result: NonNullable<typeof x.result>;
				} => x.result !== null,
			);
		scored.sort((a, b) => b.result.score - a.result.score);
		for (const { command, result } of scored) {
			if (result.titleIndices.length > 0) {
				indicesMap.set(command.id, result.titleIndices);
			}
		}
		const matched = scored.map((x) => x.command);

		const groups: Array<[string, CommandItem[]]> = [];
		if (!query && recentIds.length > 0) {
			// 空查询：最近使用置顶，且不在原分组中重复出现
			const byId = new Map(matched.map((c) => [c.id, c]));
			const recentItems = recentIds
				.map((id) => byId.get(id))
				.filter((c): c is CommandItem => Boolean(c));
			if (recentItems.length > 0) {
				groups.push([RECENT_GROUP, recentItems]);
			}
			const recentSet = new Set(recentItems.map((c) => c.id));
			const rest = matched.filter((c) => !recentSet.has(c.id));
			const map = new Map<string, CommandItem[]>();
			for (const item of rest) {
				if (!map.has(item.group)) map.set(item.group, []);
				map.get(item.group)?.push(item);
			}
			groups.push(...Array.from(map.entries()));
		} else {
			const map = new Map<string, CommandItem[]>();
			for (const item of matched) {
				if (!map.has(item.group)) map.set(item.group, []);
				map.get(item.group)?.push(item);
			}
			groups.push(...Array.from(map.entries()));
		}

		// flat list 与渲染顺序严格一致（键盘导航依赖）
		const flat = groups.flatMap(([, items]) => items);
		return { grouped: groups, flatList: flat, titleIndices: indicesMap };
	}, [commands, query, recentIds]);

	// 选中项越界保护
	useEffect(() => {
		if (activeIndex >= flatList.length) {
			setActiveIndex(Math.max(0, flatList.length - 1));
		}
	}, [activeIndex, flatList.length]);

	// 滚动到选中项
	useEffect(() => {
		if (!listRef.current) return;
		const el = listRef.current.querySelector<HTMLElement>(
			`[data-cmd-index="${activeIndex}"]`,
		);
		el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [activeIndex]);

	const handleClose = useCallback(() => {
		commandPaletteStore.close();
	}, []);

	const handleExecute = useCallback(
		async (item: CommandItem) => {
			commandPaletteStore.markRecent(item.id);
			try {
				await item.action();
			} catch (e) {
				console.error("[CommandPalette] action failed:", e);
			}
			if (!item.keepOpen) handleClose();
		},
		[handleClose],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setActiveIndex((i) => Math.min(i + 1, flatList.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setActiveIndex((i) => Math.max(i - 1, 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				const target = flatList[activeIndex];
				if (target) handleExecute(target);
			} else if (e.key === "Escape") {
				e.preventDefault();
				handleClose();
			}
		},
		[activeIndex, flatList, handleExecute, handleClose],
	);

	// 渲染项的全局序号（与 flatList 对齐）
	let renderIndex = -1;

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-[9999] flex items-start justify-center pt-[10vh] px-4"
			role="dialog"
			aria-modal="true"
			aria-label="命令面板"
			onKeyDown={handleKeyDown}
		>
			{/* Backdrop — 暖色蒙版，不用毛玻璃避免 impeccable glassmorphism 违规 */}
			<div
				className="absolute inset-0 bg-cream-900/30 animate-in fade-in duration-150"
				onClick={handleClose}
				aria-hidden="true"
			/>

			<FocusTrap active={isOpen}>
				<div className="relative w-full max-w-[640px] rounded-2xl border border-border bg-surface shadow-[0_20px_50px_-12px_rgb(26_26_25/0.25)] animate-in fade-in slide-in-from-top-4 duration-150 overflow-hidden">
					{/* 输入框 */}
					<div className="flex items-center gap-3 px-5 py-4 border-b border-border">
						<Command
							className="w-4 h-4 text-text-muted shrink-0"
							strokeWidth={1.5}
						/>
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								setActiveIndex(0);
							}}
							placeholder="搜索命令、项目、设置…"
							className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-light focus:outline-none"
							aria-label="命令面板输入框"
							aria-autocomplete="list"
							aria-controls="command-palette-list"
							aria-activedescendant={
								flatList[activeIndex]?.id
									? `cmd-item-${flatList[activeIndex].id}`
									: undefined
							}
						/>
						<kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium text-text-muted bg-warm-200">
							ESC
						</kbd>
					</div>

					{/* 列表 */}
					<div
						ref={listRef}
						id="command-palette-list"
						role="listbox"
						className="max-h-[420px] overflow-y-auto py-2"
					>
						{grouped.length === 0 ? (
							<div className="px-5 py-10 text-center">
								<p className="text-sm text-text-muted">没有匹配的命令</p>
								<p className="mt-1 text-xs text-text-light">
									试试搜索 "新建" / "设置" / "主题"
								</p>
							</div>
						) : (
							grouped.map(([groupName, groupItems]) => (
								<div key={groupName} className="mb-2 last:mb-0">
									<div className="px-5 pt-2 pb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
										<span className="flex items-center gap-1">
											{groupName === RECENT_GROUP && (
												<History className="w-3 h-3" strokeWidth={1.5} />
											)}
											{groupName}
										</span>
										{groupName === RECENT_GROUP && (
											<button
												type="button"
												onClick={() => commandPaletteStore.clearRecent()}
												className="normal-case tracking-normal font-normal text-[11px] text-text-light hover:text-text-secondary transition-colors"
											>
												清除
											</button>
										)}
									</div>
									{groupItems.map((item) => {
										renderIndex += 1;
										const flatIdx = renderIndex;
										const isActive = flatIdx === activeIndex;
										const Icon = item.icon;
										const indices = query
											? (titleIndices.get(item.id) ?? [])
											: [];
										return (
											<button
												key={`${groupName}-${item.id}`}
												id={`cmd-item-${item.id}`}
												type="button"
												data-cmd-index={flatIdx}
												role="option"
												aria-selected={isActive}
												onClick={() => handleExecute(item)}
												onMouseMove={() => setActiveIndex(flatIdx)}
												className={cn(
													"w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors",
													isActive
														? "bg-warm-200 text-text-primary"
														: "text-text-secondary hover:bg-warm-200/50",
												)}
											>
												{Icon && (
													<Icon
														className={cn(
															"w-4 h-4 shrink-0",
															isActive
																? "text-text-primary"
																: "text-text-muted",
														)}
														strokeWidth={1.5}
													/>
												)}
												<div className="flex-1 min-w-0">
													<div
														className={cn(
															"text-sm font-medium truncate",
															isActive ? "text-text-primary" : "",
														)}
													>
														<HighlightedTitle
															title={item.title}
															indices={indices}
														/>
													</div>
													{item.description && (
														<div className="text-xs text-text-muted truncate">
															{item.description}
														</div>
													)}
												</div>
												{item.shortcut && (
													<div className="hidden sm:flex items-center gap-1 shrink-0">
														{item.shortcut.map((key, i) => (
															<kbd
																key={i}
																className="px-1.5 py-0.5 rounded-md text-[11px] font-medium text-text-muted bg-warm-200"
															>
																{key}
															</kbd>
														))}
													</div>
												)}
												{isActive && (
													<CornerDownLeft
														className="w-3.5 h-3.5 text-text-muted shrink-0"
														strokeWidth={1.5}
													/>
												)}
											</button>
										);
									})}
								</div>
							))
						)}
					</div>

					{/* 底部 hint */}
					<div className="flex items-center justify-between px-5 py-2.5 border-t border-border bg-warm-50/50">
						<div className="flex items-center gap-3 text-[11px] text-text-muted">
							<span className="flex items-center gap-1">
								<kbd className="px-1.5 py-0.5 rounded text-[11px] bg-warm-200">
									↑↓
								</kbd>
								<span>选择</span>
							</span>
							<span className="flex items-center gap-1">
								<kbd className="px-1.5 py-0.5 rounded text-[11px] bg-warm-200">
									⏎
								</kbd>
								<span>执行</span>
							</span>
							<span className="flex items-center gap-1">
								<kbd className="px-1.5 py-0.5 rounded text-[11px] bg-warm-200">
									ESC
								</kbd>
								<span>关闭</span>
							</span>
						</div>
						<div className="text-[11px] text-text-light">
							{flatList.length} / {commands.length}
						</div>
					</div>
				</div>
			</FocusTrap>
		</div>
	);
}
