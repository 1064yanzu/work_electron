import {
	ChevronDown,
	Code2,
	FolderOpen,
	MoreHorizontal,
	Pencil,
	Plus,
	Trash2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
	codingThreadStore,
	useCodingThreadSelector,
} from '../../lib/stores/codingThreadStore';
import { useCodingWorkspaceSelector } from '../../lib/stores/codingWorkspaceStore';
import type { CodingThread } from '../../lib/stores/codingThreadTypes';
import { createThreadFromWorkspaceProfile, syncThreadWorkspaceProfile } from '../../lib/coding/threadFactory';
import { ContextMenuPortal } from '../ui/DropdownPortal';

interface CodingHomeProps {
	onOpenThread?: (threadId: string) => void;
}

export function CodingHome({ onOpenThread }: CodingHomeProps) {
	const threads = useCodingThreadSelector((s) => s.threads);
	const recentProjects = useCodingWorkspaceSelector((s) => s.recentProjects);
	const [contextMenu, setContextMenu] = useState<{
		threadId: string;
		position: { x: number; y: number };
	} | null>(null);
	const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState('');

	const latestProject = recentProjects[0] ?? null;
	const latestThreads = useMemo(
		() => [...threads].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
		[threads],
	);

	const handleNewThread = useCallback(async () => {
		try {
			const result = await window.electronAPI.invoke('coding_select_directory', {});
			if (result?.path) {
				const thread = await createThreadFromWorkspaceProfile(result.path);
				onOpenThread?.(thread.id);
			}
		} catch (error) {
			console.error('[CodingHome] 选择目录失败:', error);
		}
	}, [onOpenThread]);

	const handleOpenThread = useCallback(
		(thread: CodingThread) => {
			codingThreadStore.switchThread(thread.id);
			void syncThreadWorkspaceProfile(thread.id, thread.projectPath);
			onOpenThread?.(thread.id);
		},
		[onOpenThread],
	);

	const handleOpenProject = useCallback(
		async (projectPath: string) => {
			const thread = await createThreadFromWorkspaceProfile(projectPath);
			onOpenThread?.(thread.id);
		},
		[onOpenThread],
	);

	const handleDeleteThread = useCallback((threadId: string) => {
		codingThreadStore.deleteThread(threadId);
		setContextMenu(null);
	}, []);

	const handleStartRename = useCallback((thread: CodingThread) => {
		setEditingThreadId(thread.id);
		setEditTitle(thread.title);
		setContextMenu(null);
	}, []);

	const handleFinishRename = useCallback(() => {
		if (editingThreadId && editTitle.trim()) {
			codingThreadStore.updateThread(editingThreadId, { title: editTitle.trim() });
		}
		setEditingThreadId(null);
		setEditTitle('');
	}, [editingThreadId, editTitle]);

	return (
		<div className="flex min-h-[calc(100vh-180px)] flex-col">
			<div className="flex flex-1 flex-col items-center justify-center px-6">
				<div className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
					<Code2 className="h-7 w-7" />
				</div>
				<h1 className="mt-8 text-5xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
					开始构建
				</h1>
				<button
					onClick={() => {
						if (latestProject) {
							void handleOpenProject(latestProject.path);
						} else {
							void handleNewThread();
						}
					}}
					className="mt-3 inline-flex items-center gap-1 text-4xl text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
				>
					<span>{latestProject?.name ?? '选择项目'}</span>
					<ChevronDown className="mt-1 h-5 w-5" />
				</button>

				<div className="mt-10 flex flex-wrap items-center justify-center gap-3">
					<ActionChip icon={Plus} label="新线程" onClick={() => void handleNewThread()} />
					{latestProject && (
						<ActionChip
							icon={FolderOpen}
							label={latestProject.name}
							onClick={() => void handleOpenProject(latestProject.path)}
						/>
					)}
				</div>
			</div>

			{latestThreads.length > 0 && (
				<div className="mx-auto mt-2 w-full max-w-3xl px-6 pb-6">
					<div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/70">
						{latestThreads.map((thread) => (
							<div
								key={thread.id}
								onClick={() => editingThreadId !== thread.id && handleOpenThread(thread)}
								onContextMenu={(event) => {
									event.preventDefault();
									setEditingThreadId(null);
									setEditTitle('');
									setContextMenu({
										threadId: thread.id,
										position: { x: event.clientX, y: event.clientY },
									});
								}}
								className="group flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/70"
							>
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
									<Code2 className="h-4 w-4" />
								</div>
								<div className="min-w-0 flex-1">
									{editingThreadId === thread.id ? (
										<input
											autoFocus
											value={editTitle}
											onChange={(event) => setEditTitle(event.target.value)}
											onBlur={handleFinishRename}
											onKeyDown={(event) => {
												if (event.key === 'Enter') handleFinishRename();
												if (event.key === 'Escape') {
													setEditingThreadId(null);
													setEditTitle('');
												}
											}}
											onClick={(event) => event.stopPropagation()}
											className="w-full border-b border-[#D96C46] bg-transparent text-sm font-medium outline-none"
										/>
									) : (
										<div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
											{thread.title}
										</div>
									)}
									<div className="mt-0.5 truncate text-[11px] text-zinc-400">
										{thread.projectName}
									</div>
								</div>
								<button
									onClick={(event) => {
										event.stopPropagation();
										const rect = event.currentTarget.getBoundingClientRect();
										setEditingThreadId(null);
										setEditTitle('');
										setContextMenu({
											threadId: thread.id,
											position: { x: rect.right - 8, y: rect.bottom + 6 },
										});
									}}
									className="rounded-lg p-1.5 text-zinc-400 opacity-0 transition-all hover:bg-zinc-100 group-hover:opacity-100 dark:hover:bg-zinc-800"
									title="线程操作"
								>
									<MoreHorizontal className="h-4 w-4" />
								</button>
							</div>
						))}
					</div>
				</div>
			)}

			<ContextMenuPortal
				position={contextMenu?.position ?? null}
				onClose={() => setContextMenu(null)}
				className="overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
			>
				<button
					onClick={() => {
						const thread = contextMenu ? codingThreadStore.getThread(contextMenu.threadId) : null;
						if (thread) handleStartRename(thread);
					}}
					className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-600 transition-colors hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
				>
					<Pencil className="h-3 w-3" />
					重命名
				</button>
				<button
					onClick={() => {
						if (contextMenu) handleDeleteThread(contextMenu.threadId);
					}}
					className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
				>
					<Trash2 className="h-3 w-3" />
					删除
				</button>
			</ContextMenuPortal>
		</div>
	);
}

interface ActionChipProps {
	icon: typeof Plus;
	label: string;
	onClick: () => void;
}

function ActionChip({ icon: Icon, label, onClick }: ActionChipProps) {
	return (
		<button
			onClick={onClick}
			className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
		>
			<Icon className="h-4 w-4 text-zinc-400" />
			<span>{label}</span>
		</button>
	);
}
