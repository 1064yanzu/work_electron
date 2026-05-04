// 命令面板主组件 — Cmd+K 唤起，键盘导航 + 模糊匹配
//
// 设计：
// - 使用 Modal 而非 Dialog 元素，控制焦点 + a11y
// - 顶部输入框，下方分组列表
// - ↑↓ 选项 / Enter 触发 / Esc 关闭
// - 简单子串匹配（title + description + keywords），不引第三方 fuzzy 库
// - 不含 cmdk 依赖，~150 行自研，符合 CLAUDE.md "尽量解耦"

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command, CornerDownLeft } from "lucide-react";
import { commandPaletteStore } from "../../lib/stores/commandPaletteStore";
import { cn } from "../../lib/utils";
import { FocusTrap } from "../ui/FocusTrap";
import type { CommandItem } from "./types";

interface CommandPaletteProps {
	commands: CommandItem[];
	isOpen: boolean;
	initialQuery?: string;
}

function scoreCommand(item: CommandItem, query: string): number {
	if (!query) return 1;
	const q = query.toLowerCase();
	const title = item.title.toLowerCase();
	const desc = (item.description || "").toLowerCase();
	const keywords = (item.keywords || []).join(" ").toLowerCase();
	const group = item.group.toLowerCase();

	// 完全匹配 title 起始
	if (title.startsWith(q)) return 100;
	// 子串命中 title
	if (title.includes(q)) return 80;
	// 子串命中 keywords
	if (keywords.includes(q)) return 60;
	// 子串命中 description
	if (desc.includes(q)) return 40;
	// 子串命中 group
	if (group.includes(q)) return 20;

	// 字符序列匹配 (fuzzy lite)
	let qi = 0;
	for (let i = 0; i < title.length && qi < q.length; i++) {
		if (title[i] === q[qi]) qi++;
	}
	if (qi === q.length) return 10;

	return 0;
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

	// 打开时重置 + 聚焦输入框
	useEffect(() => {
		if (isOpen) {
			setQuery(initialQuery);
			setActiveIndex(0);
			// 等动画下一帧再聚焦
			requestAnimationFrame(() => inputRef.current?.focus());
		}
	}, [isOpen, initialQuery]);

	// 过滤 + 排序
	const filtered = useMemo(() => {
		const scored = commands
			.map((c) => ({ command: c, score: scoreCommand(c, query) }))
			.filter((x) => x.score > 0);
		scored.sort((a, b) => b.score - a.score);
		return scored.map((x) => x.command);
	}, [commands, query]);

	// 按 group 分组（保留排序）
	const grouped = useMemo(() => {
		const map = new Map<string, CommandItem[]>();
		for (const item of filtered) {
			if (!map.has(item.group)) map.set(item.group, []);
			map.get(item.group)?.push(item);
		}
		return Array.from(map.entries());
	}, [filtered]);

	// flat list 给键盘导航使用
	const flatList = filtered;

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
				className="absolute inset-0 bg-[rgba(26,26,25,0.32)] animate-in fade-in duration-150"
				onClick={handleClose}
				aria-hidden="true"
			/>

			<FocusTrap active={isOpen}>
				<div className="relative w-full max-w-[640px] rounded-2xl border border-border bg-surface shadow-[0_20px_50px_-12px_rgb(26_26_25/0.25)] animate-in fade-in slide-in-from-top-4 duration-200 overflow-hidden">
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
							className="flex-1 bg-transparent text-[14px] text-text-primary placeholder:text-text-light focus:outline-none"
							aria-label="命令面板输入框"
							aria-autocomplete="list"
							aria-controls="command-palette-list"
							aria-activedescendant={
								flatList[activeIndex]?.id
									? `cmd-item-${flatList[activeIndex].id}`
									: undefined
							}
						/>
						<kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-text-muted bg-warm-200">
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
									<div className="px-5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
										{groupName}
									</div>
									{groupItems.map((item) => {
										const flatIdx = flatList.indexOf(item);
										const isActive = flatIdx === activeIndex;
										const Icon = item.icon;
										return (
											<button
												key={item.id}
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
															"text-[13px] font-medium truncate",
															isActive ? "text-text-primary" : "",
														)}
													>
														{item.title}
													</div>
													{item.description && (
														<div className="text-[11.5px] text-text-muted truncate">
															{item.description}
														</div>
													)}
												</div>
												{item.shortcut && (
													<div className="hidden sm:flex items-center gap-1 shrink-0">
														{item.shortcut.map((key, i) => (
															<kbd
																key={i}
																className="px-1.5 py-0.5 rounded-md text-[10px] font-medium text-text-muted bg-warm-200"
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
						<div className="flex items-center gap-3 text-[10.5px] text-text-muted">
							<span className="flex items-center gap-1">
								<kbd className="px-1.5 py-0.5 rounded text-[10px] bg-warm-200">
									↑↓
								</kbd>
								<span>选择</span>
							</span>
							<span className="flex items-center gap-1">
								<kbd className="px-1.5 py-0.5 rounded text-[10px] bg-warm-200">
									⏎
								</kbd>
								<span>执行</span>
							</span>
							<span className="flex items-center gap-1">
								<kbd className="px-1.5 py-0.5 rounded text-[10px] bg-warm-200">
									ESC
								</kbd>
								<span>关闭</span>
							</span>
						</div>
						<div className="text-[10.5px] text-text-light">
							{flatList.length} / {commands.length}
						</div>
					</div>
				</div>
			</FocusTrap>
		</div>
	);
}
