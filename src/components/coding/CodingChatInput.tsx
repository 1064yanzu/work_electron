/**
 * 编程工作区 - 对话输入框
 * 支持 @文件提及、斜杠命令、模式指示器、发送/停止按钮、状态控制
 */
import { ArrowUp, AtSign, X, Square } from 'lucide-react';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
} from 'react';
import { useCodingAgentSelector } from '../../lib/stores/codingAgentStore';
import {
	codingWorkspaceStore,
	useCodingWorkspaceSelector,
} from '../../lib/stores/codingWorkspaceStore';
import { useCodingSessionSelector } from '../../lib/stores/codingSessionStore';
import { useCodingThreadSelector } from '../../lib/stores/codingThreadStore';
import { useCodingRuntimeSelector } from '../../lib/stores/codingRuntimeStore';
import { CodingSlashMenu } from './CodingSlashMenu';
import {
	getSlashCommandById,
	type CodingSlashCommand,
	type SlashCommandOption,
} from '../../lib/coding/codingSlashCommands';
import { parseSlashInput } from '../../lib/coding/slashInput';
import { executeCodingCommand, type CommandContext } from '../../lib/coding/codingCommandExecutor';
import { toast } from '../ui/Toast';
import type { SettingsTabId } from '../Settings/types';
import { useBackendCapabilities } from '../../hooks/useBackendCapabilities';

interface CodingChatInputProps {
	onSend: (content: string) => void;
	onAbort?: () => void;
	isRunning?: boolean;
	onOpenSettings?: (tab?: SettingsTabId) => void;
}

export function CodingChatInput({ onSend, onAbort, isRunning = false, onOpenSettings }: CodingChatInputProps) {
	const [value, setValue] = useState('');
	const [showSlashMenu, setShowSlashMenu] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const inputShellRef = useRef<HTMLDivElement>(null);
	const contextFiles = useCodingWorkspaceSelector((s) => s.contextFiles);
	const codingMode = useCodingAgentSelector((s) => s.codingMode);
	const sessionStatus = useCodingSessionSelector((s) => s.status);
	const usage = useCodingSessionSelector((s) => s.usage);
	const activeThreadId = useCodingThreadSelector((s) => s.activeThreadId);
	const activeThread = useCodingThreadSelector((s) =>
		s.activeThreadId ? s.threads.find((thread) => thread.id === s.activeThreadId) ?? null : null,
	);
	const runtimeCapabilities = useCodingRuntimeSelector((s) => s.capabilities);
	const projectPath = useCodingWorkspaceSelector((s) => s.projectPath);
	const { isCodex } = useBackendCapabilities();

	const isAwaitingPermission = sessionStatus === 'awaiting_permission';
	const slashState = useMemo(() => parseSlashInput(value), [value]);
	const slashQuery = slashState.submenuCommandId ? slashState.submenuQuery : slashState.menuQuery;
	const submenuCommand = useMemo(() => {
		if (!slashState.submenuCommandId) return null;
		const command = getSlashCommandById(slashState.submenuCommandId);
		return command?.type === 'submenu' ? command : null;
	}, [slashState.submenuCommandId]);

	// 自动调整高度
	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
	}, [value]);

	// 斜杠命令检测
	useEffect(() => {
		if (value.startsWith('/') && !value.includes('\n')) {
			setShowSlashMenu(true);
		} else {
			setShowSlashMenu(false);
		}
	}, [value]);

	const handleSend = useCallback(() => {
		const trimmed = value.trim();
		if (!trimmed || isRunning) return;
		onSend(trimmed);
		setValue('');
		setShowSlashMenu(false);
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
		}
	}, [value, isRunning, onSend]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			// 斜杠菜单打开时，让菜单处理键盘事件
			if (showSlashMenu && ['ArrowUp', 'ArrowDown', 'Tab', 'Escape'].includes(e.key)) {
				return; // 由 CodingSlashMenu 的 window listener 处理
			}
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				if (!showSlashMenu) {
					handleSend();
				}
			}
		},
		[handleSend, showSlashMenu],
	);

	const handleSlashSelect = useCallback(
		async (entry: CodingSlashCommand | SlashCommandOption) => {
			if ('actionId' in entry && 'value' in entry) {
				const ctx: CommandContext = {
					threadId: activeThreadId,
					projectPath,
					onOpenSettings,
				};
				const result = await executeCodingCommand(entry.actionId, ctx, {
					[entry.actionId === 'set_mode'
						? 'mode'
						: entry.actionId === 'set_backend'
							? 'backend'
							: entry.actionId === 'set_model'
								? 'model'
								: 'approvalMode']: entry.value,
				});
				if (!result.success && result.error) {
					toast.error(result.error);
					return;
				}
				setShowSlashMenu(false);
				setValue('');
				return;
			}

			if (entry.type === 'submenu') {
				setValue(`/${entry.id}`);
				setShowSlashMenu(true);
				return;
			}

			if (entry.type === 'action' && entry.actionId) {
				const ctx: CommandContext = {
					threadId: activeThreadId,
					projectPath,
					onOpenSettings,
				};
				const result = await executeCodingCommand(entry.actionId, ctx);
				if (!result.success && result.error) {
					toast.error(result.error);
					return;
				}
				setShowSlashMenu(false);
				setValue('');
				return;
			}

			if (entry.type === 'prompt' && entry.prompt) {
				setValue(entry.prompt);
				setShowSlashMenu(false);
				textareaRef.current?.focus();
			}
		},
		[activeThreadId, onOpenSettings, projectPath],
	);

	const handleSlashClose = useCallback(() => {
		setShowSlashMenu(false);
	}, []);

	const handleRemoveContext = useCallback((path: string) => {
		codingWorkspaceStore.removeContextFile(path);
	}, []);

	const modeLabel = isCodex ? 'Codex' : codingMode === 'code' ? 'Code' : codingMode === 'plan' ? 'Plan' : 'Ask';
	const modeColor = isCodex
		? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
		: codingMode === 'code'
			? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
			: codingMode === 'plan'
				? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
				: 'bg-blue-500/10 text-blue-600 dark:text-blue-400';

	return (
		<div className="border-t border-black/[0.04] dark:border-white/[0.04] bg-white/50 dark:bg-[#141414]/50 backdrop-blur-sm">
			{/* 状态提示条 */}
			{isAwaitingPermission && (
				<div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200/50 dark:border-amber-700/30">
					<span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
						<span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
						等待权限审批中...
					</span>
				</div>
			)}

			{/* 附加的上下文文件 */}
			{contextFiles.length > 0 && (
				<div className="px-4 pt-3 flex flex-wrap gap-1.5">
					{contextFiles.map((file) => (
						<span
							key={file.path}
							className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#D96C46]/8 text-[#D96C46] text-xs font-mono"
						>
							<AtSign className="w-3 h-3" />
							{file.name}
							<button
								onClick={() => handleRemoveContext(file.path)}
								className="ml-0.5 p-0.5 rounded hover:bg-[#D96C46]/20 transition-colors"
							>
								<X className="w-2.5 h-2.5" />
							</button>
						</span>
					))}
				</div>
			)}

			{/* 输入区域 */}
			<div className="px-4 py-3">
				<div
					ref={inputShellRef}
					className="relative flex items-end gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 transition-all focus-within:border-[#D96C46]/30 focus-within:ring-1 focus-within:ring-[#D96C46]/30 dark:border-zinc-700 dark:bg-zinc-800/50"
				>
					{/* 斜杠命令菜单 */}
					{showSlashMenu && (
						<CodingSlashMenu
							anchorRef={inputShellRef}
								query={slashQuery}
								submenuCommandId={submenuCommand?.id ?? null}
							context={{
								thread: activeThread,
								currentBackend: activeThread?.backend ?? 'claude-code',
								capabilities: runtimeCapabilities,
								isRunning,
								projectPath,
							}}
							onSelect={handleSlashSelect}
							onClose={handleSlashClose}
						/>
					)}

					{/* 模式指示器 */}
					<span className={`shrink-0 self-center rounded px-1.5 py-0.5 text-[10px] font-bold ${modeColor}`}>
						{modeLabel}
					</span>

					{/* 文本输入 */}
					<textarea
						ref={textareaRef}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={
							isRunning
								? '正在执行中...'
								: codingMode === 'code'
									? (isCodex ? '向 Codex 提问，@ 添加文件，/ 调出命令' : '向 Claude Code 提问，@ 添加文件，/ 调出命令')
									: codingMode === 'plan'
										? '描述你想要规划的任务'
										: '提问关于代码的问题'
						}
						disabled={isRunning}
						rows={1}
						className="flex-1 resize-none bg-transparent border-none outline-none text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 min-h-[24px] max-h-[200px] py-0.5 disabled:opacity-50"
					/>

					{/* 发送/停止按钮 */}
					{isRunning ? (
						<button
							onClick={onAbort}
							className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-all self-end"
							title="停止 (Esc)"
						>
							<Square className="w-3 h-3 fill-current" />
						</button>
					) : (
						<button
							onClick={handleSend}
							disabled={!value.trim()}
							className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all self-end ${
								value.trim()
									? 'bg-[#D96C46] text-white hover:bg-[#c05e3b] active:scale-95'
									: 'bg-zinc-100 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed'
							}`}
						>
							<ArrowUp className="w-4 h-4" />
						</button>
					)}
				</div>

				<div className="flex items-center justify-between mt-1.5 px-1">
					<span className="text-[10px] text-zinc-400">{isRunning ? '运行中' : ''}</span>
					{(usage.inputTokens > 0 || usage.outputTokens > 0) && (
						<span className="text-[10px] text-zinc-400 tabular-nums">
							{formatTokenCount(usage.inputTokens + usage.outputTokens)} tokens
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

function formatTokenCount(count: number): string {
	if (count < 1000) return String(count);
	if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
	return `${(count / 1_000_000).toFixed(2)}M`;
}
