// Cursor 风格的聊天输入框 - 支持斜杠命令和动态上下文

import {
	ArrowUp,
	AtSign,
	ChevronUp,
	FileText,
	Folder,
	Globe,
	Image as ImageIcon,
	Mic,
	Plus,
	Type,
} from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	buildPastedFileName,
	saveContextAttachmentFromFile,
} from "../../lib/chat/attachmentFiles";
import {
	filterSourcesByProjectAndFolder,
	prefetchChatContext,
	useCardsQuery,
	useOutputAssetsQuery,
	useSourcesQuery,
} from "../../lib/query";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../lib/workspaceStore";
import type { DocCacheItem } from "../../lib/stores/types";
import { SourceType } from "../../types";
import { toast } from "../ui/Toast";
import { AttachmentCard } from "./AttachmentCard";
import { Model, ModelSelector } from "./ModelSelector";
import { type SlashCommand } from "./SlashCommand";
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
	model?: string;
	models?: Model[];
	onModelSelect?: (modelId: string) => void;
	onOpenPromptLibrary?: () => void;
	isAgentExecuting?: boolean;
}

const EMPTY_COMMANDS: SlashCommand[] = [];
const EMPTY_DOC_CACHE: Record<string, DocCacheItem> = {};

function getSourceIcon(kind: SourceType) {
	switch (kind) {
		case SourceType.Web:
			return Globe;
		case SourceType.Audio:
			return Mic;
		case SourceType.Image:
			return ImageIcon;
		case SourceType.Text:
			return Type;
		default:
			return FileText;
	}
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
	const menuDataEnabled = showSlashMenu;
	const docCache = useWorkspaceStoreSelector((state) =>
		menuDataEnabled ? state.docCache : EMPTY_DOC_CACHE,
	);
	const currentProjectId = useWorkspaceStoreSelector((state) =>
		menuDataEnabled ? state.currentProjectId : null,
	);
	const currentFolderId = useWorkspaceStoreSelector((state) =>
		menuDataEnabled ? state.currentFolderId : null,
	);
	const sourcesQuery = useSourcesQuery(currentProjectId, {
		enabled: menuDataEnabled,
	});
	const cardsQuery = useCardsQuery({ enabled: menuDataEnabled });
	const outputsQuery = useOutputAssetsQuery({ enabled: menuDataEnabled });

	const sources = useMemo(
		() =>
			!menuDataEnabled
				? []
				: filterSourcesByProjectAndFolder(
						sourcesQuery.data ?? [],
						currentProjectId,
						currentFolderId,
					),
		[menuDataEnabled, sourcesQuery.data, currentProjectId, currentFolderId],
	);
	const cards = useMemo(
		() => (menuDataEnabled ? (cardsQuery.data ?? []) : []),
		[menuDataEnabled, cardsQuery.data],
	);
	const outputs = useMemo(
		() => (menuDataEnabled ? (outputsQuery.data ?? []) : []),
		[menuDataEnabled, outputsQuery.data],
	);
	const recentDocs = useMemo(
		() =>
			menuDataEnabled
				? Object.values(docCache).filter((doc) => doc.content.trim())
				: [],
		[docCache, menuDataEnabled],
	);

	const addSelectionToContext =
		workspaceStore.addSelectionToContext.bind(workspaceStore);
	const addFileToContext = workspaceStore.addFileToContext.bind(workspaceStore);
	const removeContext = workspaceStore.removeContext.bind(workspaceStore);
	const addSourceToContext =
		workspaceStore.addSourceToContext.bind(workspaceStore);

	// 动态生成命令列表
	const dynamicCommands = useMemo(() => {
		if (!menuDataEnabled) return EMPTY_COMMANDS;
		const commands: SlashCommand[] = [];

		// 1. 添加“导入本地文件”命令
		commands.push({
			id: "import-file",
			name: "导入本地文件",
			description: "选择并读取本地文件内容",
			icon: Folder,
			category: "data",
			group: "操作",
			action: () => fileInputRef.current?.click(),
		});

		// 2. 添加左侧资料库 (Sources)
		sources.forEach((source) => {
			commands.push({
				id: `source-${source.id}`,
				name: source.title,
				description: "资料库",
				icon: getSourceIcon(source.kind),
				category: "data",
				group: "资料库",
				action: () => {
					addSourceToContext(source);
				},
			});
		});

		// 3. 添加左侧卡片 (Cards)
		cards.forEach((card) => {
			commands.push({
				id: `card-${card.id}`,
				name: card.title || "分享卡片",
				description: card.text.slice(0, 30).replace(/\n/g, " ") + "...",
				icon: ImageIcon,
				category: "data",
				group: "卡片",
				action: () => {
					addSelectionToContext(card.text, `卡片: ${card.title}`);
				},
			});
		});

		// 4. 添加所有文档 (Outputs)
		outputs.forEach((output) => {
			commands.push({
				id: `output-${output.id}`,
				name: output.title || "未命名文档",
				description: output.content.slice(0, 30).replace(/\n/g, " ") + "...",
				icon: FileText,
				category: "data",
				group: "文档",
				action: () => {
					addSelectionToContext(output.content, output.title);
				},
			});
		});

		// 5. 添加最近打开的文档 (docCache) - 仅当不在 outputs 中时才添加，或者作为“最近打开”
		// 为避免重复，这里只添加那些ID不在 outputs 里的（虽然理论上 docCache 是子集）
		// 或者简单地放在“最近打开”分组
		recentDocs.forEach((doc) => {
			commands.push({
				id: `doc-${doc.id}`,
				name: doc.title || "未命名文档",
				description: doc.content.slice(0, 30).replace(/\n/g, " ") + "...",
				icon: FileText,
				category: "data",
				group: "最近打开",
				action: () => {
					addSelectionToContext(doc.content, doc.title);
				},
			});
		});

		return commands;
	}, [
		sources,
		cards,
		outputs,
		recentDocs,
		addSelectionToContext,
		addSourceToContext,
		menuDataEnabled,
	]);

	const appendFilesToContext = useCallback(
		async (files: File[]) => {
			if (files.length === 0) return 0;

			let successCount = 0;
			for (const [index, file] of files.entries()) {
				try {
					const normalizedFileName =
						file.name?.trim() || buildPastedFileName(file, index);
					const attachment = await saveContextAttachmentFromFile(
						file,
						normalizedFileName,
					);
					addFileToContext(attachment);
					successCount += 1;
				} catch (err) {
					console.error("读取文件失败:", err);
				}
			}

			return successCount;
		},
		[addFileToContext],
	);

	// 处理本地文件选择
	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files ?? []);
		if (files.length === 0) return;

		try {
			const successCount = await appendFilesToContext(files);
			if (successCount > 1) {
				toast.success(`已添加 ${successCount} 个附件`);
			}
		} catch (err) {
			console.error("读取文件失败:", err);
			toast.error("添加附件失败");
		} finally {
			// 清空 input 以便允许重复选择同名文件
			e.target.value = "";
		}
	};

	const handlePaste = useCallback(
		async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
			if (disabled) return;

			const files = Array.from(e.clipboardData.items)
				.filter((item) => item.kind === "file")
				.map((item) => item.getAsFile())
				.filter((file): file is File => file instanceof File);
			if (files.length === 0) return;

			e.preventDefault();
			try {
				const successCount = await appendFilesToContext(files);
				if (successCount === 0) {
					toast.error("剪贴板里的文件添加失败");
					return;
				}
				toast.success(
					successCount === 1
						? "已从剪贴板添加附件"
						: `已从剪贴板添加 ${successCount} 个附件`,
				);
			} catch (error) {
				console.error("粘贴附件失败:", error);
				toast.error("粘贴附件失败");
			}
		},
		[appendFilesToContext, disabled],
	);

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

	const handleSubmit = () => {
		const trimmed = value.trim();

		// 收集提示词 Chips 的内容
		const promptContent = selectedChips
			.filter((c) => c.type === "prompt" && c.content)
			.map((c) => c.content)
			.join("\n\n");

		const agentSkillChip = selectedChips.find((c) => c.type === "agent_skill");
		const selectedSkillName = agentSkillChip?.skillName;
		const skillMention = selectedSkillName ? `$${selectedSkillName}` : "";

		// 最终要发送的消息：显式 Skill 名称 + 提示词内容 + 用户输入
		let finalMessage = trimmed;
		if (promptContent) {
			finalMessage = finalMessage
				? `${promptContent}\n\n${finalMessage}`
				: promptContent;
		}
		if (skillMention) {
			finalMessage = finalMessage
				? `${skillMention}\n\n${finalMessage}`
				: skillMention;
		}

		if (finalMessage && !disabled) {
			// 提交 chips；Skill 通过 `$skill-name` 显式出现在用户 prompt 中，由 SDK 原生路由。
			onSubmit(finalMessage, {
				chips: selectedChips.length > 0 ? selectedChips : undefined,
				forcedSkillId: selectedSkillName,
			});

			setValue("");
			setSelectedChips([]);
		}
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		// 如果斜杠菜单打开，让菜单处理键盘事件
		if (showSlashMenu) {
			if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) {
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

	return (
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

			{/* 主输入区域 — pill-shaped, 渐进式展开 */}
			<div
				className={`
					bg-surface border transition-all duration-300 ease-out
					shadow-[rgba(0,0,0,0.03)_0px_1px_6px,rgba(0,0,0,0.02)_0px_0px_0px_1px]
					${
						isExpanded
							? "rounded-[22px] border-warm-400/70 dark:border-warm-500/40 shadow-[rgba(0,0,0,0.06)_0px_4px_20px,rgba(0,0,0,0.03)_0px_0px_0px_1px]"
							: "rounded-[28px] border-border hover:border-warm-300 dark:hover:border-warm-500/30"
					}
				`}
			>
				{/* 上下文附件条 */}
				{contexts.length > 0 ? (
					<div className="px-4 pt-3 pb-1">
						<div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
							{contexts.map((ctx) => (
								<div key={ctx.id} className="shrink-0">
									<AttachmentCard
										variant="chip"
										file={{
											title: ctx.title,
											path: ctx.filePath || "",
											type: ctx.type === "source" ? "document" : "file",
											size: ctx.size,
											origin:
												ctx.type === "source"
													? "source"
													: ctx.type === "selection"
														? "selection"
														: "file",
											status:
												ctx.content &&
												ctx.content.trim().length > 0 &&
												!ctx.filePath
													? "preparing"
													: "ready",
										}}
										onRemove={() => removeContext(ctx.id)}
									/>
								</div>
							))}
						</div>
						<div className="mt-2 border-t border-warm-200/40" />
					</div>
				) : null}

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
							placeholder-text-muted/60 dark:placeholder-text-muted/40
							resize-none focus:outline-none focus:ring-0 focus:shadow-none disabled:opacity-50 leading-relaxed
							transition-all duration-200
							${isExpanded ? "px-5 py-3.5 min-h-[64px]" : "px-5 py-4 min-h-[52px]"}
						`}
						style={{ maxHeight: "200px" }}
					/>
				</div>

				{/* 底部工具栏 — 展开时显示 */}
				<div
					className={`
						overflow-hidden transition-all duration-300 ease-out
						${isExpanded ? "max-h-[60px] opacity-100" : "max-h-0 opacity-0"}
					`}
				>
					<div className="mx-4 border-t border-warm-200/40 dark:border-warm-700/30" />
					<div className="flex items-center justify-between px-3 py-2">
						{/* 左侧：圆形按钮组 */}
						<div className="flex items-center gap-1">
							<button
								onClick={() => fileInputRef.current?.click()}
								aria-label="添加附件"
								className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-warm-200/80 dark:hover:bg-zinc-700/50 transition-all duration-150 cursor-pointer active:scale-95"
								title="添加附件"
							>
								<Plus className="w-4 h-4" />
							</button>

							<button
								onClick={() => setValue("/")}
								onMouseEnter={prefetchChatContext}
								aria-label="命令菜单"
								className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-warm-200/80 dark:hover:bg-zinc-700/50 transition-all duration-150 cursor-pointer active:scale-95"
								title="命令菜单 (/)"
							>
								<AtSign className="w-3.5 h-3.5" />
							</button>

							{/* 模型选择器 — pill tag（弹出面板在容器外渲染） */}
							<div className="relative ml-0.5">
								<button
									onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
									className={`
										flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full
										transition-all duration-150 cursor-pointer
										${
											isModelSelectorOpen
												? "bg-warm-200 dark:bg-zinc-700 text-text-primary"
												: "text-text-muted hover:text-text-primary hover:bg-warm-200/60 dark:hover:bg-zinc-700/40"
										}
									`}
								>
									<ChevronUp
										className={`w-3 h-3 transition-transform duration-200 ${isModelSelectorOpen ? "" : "rotate-180"}`}
									/>
									<span className="font-medium truncate max-w-[100px]">
										{model ? model.split("/").pop()?.slice(0, 16) : "Auto"}
									</span>
								</button>
							</div>
						</div>

						{/* 右侧：语音 + 发送按钮 */}
						<div className="flex items-center gap-1.5">
							<button
								aria-label="语音输入"
								className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted/50 hover:text-text-muted hover:bg-warm-200/60 dark:hover:bg-zinc-700/40 transition-all duration-150 cursor-pointer active:scale-95"
								title="语音输入"
							>
								<Mic className="w-3.5 h-3.5" />
							</button>
							<button
								onClick={handleSubmit}
								disabled={
									disabled || (!value.trim() && selectedChips.length === 0)
								}
								aria-label="发送消息"
								className={`
									flex items-center justify-center w-8 h-8 rounded-full
									transition-all duration-200 cursor-pointer active:scale-90
									${
										value.trim() || selectedChips.length > 0
											? "bg-primary hover:bg-primary-hover text-surface shadow-sm"
											: "bg-warm-200/80 dark:bg-zinc-700/50 text-text-muted/40 disabled:cursor-not-allowed"
									}
								`}
							>
								<ArrowUp className="w-4 h-4" strokeWidth={2.5} />
							</button>
						</div>
					</div>
				</div>

				{/* 未展开时的迷你工具栏 — 只显示发送按钮 */}
				<div
					className={`
						overflow-hidden transition-all duration-300 ease-out
						${!isExpanded ? "max-h-[48px] opacity-100" : "max-h-0 opacity-0"}
					`}
				>
					<div className="flex items-center justify-end px-3 py-2">
						<button
							onClick={handleSubmit}
							disabled={
								disabled || (!value.trim() && selectedChips.length === 0)
							}
							aria-label="发送消息"
							className={`
								flex items-center justify-center w-8 h-8 rounded-full
								transition-all duration-200 cursor-pointer active:scale-90
								${
									value.trim() || selectedChips.length > 0
										? "bg-primary hover:bg-primary-hover text-surface shadow-sm"
										: "bg-warm-200/60 dark:bg-zinc-700/40 text-text-muted/30 disabled:cursor-not-allowed"
								}
							`}
						>
							<ArrowUp className="w-4 h-4" strokeWidth={2.5} />
						</button>
					</div>
				</div>
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
					<kbd className="px-1.5 h-[17px] flex items-center justify-center bg-surface/50 border border-border/50 rounded-[4px] text-[9px] font-sans text-text-light/60 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
						/
					</kbd>
					命令
				</span>
				<span className="flex items-center gap-1.5">
					<kbd className="px-1.5 h-[17px] flex items-center justify-center bg-surface/50 border border-border/50 rounded-[4px] text-[9px] font-sans text-text-light/60 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
						↵
					</kbd>
					发送
				</span>
			</div>
		</div>
	);
}
