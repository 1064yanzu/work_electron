/**
 * 斜杠命令菜单 - 参照 Codex 官方样式重新设计
 *
 * 设计特点：
 * - 列表式布局，每行一个命令，左侧语义图标 + 命令名 + 右侧描述
 * - 分类标题使用分隔线样式
 * - 选中态背景高亮
 * - 底部快捷键提示
 */
import {
	Activity,
	BookOpen,
	Brain,
	BrainCircuit,
	Copy,
	Cpu,
	FileDown,
	FileDiff,
	FilePlus,
	FileText,
	GitBranch,
	GitPullRequest,
	Layers,
	MessageSquare,
	Minimize2,
	Palette,
	PenLine,
	Plus,
	RotateCcw,
	Settings,
	ShieldCheck,
	Sparkles,
	Terminal,
	ToggleLeft,
	Trash2,
	Undo2,
	Wrench,
	XCircle,
	type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
	CATEGORY_LABELS,
	CATEGORY_ORDER,
	filterSlashCommandOptions,
	filterSlashCommands,
	getSlashCommandById,
	getSlashCommandDisabledReason,
	getSlashCommandOptions,
	type CodingSlashCommand,
	type SlashCommandContext,
	type SlashCommandOption,
} from '../../lib/coding/codingSlashCommands';
import { DropdownPortal } from '../ui/DropdownPortal';

interface CodingSlashMenuProps {
	anchorRef: RefObject<HTMLElement | null>;
	query: string;
	submenuCommandId: string | null;
	context: SlashCommandContext;
	onSelect: (command: CodingSlashCommand | SlashCommandOption) => void;
	onClose: () => void;
}

/** 图标名称到组件的映射 */
const ICON_MAP: Record<string, LucideIcon> = {
	Activity,
	BookOpen,
	Brain,
	BrainCircuit,
	Copy,
	Cpu,
	FileDown,
	FileDiff,
	FilePlus,
	FileText,
	GitBranch,
	GitPullRequest,
	Layers,
	MessageSquare,
	Minimize2,
	Palette,
	PenLine,
	Plus,
	RotateCcw,
	Settings,
	ShieldCheck,
	Sparkles,
	Terminal,
	ToggleLeft,
	Trash2,
	Undo2,
	XCircle,
};

function getCommandIcon(command: CodingSlashCommand): LucideIcon {
	if (command.iconName && ICON_MAP[command.iconName]) {
		return ICON_MAP[command.iconName];
	}
	return Wrench;
}

function isOption(entry: CodingSlashCommand | SlashCommandOption): entry is SlashCommandOption {
	return 'value' in entry;
}

function getEntryKey(entry: CodingSlashCommand | SlashCommandOption): string {
	return isOption(entry) ? `option:${entry.id}` : `command:${entry.id}`;
}

function getEntryDisabledReason(
	entry: CodingSlashCommand | SlashCommandOption,
	context: SlashCommandContext,
): string | undefined {
	return isOption(entry)
		? entry.disabledReason
		: getSlashCommandDisabledReason(entry, context);
}

export function CodingSlashMenu({
	anchorRef,
	query,
	submenuCommandId,
	context,
	onSelect,
	onClose,
}: CodingSlashMenuProps) {
	const submenuCommand = submenuCommandId ? getSlashCommandById(submenuCommandId) : null;
	const entries = useMemo<Array<CodingSlashCommand | SlashCommandOption>>(() => {
		if (submenuCommand?.type === 'submenu') {
			return filterSlashCommandOptions(
				getSlashCommandOptions(submenuCommand, context),
				query,
			);
		}
		return filterSlashCommands(query, context);
	}, [submenuCommand, query, context]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const listRef = useRef<HTMLDivElement>(null);

	const groupedCommands = useMemo(() => {
		if (submenuCommand) return null;
		const groups = new Map<string, CodingSlashCommand[]>();
		for (const entry of entries) {
			if (isOption(entry)) continue;
			const bucket = groups.get(entry.category) ?? [];
			bucket.push(entry);
			groups.set(entry.category, bucket);
		}
		// 按 CATEGORY_ORDER 排序
		return CATEGORY_ORDER
			.filter((cat) => groups.has(cat))
			.map((cat) => [cat, groups.get(cat)!] as [string, CodingSlashCommand[]]);
	}, [entries, submenuCommand]);

	// 按分组渲染的实际视觉顺序展平，用于键盘导航
	const displayOrder = useMemo<Array<CodingSlashCommand | SlashCommandOption>>(() => {
		if (submenuCommand || !groupedCommands) return entries;
		const ordered: Array<CodingSlashCommand | SlashCommandOption> = [];
		for (const [, commands] of groupedCommands) {
			ordered.push(...commands);
		}
		return ordered;
	}, [entries, groupedCommands, submenuCommand]);

	useEffect(() => {
		setSelectedIndex(0);
	}, [query, submenuCommandId, displayOrder.length]);

	useEffect(() => {
		const element = itemRefs.current[selectedIndex];
		if (element && listRef.current) {
			element.scrollIntoView({ block: 'nearest' });
		}
	}, [selectedIndex]);

	const handleSubmit = useCallback(
		(entry: CodingSlashCommand | SlashCommandOption) => {
			if (getEntryDisabledReason(entry, context)) return;
			onSelect(entry);
		},
		[context, onSelect],
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (displayOrder.length === 0) return;
			switch (event.key) {
				case 'ArrowDown':
					event.preventDefault();
					setSelectedIndex((index) => (index + 1) % displayOrder.length);
					break;
				case 'ArrowUp':
					event.preventDefault();
					setSelectedIndex((index) => (index - 1 + displayOrder.length) % displayOrder.length);
					break;
				case 'Enter':
				case 'Tab':
					event.preventDefault();
					handleSubmit(displayOrder[selectedIndex]);
					break;
				case 'Escape':
					event.preventDefault();
					onClose();
					break;
			}
		},
		[displayOrder, selectedIndex, handleSubmit, onClose],
	);

	useEffect(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleKeyDown]);

	let flatIndex = 0;

	return (
		<DropdownPortal
			anchorRef={anchorRef}
			open={true}
			onClose={onClose}
			placement="top-start"
			width={anchorRef.current?.getBoundingClientRect().width}
			className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-[0_20px_60px_-20px_rgba(15,23,42,0.35)] dark:border-zinc-700/80 dark:bg-[#1a1a1a]"
		>
			<div className="max-h-[400px] overflow-hidden">
				{/* 子菜单头部 */}
				{submenuCommand && (
					<div className="border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
						<span className="font-medium text-xs text-zinc-700 dark:text-zinc-300">/{submenuCommand.id}</span>
						<span className="ml-2 text-[11px] text-zinc-400">{submenuCommand.description}</span>
					</div>
				)}

				{entries.length === 0 ? (
					<div className="px-4 py-5 text-center text-sm text-zinc-400">没有可用命令</div>
				) : (
					<div ref={listRef} className="max-h-[340px] overflow-y-auto py-1">
						{submenuCommand
							? /* 子菜单选项列表 */
								entries.map((entry) => {
									const idx = flatIndex++;
									const disabledReason = getEntryDisabledReason(entry, context);
									const selected = idx === selectedIndex;
									return (
										<button
											key={getEntryKey(entry)}
											ref={(element) => {
												itemRefs.current[idx] = element;
											}}
											type="button"
											onClick={() => handleSubmit(entry)}
											onMouseEnter={() => setSelectedIndex(idx)}
											className={`mx-1 flex w-[calc(100%-8px)] items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
												selected
													? 'bg-[#D96C46]/8 text-zinc-900 dark:text-zinc-100'
													: 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-white/[0.04]'
											} ${disabledReason ? 'opacity-40' : ''}`}
										>
											<div className="min-w-0 flex-1">
												<div className="text-[13px] font-medium">{isOption(entry) ? entry.label : entry.name}</div>
												<div className="mt-0.5 truncate text-[11px] text-zinc-400">{entry.description}</div>
												{disabledReason && <div className="mt-0.5 text-[10px] text-amber-500">{disabledReason}</div>}
											</div>
										</button>
									);
								})
							: /* 主菜单 - 分组列表（Codex 风格） */
								groupedCommands?.map(([category, commands], groupIdx) => (
									<div key={category}>
										{/* 分类标题 — Codex 风格：简洁的文字标签 */}
										<div className={`px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-500 ${groupIdx > 0 ? 'border-t border-zinc-100 dark:border-zinc-800 mt-0.5 pt-2' : ''}`}>
											{CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}
										</div>
										{commands.map((entry) => {
											const idx = flatIndex++;
											const Icon = getCommandIcon(entry);
											const disabledReason = getEntryDisabledReason(entry, context);
											const selected = idx === selectedIndex;
											return (
												<button
													key={getEntryKey(entry)}
													ref={(element) => {
														itemRefs.current[idx] = element;
													}}
													type="button"
													onClick={() => handleSubmit(entry)}
													onMouseEnter={() => setSelectedIndex(idx)}
													className={`mx-1 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
														selected
															? 'bg-[#D96C46]/8 text-zinc-800 dark:text-zinc-100'
															: 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-white/[0.04]'
													} ${disabledReason ? 'opacity-40' : ''}`}
												>
													{/* 语义图标 */}
													<Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-[#D96C46]' : 'text-zinc-400 dark:text-zinc-500'}`} />

													{/* 命令名 + 斜杠 ID */}
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-1.5">
															<span className="text-[13px] font-medium">{entry.name}</span>
															{entry.description && (
																<span className="hidden sm:inline truncate text-[11px] text-zinc-400 dark:text-zinc-500">
																	{entry.description}
																</span>
															)}
														</div>
													</div>

													{/* 右侧标签 */}
													<div className="flex items-center gap-1.5 shrink-0">
														{/* 命令来源标签 */}
														{entry.sourceTag && (
															<span className="text-[10px] text-zinc-400 dark:text-zinc-500">
																{entry.sourceTag === 'personal' ? '个人' : '系统'}
															</span>
														)}
														{/* 类型标签 */}
														{entry.type === 'prompt' ? (
															<span className="rounded bg-blue-100/80 px-1 py-px text-[9px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
																插入
															</span>
														) : entry.type === 'submenu' ? (
															<span className="text-[10px] text-zinc-400">▸</span>
														) : null}
													</div>
												</button>
											);
										})}
									</div>
								))}
					</div>
				)}

				{/* 底部快捷键提示 */}
				<div className="flex items-center justify-between border-t border-zinc-100 px-4 py-1.5 text-[10px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
					<span>↑↓ 选择</span>
					<div className="flex items-center gap-3">
						<span>Enter 确认</span>
						<span>Esc 关闭</span>
					</div>
				</div>
			</div>
		</DropdownPortal>
	);
}
