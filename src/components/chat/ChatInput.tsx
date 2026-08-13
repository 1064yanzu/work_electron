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
import { useContainerBreakpoint } from "../../hooks/useContainerBreakpoint";
import { EVENTS, events } from "../../lib/events";
import { prefetchChatContext } from "../../lib/query";
import { SlashCommandProvider } from "../../lib/slashCommands/reactContext";
import { cn } from "../../lib/utils";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../lib/workspaceStore";
import { ChatInputContextBar } from "./chatInput/ChatInputContextBar";
import { ChatInputToolbar } from "./chatInput/ChatInputToolbar";
import { buildSubmitMessage } from "./chatInput/buildSubmitMessage";
import { INPUT_DENSITY_STEPS, TEXTAREA_MAX_HEIGHT } from "./chatInput/density";
import { useChatInputAttachments } from "./chatInput/useChatInputAttachments";
import { useDynamicSlashCommands } from "./chatInput/useDynamicSlashCommands";
import { type Model, ModelSelector } from "./ModelSelector";
import type { SlashCommand } from "./SlashCommand";
import { type SelectedChip, SlashCommandChipList } from "./SlashCommandChip";
import { SlashMenuContainer } from "./SlashMenuContainer";

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
	/** 窄栏（compact 档）下的短占位文案；不传则沿用 placeholder */
	compactPlaceholder?: string;
	model?: string;
	models?: Model[];
	onModelSelect?: (modelId: string) => void;
	onOpenPromptLibrary?: () => void;
	/**
	 * AI 正在响应（流式 / Agent 执行中）。此时文本框保持可编辑（先起草，
	 * 完成后再发），发送被拦截，发送键原位变成停止键。
	 */
	isResponding?: boolean;
	onStop?: () => void;
	/** 运行模式（执行 / 规划）；未传 onTogglePlanMode 时不渲染该胶囊 */
	planMode?: boolean;
	onTogglePlanMode?: (enabled: boolean) => void;
}

export function ChatInput({
	onSubmit,
	disabled = false,
	placeholder = "输入消息，或用 / 唤起命令...",
	compactPlaceholder,
	model,
	models = [],
	onModelSelect,
	onOpenPromptLibrary,
	isResponding = false,
	onStop,
	planMode = false,
	onTogglePlanMode,
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

	// 按「容器自身宽度」分档 —— 右栏是可拖拽 Panel（173px ~ 720px），
	// 视口媒体查询在这里无效。只在跨档时 setState，拖拽不会逐帧重渲染。
	const { ref: densityRef, tier: density } = useContainerBreakpoint(
		INPUT_DENSITY_STEPS,
		"regular",
	);
	const maxHeight = TEXTAREA_MAX_HEIGHT[density];

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
			textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
		}
	}, [value, maxHeight]);

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
			// 清空附件/上下文（图片、文件等），避免发送后仍滞留在输入框上方
			workspaceStore.clearContexts();
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
			// 响应期间 Enter 不拦截 —— 落成换行，草稿不丢也不误发
			if (disabled) return;
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
		// 如果焦点仍在输入区域容器内，不算失焦
		const container = e.currentTarget.closest("[data-chat-input-root]");
		if (container?.contains(e.relatedTarget as Node)) return;
		setIsFocused(false);
	}, []);

	// 输入区是否"活跃"（聚焦 / 有内容 / 有附件 / 菜单打开）—— 只驱动边框强调，
	// 不再驱动折叠动画：工具栏常驻，避免"先点一下才能改模型"。
	const isActive =
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
			<div
				ref={densityRef}
				className="relative"
				data-chat-input-root
				onBlur={handleBlur}
			>
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

				{/* 主输入区域 —— 圆角恒定、极淡描边、几乎无阴影（Codex 那种"干净的一块"）；
				    聚焦只加深描边，不做形变也不做光晕 */}
				<div
					className={cn(
						"relative bg-surface border rounded-2xl overflow-hidden",
						"transition-colors duration-150 ease-out shadow-node",
						isActive
							? "border-warm-400 dark:border-cream-500/60"
							: "border-border hover:border-warm-400/70",
					)}
					style={{ transform: "translateZ(0)" }}
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
					<textarea
						ref={textareaRef}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={handleKeyDown}
						onPaste={handlePaste}
						onFocus={handleFocus}
						placeholder={
							density === "compact"
								? (compactPlaceholder ?? placeholder)
								: placeholder
						}
						// 响应期间不禁用 —— 用户可以先起草下一条（Enter 落成换行，
						// 发送键此时是停止键）；非响应的禁用场景仍然锁死
						disabled={disabled && !isResponding}
						rows={1}
						className={cn(
							"block w-full bg-transparent text-base leading-[1.5] text-text-primary",
							"placeholder:text-text-muted",
							"resize-none focus:outline-none focus:ring-0 focus:shadow-none",
							"disabled:opacity-50 px-4 pt-3.5 pb-2 min-h-[60px]",
						)}
						style={{ maxHeight: `${maxHeight}px` }}
					/>

					<ChatInputToolbar
						density={density}
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
						planMode={planMode}
						onTogglePlanMode={onTogglePlanMode}
						isResponding={isResponding}
						onStop={onStop}
					/>
				</div>
			</div>
		</SlashCommandProvider>
	);
}
