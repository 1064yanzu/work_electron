/**
 * 编程工作区 - 对话输入框
 * 支持 @文件提及、斜杠命令、模式指示器、发送/停止按钮
 * 参考 Codex 官方样式：底部自然布局（非 absolute），圆角输入区域
 */
import {
	ArrowUp,
	AtSign,
	X,
	Square,
	Plus,
	ChevronDown,
	Check,
	Sparkles,
	Brain,
	Zap,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
} from "react";
import {
	useCodingAgentSelector,
	codingAgentStore,
} from "../../lib/stores/codingAgentStore";
import {
	codingWorkspaceStore,
	useCodingWorkspaceSelector,
} from "../../lib/stores/codingWorkspaceStore";
import { useCodingSessionSelector } from "../../lib/stores/codingSessionStore";
import { useCodingThreadSelector } from "../../lib/stores/codingThreadStore";
import { useCodingRuntimeSelector } from "../../lib/stores/codingRuntimeStore";
import { CodingSlashMenu } from "./CodingSlashMenu";
import {
	getSlashCommandById,
	type CodingSlashCommand,
	type SlashCommandOption,
} from "../../lib/coding/codingSlashCommands";
import { parseSlashInput } from "../../lib/coding/slashInput";
import {
	executeCodingCommand,
	type CommandContext,
} from "../../lib/coding/codingCommandExecutor";
import { pickAndAttachContextFiles } from "../../lib/coding/contextFiles";
import { toast } from "../ui/Toast";
import type { SettingsTabId } from "../Settings/types";
import { useBackendCapabilities } from "../../hooks/useBackendCapabilities";
import { formatModelName } from "../../lib/coding/modelUtils";
import { ContextUsageIndicator } from "./ContextUsageIndicator";
import { ModelSelectorDropdown } from "./ModelSelectorDropdown";

interface CodingChatInputProps {
	onSend: (content: string) => void;
	onAbort?: () => void;
	isRunning?: boolean;
	onOpenSettings?: (tab?: SettingsTabId) => void;
}

/** 思考深度选项 */
const REASONING_OPTIONS = [
	{ key: "low", label: "低推理", icon: Zap },
	{ key: "medium", label: "中推理", icon: Sparkles },
	{ key: "high", label: "高推理", icon: Sparkles },
	{ key: "max", label: "Max 推理", icon: Brain },
] as const;

export function CodingChatInput({
	onSend,
	onAbort,
	isRunning = false,
	onOpenSettings,
}: CodingChatInputProps) {
	const [value, setValue] = useState("");
	const [showSlashMenu, setShowSlashMenu] = useState(false);
	const [showReasoningMenu, setShowReasoningMenu] = useState(false);
	const [showModelMenu, setShowModelMenu] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const inputShellRef = useRef<HTMLDivElement>(null);
	const reasoningMenuRef = useRef<HTMLDivElement>(null);
	const modelMenuRef = useRef<HTMLButtonElement>(null);
	const contextFiles = useCodingWorkspaceSelector((s) => s.contextFiles);
	const sessionStatus = useCodingSessionSelector((s) => s.status);
	const usage = useCodingSessionSelector((s) => s.usage);
	const activeThreadId = useCodingThreadSelector((s) => s.activeThreadId);
	const activeThread = useCodingThreadSelector((s) =>
		s.activeThreadId
			? (s.threads.find((thread) => thread.id === s.activeThreadId) ?? null)
			: null,
	);
	const runtimeCapabilities = useCodingRuntimeSelector((s) => s.capabilities);
	const projectPath = useCodingWorkspaceSelector((s) => s.projectPath);
	const { isCodex } = useBackendCapabilities();
	const codexReasoningEffort = useCodingAgentSelector(
		(s) => s.codexReasoningEffort,
	);
	const codexPlanMode = useCodingAgentSelector((s) => s.codexPlanMode);

	const isAwaitingPermission = sessionStatus === "awaiting_permission";
	const slashState = useMemo(() => parseSlashInput(value), [value]);
	const slashQuery = slashState.submenuCommandId
		? slashState.submenuQuery
		: slashState.menuQuery;
	const submenuCommand = useMemo(() => {
		if (!slashState.submenuCommandId) return null;
		const command = getSlashCommandById(slashState.submenuCommandId);
		return command?.type === "submenu" ? command : null;
	}, [slashState.submenuCommandId]);

	// 自动调整高度
	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
	}, [value]);

	// 斜杠命令检测
	useEffect(() => {
		if (value.startsWith("/") && !value.includes("\n")) {
			setShowSlashMenu(true);
		} else {
			setShowSlashMenu(false);
		}
	}, [value]);

	// 点击外部关闭思考深度菜单
	useEffect(() => {
		if (!showReasoningMenu) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (
				reasoningMenuRef.current &&
				!reasoningMenuRef.current.contains(e.target as Node)
			) {
				setShowReasoningMenu(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showReasoningMenu]);

	const handleSend = useCallback(() => {
		const trimmed = value.trim();
		if (!trimmed || isRunning) return;
		onSend(trimmed);
		setValue("");
		setShowSlashMenu(false);
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	}, [value, isRunning, onSend]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (
				showSlashMenu &&
				["ArrowUp", "ArrowDown", "Tab", "Escape"].includes(e.key)
			) {
				return;
			}
			if (e.key === "Enter" && !e.shiftKey) {
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
			if ("actionId" in entry && "value" in entry) {
				const ctx: CommandContext = {
					threadId: activeThreadId,
					projectPath,
					onOpenSettings,
				};
				const result = await executeCodingCommand(entry.actionId, ctx, {
					[entry.actionId === "set_mode"
						? "mode"
						: entry.actionId === "set_backend"
							? "backend"
							: entry.actionId === "set_model"
								? "model"
								: entry.actionId === "set_theme"
									? "theme"
									: entry.actionId === "set_reasoning_effort"
										? "reasoningEffort"
										: "approvalMode"]: entry.value,
				});
				if (!result.success && result.error) {
					toast.error(result.error);
					return;
				}
				if (result.message) {
					toast.success(result.message);
				}
				setShowSlashMenu(false);
				setValue("");
				return;
			}

			if (entry.type === "submenu") {
				setValue(`/${entry.id}`);
				setShowSlashMenu(true);
				return;
			}

			if (entry.type === "action" && entry.actionId) {
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
				if (result.message) {
					toast.success(result.message);
				}
				setShowSlashMenu(false);
				setValue("");
				return;
			}

			if (entry.type === "prompt" && entry.prompt) {
				setValue(entry.prompt);
				setShowSlashMenu(false);
				textareaRef.current?.focus();
				toast.info("已插入提示，按 Enter 发送");
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

	const handleAddFile = useCallback(async () => {
		if (!projectPath) {
			toast.error("请先打开一个项目。");
			return;
		}
		await pickAndAttachContextFiles(projectPath);
	}, [projectPath]);

	const modelLabel = activeThread?.model
		? formatModelName(activeThread.model)
		: null;

	// 当前推理等级信息
	const currentReasoning = REASONING_OPTIONS.find(
		(o) => o.key === codexReasoningEffort,
	) ?? REASONING_OPTIONS[1];

	return (
		<div className="shrink-0 border-t border-zinc-100 dark:border-zinc-800/50 bg-white dark:bg-[#141414]">
			{/* 状态提示条 */}
			{isAwaitingPermission && (
				<div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/40">
					<span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
						<span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
						等待权限审批中...
					</span>
				</div>
			)}

			{/* 附加的上下文文件 */}
			{contextFiles.length > 0 && (
				<div className="flex flex-wrap gap-1.5 px-4 pt-2">
					{contextFiles.map((file) => (
						<span
							key={file.path}
							className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[11px] font-mono dark:bg-zinc-800 dark:text-zinc-300"
						>
							<AtSign className="w-3 h-3 text-emerald-500" />
							{file.name}
							<button
								onClick={() => handleRemoveContext(file.path)}
								className="ml-0.5 p-0.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
							>
								<X className="w-3 h-3" />
							</button>
						</span>
					))}
				</div>
			)}

			{/* 输入区域 */}
			<div className="px-4 py-3">
				<div ref={inputShellRef} className="relative">
					{/* 斜杠命令菜单 */}
					{showSlashMenu && (
						<CodingSlashMenu
							anchorRef={inputShellRef}
							query={slashQuery}
							submenuCommandId={submenuCommand?.id ?? null}
							context={{
								thread: activeThread,
								currentBackend: activeThread?.backend ?? "claude-code",
								capabilities: runtimeCapabilities,
								isRunning,
								projectPath,
							}}
							onSelect={handleSlashSelect}
							onClose={handleSlashClose}
						/>
					)}

					{/* Codex 风格输入框：圆角边框 */}
					<div className="flex items-end gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 transition-colors focus-within:border-zinc-300 dark:focus-within:border-zinc-600 focus-within:bg-white dark:focus-within:bg-zinc-800">
						{/* + 附加文件 */}
						<button
							onClick={handleAddFile}
							className="shrink-0 flex items-center justify-center p-1 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors mb-0.5"
							title="附加文件 (@)"
						>
							<Plus className="h-[18px] w-[18px]" />
						</button>

						{/* 文本输入 */}
						<textarea
							ref={textareaRef}
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={
								isRunning
									? "正在执行中..."
									: isCodex
										? "向 Codex 提问，@ 添加文件，/ 调出命令"
										: "向 Claude Code 提问，@ 添加文件，/ 调出命令"
							}
							disabled={isRunning}
							rows={1}
							className="flex-1 resize-none bg-transparent border-none outline-none text-[14px] leading-[1.5] text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 placeholder:text-[14px] min-h-[24px] max-h-[30vh] disabled:opacity-50 scrollbar-thin"
						/>

						{/* 发送/停止按钮 */}
						{isRunning ? (
							<button
								onClick={onAbort}
								className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-800 text-white hover:bg-zinc-900 active:scale-95 transition-all mb-0.5"
								title="停止 (Esc)"
							>
								<Square className="w-3 h-3 fill-current" />
							</button>
						) : (
							<button
								onClick={handleSend}
								disabled={!value.trim()}
								className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all mb-0.5 ${
									value.trim()
										? "bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80 active:scale-95 cursor-pointer"
										: "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
								}`}
							>
								<ArrowUp className="w-4 h-4" />
							</button>
						)}
					</div>
				</div>

				{/* 底栏：模型选择 + 推理深度 + 上下文 + 状态 */}
				<div className="flex items-center justify-between mt-2 px-1">
					<div className="flex items-center gap-1.5">
						{/* 模型选择器 - 小按钮 */}
						{modelLabel && (
							<div className="relative">
								<button
									ref={modelMenuRef}
									onClick={() => setShowModelMenu(true)}
									className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
								>
									{modelLabel}
									<ChevronDown className="h-3 w-3 opacity-40" />
								</button>
								<ModelSelectorDropdown
									anchorRef={modelMenuRef}
									open={showModelMenu}
									onClose={() => setShowModelMenu(false)}
								/>
							</div>
						)}

						{/* Codex 推理深度 - 小按钮 */}
						{isCodex && (
							<div className="relative" ref={reasoningMenuRef}>
								<button
									onClick={() => setShowReasoningMenu(!showReasoningMenu)}
									className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
								>
									<currentReasoning.icon className="w-3 h-3" />
									{currentReasoning.label}
									<ChevronDown className="h-3 w-3 opacity-40" />
								</button>
								{showReasoningMenu && (
									<div className="absolute bottom-full left-0 mb-1 py-1 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 z-30 min-w-[140px] overflow-hidden">
										{REASONING_OPTIONS.map((opt) => {
											const OptIcon = opt.icon;
											return (
												<button
													key={opt.key}
													onClick={() => {
														codingAgentStore.setCodexReasoningEffort(
															opt.key as any,
														);
														setShowReasoningMenu(false);
													}}
													className="w-full px-3 py-1.5 flex items-center justify-between text-[12px] transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700/50 text-zinc-700 dark:text-zinc-200"
												>
													<div className="flex items-center gap-2">
														<OptIcon className="w-3.5 h-3.5 opacity-60" />
														{opt.label}
													</div>
													{codexReasoningEffort === opt.key && (
														<Check className="h-3 w-3 text-zinc-900 dark:text-white" />
													)}
												</button>
											);
										})}
									</div>
								)}
							</div>
						)}

						{/* Codex Plan 模式 */}
						{isCodex && (
							<button
								onClick={() =>
									codingAgentStore.setCodexPlanMode(!codexPlanMode)
								}
								className={`text-[12px] px-2 py-1 rounded-md transition-colors ${
									codexPlanMode
										? "bg-[#D96C46]/10 text-[#D96C46] font-medium"
										: "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-300"
								}`}
							>
								Plan
							</button>
						)}

						{isRunning && (
							<span className="text-[12px] text-zinc-400 flex items-center gap-1.5 ml-1">
								<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
								运行中
							</span>
						)}
					</div>

					<div className="flex items-center gap-2">
						<ContextUsageIndicator
							inputTokens={usage.inputTokens}
							outputTokens={usage.outputTokens}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
