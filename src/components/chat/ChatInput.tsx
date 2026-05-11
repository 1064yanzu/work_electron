// Cursor 风格的聊天输入框 - 支持斜杠命令和动态上下文

import {
	type KeyboardEvent,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { prefetchChatContext } from "../../lib/query";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../lib/workspaceStore";
import { ChatInputContextBar } from "./chatInput/ChatInputContextBar";
import { ChatInputToolbar } from "./chatInput/ChatInputToolbar";
import { buildSubmitMessage } from "./chatInput/buildSubmitMessage";
import { useChatInputAttachments } from "./chatInput/useChatInputAttachments";
import { useDynamicSlashCommands } from "./chatInput/useDynamicSlashCommands";
import { type Model, ModelSelector } from "./ModelSelector";
import type { SlashCommand } from "./SlashCommand";
import { type SelectedChip, SlashCommandChipList } from "./SlashCommandChip";
import { SlashMenuContainer } from "./SlashMenuContainer";
import { SlashCommandProvider } from "../../lib/slashCommands/reactContext";
import { EVENTS, events } from "../../lib/events";

// 提交选项
export interface SubmitOptions {
	command?: SlashCommand;
	chips?: SelectedChip[];
	forcedSkillId?: string; // 用户显式选择的 SDK Skill 名称
}

interface ChatInputProps {
	onSubmit: (message: string, options?: SubmitOptions) => void;
	onAddContext?: () => void;
	disabled?: boolean;
	placeholder?: string;
	model?: string;
	models?: Model[];
	onModelSelect?: (modelId: string) => void;
	onOpenPromptLibrary?: () => void;
	isAgentExecuting?: boolean;
}

export function ChatInput({
	onSubmit,
	disabled = false,
	placeholder = "输入消息，或用 / 唤起命令...",
	model,
	models = [],
	onModelSelect,
	onOpenPromptLibrary,
}: ChatInputProps) {
	const [value, setValue] = useState("");
	const [showSlashMenu, setShowSlashMenu] = useState(false);
	const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
	const [slashFilter, setSlashFilter] = useState("");
	const [isFocused, setIsFocused] = useState(false);

	// 已选择的命令卡片
	const [selectedChips, setSelectedChips] = useState<SelectedChip[]>([]);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const contexts = useWorkspaceStoreSelector((state) => state.contexts);
	const removeContext = workspaceStore.removeContext.bind(workspaceStore);

	const { handleFileSelect, handlePaste, triggerFilePicker } =
		useChatInputAttachments({ disabled, fileInputRef });

	const dynamicCommands = useDynamicSlashCommands({
		enabled: showSlashMenu,
		onTriggerFilePicker: triggerFilePicker,
	});

	// 自动调整高度
	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = "auto";
			textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
		}
	}, [value]);

	// 检测斜杠命令
	useEffect(() => {
		if (value.startsWith("/")) {
			setShowSlashMenu(true);
			setSlashFilter(value.slice(1));
		} else {
			setShowSlashMenu(false);
			setSlashFilter("");
		}
	}, [value]);
	const deferredSlashFilter = useDeferredValue(slashFilter);

	// 监听 Slash 命令回填请求（Tab 回填命令 id / 自定义命令 prompt）
	useEffect(() => {
		const off = events.on(
			EVENTS.SLASH_FILL_INPUT,
			(payload: { text?: string } | undefined) => {
				const text = typeof payload?.text === "string" ? payload.text : "";
				setValue(text);
				setTimeout(() => textareaRef.current?.focus(), 0);
			},
		);
		return off;
	}, []);

	// 监听 Slash 命令的会话级消息提交（/review）
	useEffect(() => {
		const off = events.on(
			EVENTS.SLASH_SUBMIT_MESSAGE,
			(payload: { message?: string } | undefined) => {
				const message =
					typeof payload?.message === "string" ? payload.message : "";
				if (!message.trim() || disabled) return;
				onSubmit(message, undefined);
			},
		);
		return off;
	}, [disabled, onSubmit]);

	const handleSubmit = useCallback(() => {
		const { finalMessage, skillName } = buildSubmitMessage(
			value,
			selectedChips,
		);

		if (finalMessage && !disabled) {
			// 提交 chips；Skill 通过 `$skill-name` 显式出现在用户 prompt 中，由 SDK 原生路由。
			onSubmit(finalMessage, {
				chips: selectedChips.length > 0 ? selectedChips : undefined,
				forcedSkillId: skillName,
			});

			setValue("");
			setSelectedChips([]);
		}
	}, [value, selectedChips, disabled, onSubmit]);

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		// 如果斜杠菜单打开，让菜单处理键盘事件
		if (showSlashMenu) {
			if (["ArrowUp", "ArrowDown", "Enter", "Escape", "Tab"].includes(e.key)) {
				// Tab：阻止默认切焦点，交给菜单处理
				if (e.key === "Tab") e.preventDefault();
				return; // 让 SlashCommandMenu 处理
			}
		}

		// 检查是否正在使用输入法（如中文输入法），如果是则不处理回车
		// nativeEvent.isComposing 或 keyCode === 229 表示输入法正在组合中
		if (e.key === "Enter" && !e.shiftKey) {
			const isComposing =
				e.nativeEvent.isComposing || (e.nativeEvent as any).keyCode === 229;
			if (isComposing) {
				return; // 输入法组合中，不发送消息
			}
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleSelectCommand = (command: SlashCommand) => {
		setShowSlashMenu(false);

		// 如果命令有 action（如导入文件、添加文档上下文），直接执行
		if (command.action) {
			command.action();
			setValue(""); // 清空 /
			return;
		}

		// 检测是否为 Agent Skill（以 `$skill-name` 方式显式交给 SDK 原生路由）
		const isAgentSkill = command.id.startsWith("agent-skill-");
		const explicitSkillMatch = command.prompt?.match(/^\[FORCE_SKILL:(.+)\]$/);
		const explicitSkillName = explicitSkillMatch
			? explicitSkillMatch[1]
			: undefined;

		// 判断类型
		let chipType: SelectedChip["type"] = "skill";
		if (isAgentSkill || explicitSkillName) {
			chipType = "agent_skill";
		} else if (command.category === "context" || command.prompt) {
			chipType = "prompt";
		} else if (command.category === "data") {
			chipType = "data";
		} else if (command.category === "skill") {
			chipType = "skill";
		}

		// 创建新的 chip
		const newChip: SelectedChip = {
			id: `chip-${Date.now()}-${command.id}`,
			type: chipType,
			command,
			isExpanded: false,
			content: chipType === "agent_skill" ? undefined : command.prompt,
			skillName: explicitSkillName,
		};

		// 如果是 agent_skill 类型，替换已有的（只能显式选择一个 skill）
		if (chipType === "agent_skill") {
			setSelectedChips((prev) => [
				...prev.filter((c) => c.type !== "agent_skill"),
				newChip,
			]);
			setValue(""); // Agent Skill 不填充内容
		} else if (chipType === "skill") {
			setSelectedChips((prev) => [
				...prev.filter((c) => c.type !== "skill"),
				newChip,
			]);
			setValue("");
		} else {
			// 对于提示词类型：保留 chip，并填充输入框
			// 或者是其他类型（如 data），也保留 chip
			setSelectedChips((prev) => [...prev, newChip]);

			// 如果是提示词，填充到输入框
			if (command.prompt && chipType === "prompt") {
				// 修改：只保留 Chip，不填充输入框（作为占位符/引用存在）
				setValue("");
				// 聚焦输入框，方便用户继续输入
				setTimeout(() => {
					textareaRef.current?.focus();
				}, 0);
			} else {
				setValue("");
			}
		}

		// 聚焦输入框
		textareaRef.current?.focus();
	};

	const handleRemoveChip = (chipId: string) => {
		setSelectedChips((prev) => prev.filter((c) => c.id !== chipId));
	};

	const handleToggleChipExpand = (chipId: string) => {
		setSelectedChips((prev) =>
			prev.map((c) =>
				c.id === chipId ? { ...c, isExpanded: !c.isExpanded } : c,
			),
		);
	};

	const handleUpdateChip = (chipId: string, content: string) => {
		setSelectedChips((prev) =>
			prev.map((c) => (c.id === chipId ? { ...c, content } : c)),
		);
	};

	const handleFocus = useCallback(() => {
		setIsFocused(true);
		prefetchChatContext();
	}, []);

	const handleBlur = useCallback((e: React.FocusEvent) => {
		// 如果焦点仍在输入区域容器内，不折叠
		const container = e.currentTarget.closest("[data-chat-input-root]");
		if (container?.contains(e.relatedTarget as Node)) return;
		setIsFocused(false);
	}, []);

	// 是否处于展开状态
	const isExpanded =
		isFocused ||
		value.trim().length > 0 ||
		selectedChips.length > 0 ||
		contexts.length > 0 ||
		showSlashMenu;

	const hasContent = useMemo(
		() => value.trim().length > 0 || selectedChips.length > 0,
		[value, selectedChips],
	);

	// Claude Code 斜杠命令桥接：把 onModelSelect 暴露给 /model 等命令
	const slashBridgeValue = useMemo(
		() => ({
			invokeSelectModel: (modelId: string) => {
				onModelSelect?.(modelId);
			},
		}),
		[onModelSelect],
	);

	return (
		<SlashCommandProvider value={slashBridgeValue}>
			<div className="relative" data-chat-input-root onBlur={handleBlur}>
				<input
					type="file"
					ref={fileInputRef}
					className="hidden"
					multiple
					onChange={handleFileSelect}
				/>

				{/* 斜杠命令菜单 - 二级菜单模式 */}
				<SlashMenuContainer
					isOpen={showSlashMenu}
					onClose={() => setShowSlashMenu(false)}
					onSelect={handleSelectCommand}
					filter={deferredSlashFilter}
					dynamicCommands={dynamicCommands}
					onOpenPromptLibrary={onOpenPromptLibrary}
				/>

				{/* 模型选择器弹出面板 — 放在 overflow-hidden 外，避免被裁剪 */}
				{isModelSelectorOpen && models.length > 0 && (
					<ModelSelector
						models={models}
						activeModel={model || null}
						onSelect={(id) => {
							onModelSelect?.(id);
							setIsModelSelectorOpen(false);
						}}
						onClose={() => setIsModelSelectorOpen(false)}
						className="bottom-full left-0 mb-2"
					/>
				)}

				{/* 主输入区域 — B.AI 风格胶囊化，1px 暖描边 + 极轻阴影 */}
				<div
					className={`
					bg-surface border transition-[border-color,border-radius,box-shadow] duration-300 ease-out
					${
						isExpanded
							? "rounded-3xl border-warm-400 dark:border-warm-500/40 shadow-[0_4px_12px_0_rgb(26_26_25/0.06)]"
							: "rounded-full border-border hover:border-warm-400 shadow-[0_1px_2px_0_rgb(26_26_25/0.04)]"
					}
				`}
				>
					<ChatInputContextBar contexts={contexts} onRemove={removeContext} />

					{/* 已选择的命令卡片 */}
					<SlashCommandChipList
						chips={selectedChips}
						onRemove={handleRemoveChip}
						onToggleExpand={handleToggleChipExpand}
						onUpdate={handleUpdateChip}
					/>

					{/* 输入框 */}
					<div className="relative">
						<textarea
							ref={textareaRef}
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={handleKeyDown}
							onPaste={handlePaste}
							onFocus={handleFocus}
							placeholder={placeholder}
							disabled={disabled}
							rows={1}
							className={`
							w-full bg-transparent text-[14px] text-text-primary
							placeholder-cream-600 dark:placeholder-text-muted/40
							resize-none focus:outline-none focus:ring-0 focus:shadow-none disabled:opacity-50 leading-relaxed
							transition-all duration-200
							${isExpanded ? "px-5 py-3.5 min-h-[64px]" : "px-5 py-4 min-h-[52px]"}
						`}
							style={{ maxHeight: "200px" }}
						/>
					</div>

					<ChatInputToolbar
						expanded={isExpanded}
						disabled={disabled}
						hasContent={hasContent}
						model={model}
						models={models}
						isModelSelectorOpen={isModelSelectorOpen}
						onToggleModelSelector={() =>
							setIsModelSelectorOpen(!isModelSelectorOpen)
						}
						onTriggerFilePicker={triggerFilePicker}
						onTriggerSlashMenu={() => setValue("/")}
						onSubmit={handleSubmit}
					/>
				</div>

				{/* 快捷键提示 — 聚焦时显示 */}
				<div
					className={`
					flex items-center justify-center gap-5 mt-2 text-[10px] select-none
					transition-all duration-300
					${
						isExpanded
							? "opacity-100 text-text-muted/50 dark:text-text-muted/30"
							: "opacity-0 text-transparent"
					}
				`}
				>
					<span className="flex items-center gap-1.5">
						<kbd className="px-1.5 h-[17px] flex items-center justify-center bg-warm-200 border border-border rounded-[4px] text-[9px] font-sans text-text-light/60">
							/
						</kbd>
						命令
					</span>
					<span className="flex items-center gap-1.5">
						<kbd className="px-1.5 h-[17px] flex items-center justify-center bg-warm-200 border border-border rounded-[4px] text-[9px] font-sans text-text-light/60">
							↵
						</kbd>
						发送
					</span>
				</div>
			</div>
		</SlashCommandProvider>
	);
}
