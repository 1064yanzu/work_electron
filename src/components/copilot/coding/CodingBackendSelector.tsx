/**
 * 编码后端选择器
 * 选择使用 Claude Code 还是 Codex 作为编码 Agent 后端
 */

import { ChevronDown, Cpu, Sparkles } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import {
	type CodingBackend,
	codingAgentStore,
	useCodingAgentSelector,
} from '../../../lib/stores/codingAgentStore';
import { useCodingSessionSelector } from '../../../lib/stores/codingSessionStore';
import { useCodingThreadSelector } from '../../../lib/stores/codingThreadStore';
import { useCodingWorkspaceSelector } from '../../../lib/stores/codingWorkspaceStore';
import { useCodingRuntimeSelector } from '../../../lib/stores/codingRuntimeStore';
import { executeCodingCommand } from '../../../lib/coding/codingCommandExecutor';
import { DropdownPortal } from '../../ui/DropdownPortal';
import { toast } from '../../ui/Toast';

const backends: Array<{
	value: CodingBackend;
	label: string;
	icon: typeof Cpu;
	description: string;
}> = [
	{
		value: 'claude-code',
		label: 'Claude Code',
		icon: Sparkles,
		description: '本地执行，完整文件系统访问',
	},
	{
		value: 'codex',
		label: 'Codex',
		icon: Cpu,
		description: '云端沙箱执行',
	},
];

export function CodingBackendSelector() {
	const currentBackend = useCodingAgentSelector((s) => s.codingBackend);
	const sessionStatus = useCodingSessionSelector((s) => s.status);
	const activeThreadId = useCodingThreadSelector((s) => s.activeThreadId);
	const projectPath = useCodingWorkspaceSelector((s) => s.projectPath);
	const capabilities = useCodingRuntimeSelector((s) => s.capabilities);
	const [isOpen, setIsOpen] = useState(false);
	const anchorRef = useRef<HTMLDivElement>(null);

	const currentItem = backends.find((b) => b.value === currentBackend);

	const handleSelect = useCallback(
		async (backend: CodingBackend) => {
			const result = await executeCodingCommand(
				'set_backend',
				{
					threadId: activeThreadId,
					projectPath,
				},
				{ backend },
			);
			if (!result.success && result.error) {
				toast.error(result.error);
				return;
			}
			codingAgentStore.setCodingBackend(backend);
			setIsOpen(false);
		},
		[activeThreadId, projectPath],
	);

	if (!currentItem) return null;

	const Icon = currentItem.icon;

	return (
		<div ref={anchorRef} className="relative">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
			>
				<Icon className="w-3 h-3" />
				<span>{currentItem.label}</span>
				<ChevronDown
					className={`w-2.5 h-2.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
				/>
			</button>

			<DropdownPortal
				anchorRef={anchorRef}
				open={isOpen}
				onClose={() => setIsOpen(false)}
				placement="top-start"
				minWidth={220}
				className="rounded-lg shadow-xl ring-1 ring-black/10 dark:ring-white/10"
			>
				<div className="overflow-hidden rounded-lg bg-white py-1 dark:bg-zinc-900">
					{backends.map((backend) => {
						const BIcon = backend.icon;
						const isActive = currentBackend === backend.value;
						const capability = capabilities[backend.value];
						const disabledReason =
							!capability?.available
								? capability?.error || '当前环境不可用'
								: sessionStatus === 'running'
									? '请先结束当前运行'
									: undefined;
						return (
							<button
								key={backend.value}
								type="button"
								onClick={() => void handleSelect(backend.value)}
								disabled={Boolean(disabledReason)}
								className={`w-full px-3 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
									isActive ? 'bg-zinc-50 dark:bg-zinc-800/30' : ''
								} ${disabledReason ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
							>
								<div className="flex items-start gap-2">
									<BIcon
										className={`mt-0.5 h-3.5 w-3.5 ${isActive ? 'text-primary' : 'text-zinc-400'}`}
									/>
									<div>
										<div
											className={`text-[11px] font-medium ${isActive ? 'text-primary' : 'text-zinc-700 dark:text-zinc-300'}`}
										>
											{backend.label}
										</div>
										<div className="text-[10px] text-zinc-400 dark:text-zinc-500">
											{disabledReason || backend.description}
										</div>
									</div>
								</div>
							</button>
						);
					})}
				</div>
			</DropdownPortal>
		</div>
	);
}
