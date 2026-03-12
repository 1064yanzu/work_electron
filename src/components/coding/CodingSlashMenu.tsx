import {
	ActivitySquare,
	FilePlus2,
	FolderKanban,
	LayoutGrid,
	Settings2,
	Sparkles,
	Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
	CATEGORY_LABELS,
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

const CATEGORY_ICON = {
	session: Sparkles,
	runtime: Settings2,
	context: FilePlus2,
	inspect: ActivitySquare,
	workspace: FolderKanban,
} as const;

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

	useEffect(() => {
		setSelectedIndex(0);
	}, [query, submenuCommandId, entries.length]);

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
			if (entries.length === 0) return;
			switch (event.key) {
				case 'ArrowDown':
					event.preventDefault();
					setSelectedIndex((index) => (index + 1) % entries.length);
					break;
				case 'ArrowUp':
					event.preventDefault();
					setSelectedIndex((index) => (index - 1 + entries.length) % entries.length);
					break;
				case 'Enter':
				case 'Tab':
					event.preventDefault();
					handleSubmit(entries[selectedIndex]);
					break;
				case 'Escape':
					event.preventDefault();
					onClose();
					break;
			}
		},
		[entries, selectedIndex, handleSubmit, onClose],
	);

	useEffect(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleKeyDown]);

	const groupedCommands = useMemo(() => {
		if (submenuCommand) return null;
		const groups = new Map<string, CodingSlashCommand[]>();
		for (const entry of entries) {
			if (isOption(entry)) continue;
			const bucket = groups.get(entry.category) ?? [];
			bucket.push(entry);
			groups.set(entry.category, bucket);
		}
		return Array.from(groups.entries());
	}, [entries, submenuCommand]);

	let flatIndex = 0;

	return (
		<DropdownPortal
			anchorRef={anchorRef}
			open={true}
			onClose={onClose}
			placement="top-start"
			width={anchorRef.current?.getBoundingClientRect().width}
			className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)] dark:border-zinc-700 dark:bg-[#181818]"
		>
			<div className="max-h-[380px] overflow-hidden">
				{submenuCommand && (
					<div className="border-b border-zinc-100 px-4 py-3 text-[11px] text-zinc-400 dark:border-zinc-800">
						<span className="font-medium text-zinc-600 dark:text-zinc-300">/{submenuCommand.id}</span>
						<span className="ml-2">{submenuCommand.description}</span>
					</div>
				)}
				{entries.length === 0 ? (
					<div className="px-4 py-5 text-center text-sm text-zinc-400">没有可用命令</div>
				) : (
					<div ref={listRef} className="max-h-[320px] overflow-y-auto py-2">
						{submenuCommand
							? entries.map((entry) => {
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
										className={`mx-2 flex w-[calc(100%-16px)] items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
											selected
												? 'bg-[#D96C46]/8 text-zinc-900 dark:text-zinc-100'
												: 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-white/[0.04]'
										} ${disabledReason ? 'opacity-50' : ''}`}
									>
										<div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-[#D96C46]/12 text-[#D96C46]' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'}`}>
											<Wrench className="h-4 w-4" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="text-[13px] font-medium">{isOption(entry) ? entry.label : entry.name}</div>
											<div className="mt-0.5 text-[11px] text-zinc-400">{entry.description}</div>
											{disabledReason && <div className="mt-1 text-[10px] text-amber-500">{disabledReason}</div>}
										</div>
									</button>
								);
							})
							: groupedCommands?.map(([category, commands]) => (
								<div key={category} className="px-2 pb-1 last:pb-0">
									<div className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
										{CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}
									</div>
									{commands.map((entry) => {
										const idx = flatIndex++;
										const Icon = CATEGORY_ICON[entry.category] ?? Wrench;
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
												className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected ? 'bg-[#D96C46]/8 text-zinc-800 dark:text-zinc-100' : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-white/[0.04]'} ${disabledReason ? 'opacity-50' : ''}`}
											>
												<div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-[#D96C46]/12 text-[#D96C46]' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'}`}>
													<Icon className="h-4 w-4" />
												</div>
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-2">
														<span className="text-[13px] font-medium">{entry.name}</span>
														<span className="text-[11px] font-mono text-[#D96C46]">/{entry.id}</span>
													</div>
													<div className="mt-0.5 truncate text-[11px] text-zinc-400">{entry.description}</div>
													{disabledReason && <div className="mt-1 text-[10px] text-amber-500">{disabledReason}</div>}
												</div>
												<div className="shrink-0 text-[10px] text-zinc-400">{entry.type === 'prompt' ? '插入' : entry.type === 'submenu' ? '选择' : '执行'}</div>
											</button>
										);
									})}
								</div>
							))}
					</div>
				)}
				<div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2 text-[10px] text-zinc-400 dark:border-zinc-800">
					<div className="flex items-center gap-1.5">
						<LayoutGrid className="h-3 w-3" />
						<span>↑↓ 选择</span>
					</div>
					<div className="flex items-center gap-3">
						<span>Enter 确认</span>
						<span>Esc 关闭</span>
					</div>
				</div>
			</div>
		</DropdownPortal>
	);
}
