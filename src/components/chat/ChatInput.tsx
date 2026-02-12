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
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	listCards,
	listOutputAssets,
	listSources,
	saveTempFile,
} from "../../lib/api";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../lib/workspaceStore";
import {
	type Card,
	type OutputAsset,
	type Source,
	SourceType,
} from "../../types";
import { AttachmentCard } from "./AttachmentCard";
import { Model, ModelSelector } from "./ModelSelector";
import { type SlashCommand } from "./SlashCommand";
import { type SelectedChip, SlashCommandChipList } from "./SlashCommandChip";
import { SlashMenuContainer } from "./SlashMenuContainer";

// 提交选项
export interface SubmitOptions {
	command?: SlashCommand;
	chips?: SelectedChip[];
	forcedSkillId?: string; // 强制使用的 skill ID
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

	// 已选择的命令卡片
	const [selectedChips, setSelectedChips] = useState<SelectedChip[]>([]);

	// 数据源状态
	const [sources, setSources] = useState<Source[]>([]);
	const [cards, setCards] = useState<Card[]>([]);
	const [outputs, setOutputs] = useState<OutputAsset[]>([]);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const docCache = useWorkspaceStoreSelector((state) => state.docCache);
	const contexts = useWorkspaceStoreSelector((state) => state.contexts);
	const currentProjectId = useWorkspaceStoreSelector(
		(state) => state.currentProjectId,
	);
	const currentFolderId = useWorkspaceStoreSelector(
		(state) => state.currentFolderId,
	);
	const addSelectionToContext =
		workspaceStore.addSelectionToContext.bind(workspaceStore);
	const addFileToContext = workspaceStore.addFileToContext.bind(workspaceStore);
	const removeContext = workspaceStore.removeContext.bind(workspaceStore);
	const addSourceToContext =
		workspaceStore.addSourceToContext.bind(workspaceStore);

	// 加载外部数据
	useEffect(() => {
		const loadData = async () => {
			try {
				// 并行加载资料、卡片和文档
				const [sourcesData, cardsData, outputsData] = await Promise.allSettled([
					listSources(),
					listCards(),
					listOutputAssets(),
				]);

				if (sourcesData.status === "fulfilled") {
					// 根据当前项目和文件夹过滤资料,与 ResourceSidebar 保持一致
					let filteredSources = sourcesData.value;

					// 1. 按项目过滤
					if (currentProjectId) {
						filteredSources = filteredSources.filter(
							(s) => s.project_id === currentProjectId || s.project_id == null,
						);
					}

					// 2. 按文件夹过滤
					if (currentFolderId) {
						filteredSources = filteredSources.filter(
							(s) => s.folder_id === currentFolderId,
						);
					}

					setSources(filteredSources);
				}
				if (cardsData.status === "fulfilled") {
					setCards(cardsData.value);
				}
				if (outputsData.status === "fulfilled") {
					setOutputs(outputsData.value);
				}
			} catch (err) {
				console.error("加载上下文数据失败:", err);
			}
		};

		loadData();
	}, [currentProjectId, currentFolderId]);

	// 辅助函数：获取资料图标
	const getSourceIcon = (kind: SourceType) => {
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
	};

	// 动态生成命令列表
	const dynamicCommands = useMemo(() => {
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
		Object.values(docCache).forEach((doc) => {
			if (doc.content.trim()) {
				commands.push({
					id: `doc-${doc.id}`,
					name: doc.title || "未命名文档",
					description: doc.content.slice(0, 30).replace(/\n/g, " ") + "...",
					icon: FileText,
					category: "data",
					group: "最近打开",
					action: () => {
						addSelectionToContext(doc.content, doc.title);
						console.log("已添加文档上下文:", doc.title);
					},
				});
			}
		});

		return commands;
	}, [
		docCache,
		sources,
		cards,
		outputs,
		addSelectionToContext,
		addSourceToContext,
	]);

	// 处理本地文件选择
	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		try {
			const inferExtension = (name: string) => {
				const ext = name.split(".").pop()?.trim().toLowerCase();
				if (!ext || ext === name.toLowerCase()) return "txt";
				return ext;
			};

			const inferPrefix = (name: string) => {
				const base = name.split(/[/\\]/).pop() || name;
				const stem = base.includes(".")
					? base.slice(0, base.lastIndexOf("."))
					: base;
				return stem.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "file";
			};

			const isLikelyTextFile = (f: File) => {
				if (f.type?.startsWith("text/")) return true;
				const name = f.name.toLowerCase();
				return (
					name.endsWith(".md") ||
					name.endsWith(".markdown") ||
					name.endsWith(".txt") ||
					name.endsWith(".json") ||
					name.endsWith(".csv") ||
					name.endsWith(".ts") ||
					name.endsWith(".tsx") ||
					name.endsWith(".js") ||
					name.endsWith(".jsx") ||
					name.endsWith(".py") ||
					name.endsWith(".java") ||
					name.endsWith(".go") ||
					name.endsWith(".rs") ||
					name.endsWith(".xml") ||
					name.endsWith(".yml") ||
					name.endsWith(".yaml") ||
					name.endsWith(".toml") ||
					name.endsWith(".ini") ||
					name.endsWith(".log")
				);
			};

			const arrayBufferToBase64 = (buf: ArrayBuffer) => {
				let binary = "";
				const bytes = new Uint8Array(buf);
				const chunkSize = 0x8000;
				for (let i = 0; i < bytes.length; i += chunkSize) {
					binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
				}
				return btoa(binary);
			};

			const ext = inferExtension(file.name);
			const prefix = inferPrefix(file.name);

			const isText = isLikelyTextFile(file);
			const contentForSave = isText
				? await file.text()
				: arrayBufferToBase64(await file.arrayBuffer());

			const temp = await saveTempFile({
				content: contentForSave,
				extension: ext,
				prefix,
				encoding: isText ? "utf-8" : "base64",
			});

			addFileToContext({
				title: file.name,
				content: isText ? contentForSave : "",
				filePath: temp.path,
				size: file.size,
				mimeType: file.type || undefined,
			});

			console.log("已添加文件上下文:", file.name, temp.path);
			// 清空 input 以便允许重复选择同名文件
			e.target.value = "";
		} catch (err) {
			console.error("读取文件失败:", err);
		}
	};

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

	const handleSubmit = () => {
		const trimmed = value.trim();

		// 收集提示词 Chips 的内容
		const promptContent = selectedChips
			.filter((c) => c.type === "prompt" && c.content)
			.map((c) => c.content)
			.join("\n\n");

		// 最终要发送的消息：提示词内容 + 用户输入
		let finalMessage = trimmed;
		if (promptContent) {
			finalMessage = finalMessage
				? `${promptContent}\n\n${finalMessage}`
				: promptContent;
		}

		if (finalMessage && !disabled) {
			// 查找强制使用的 Agent Skill
			const agentSkillChip = selectedChips.find(
				(c) => c.type === "agent_skill",
			);
			const forcedSkillId = agentSkillChip?.skillName; // 使用存储的 skillName

			// 提交带有 chips 和强制 skill 信息
			onSubmit(finalMessage, {
				chips: selectedChips.length > 0 ? selectedChips : undefined,
				forcedSkillId,
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

		// 检测是否为 Agent Skill（强制执行）
		const isAgentSkill = command.id.startsWith("agent-skill-");
		const forceSkillMatch = command.prompt?.match(/^\[FORCE_SKILL:(.+)\]$/);
		const forcedSkillName = forceSkillMatch ? forceSkillMatch[1] : undefined;

		// 判断类型
		let chipType: SelectedChip["type"] = "skill";
		if (isAgentSkill || forcedSkillName) {
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
			skillName: forcedSkillName, // 存储强制 skill 名称
		};

		// 如果是 agent_skill 类型，替换已有的（只能有一个强制 skill）
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

	return (
		<div className="relative">
			<input
				type="file"
				ref={fileInputRef}
				className="hidden"
				onChange={handleFileSelect}
			/>

			{/* 斜杠命令菜单 - 二级菜单模式 */}
			<SlashMenuContainer
				isOpen={showSlashMenu}
				onClose={() => setShowSlashMenu(false)}
				onSelect={handleSelectCommand}
				filter={slashFilter}
				dynamicCommands={dynamicCommands}
				onOpenPromptLibrary={onOpenPromptLibrary}
			/>

			{/* 主输入区域 */}
			<div className="bg-zinc-50 dark:bg-zinc-800/80 rounded-[20px] border border-zinc-200/80 dark:border-zinc-700/60 focus-within:border-zinc-300 dark:focus-within:border-zinc-600 transition-all duration-200 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
				{/* 上下文附件条 */}
				{contexts.length > 0 ? (
					<div className="px-4 pt-3 pb-1">
						<div className="flex items-center gap-1.5 overflow-x-auto">
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
						{/* 附件与输入区分割线 */}
						<div className="mt-2 border-t border-zinc-200/60 dark:border-zinc-700/40" />
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
						placeholder={placeholder}
						disabled={disabled}
						rows={1}
						className="w-full px-5 py-3.5 bg-transparent text-[14px] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400/80 dark:placeholder-zinc-500 resize-none focus:outline-none disabled:opacity-50 min-h-[52px] leading-relaxed"
						style={{ maxHeight: "200px" }}
					/>
				</div>

				{/* 底部工具栏 — 分割线 + 宽松布局 */}
				<div className="mx-4 border-t border-zinc-200/50 dark:border-zinc-700/30" />
				<div className="flex items-center justify-between px-3 py-2.5">
					{/* 左侧：圆形按钮组 */}
					<div className="flex items-center gap-1">
						{/* 附件/命令按钮 */}
						<button
							onClick={() => fileInputRef.current?.click()}
							aria-label="添加附件"
							className="w-9 h-9 flex items-center justify-center rounded-full border border-zinc-200/80 dark:border-zinc-600/60 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-500 transition-all duration-150 cursor-pointer active:scale-95"
							title="添加附件"
						>
							<Plus className="w-4 h-4" />
						</button>

						{/* 斜杠命令按钮 */}
						<button
							onClick={() => setValue("/")}
							aria-label="命令菜单"
							className="w-9 h-9 flex items-center justify-center rounded-full border border-zinc-200/80 dark:border-zinc-600/60 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-500 transition-all duration-150 cursor-pointer active:scale-95"
							title="命令菜单 (/)"
						>
							<AtSign className="w-4 h-4" />
						</button>

						{/* 模型选择器 */}
						<div className="relative ml-1">
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
							<button
								onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
								className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-full transition-all duration-150 cursor-pointer ${isModelSelectorOpen
									? "bg-zinc-200/80 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100"
									: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50"
									}`}
							>
								<ChevronUp className={`w-3 h-3 transition-transform duration-200 ${isModelSelectorOpen ? "" : "rotate-180"}`} />
								<span className="font-medium truncate max-w-[100px]">
									{model ? model.split("/").pop()?.slice(0, 16) : "Auto"}
								</span>
							</button>
						</div>
					</div>

					{/* 右侧：语音 + 发送按钮 */}
					<div className="flex items-center gap-2">
						<button
							aria-label="语音输入"
							className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-300 hover:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/50 transition-all duration-150 cursor-pointer active:scale-95"
							title="语音输入"
						>
							<Mic className="w-4 h-4" />
						</button>
						<button
							onClick={handleSubmit}
							disabled={disabled || (!value.trim() && selectedChips.length === 0)}
							aria-label="发送消息"
							className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 cursor-pointer active:scale-90 ${value.trim() || selectedChips.length > 0
									? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md"
									: "bg-zinc-200/80 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 disabled:cursor-not-allowed"
								}`}
						>
							<ArrowUp className="w-4 h-4" strokeWidth={2.5} />
						</button>
					</div>
				</div>
			</div>

			{/* 快捷键提示 */}
			<div className="flex items-center justify-center gap-5 mt-2.5 text-[10px] text-zinc-300 dark:text-zinc-600 select-none">
				<span className="flex items-center gap-1.5">
					<kbd className="px-1.5 h-[18px] flex items-center justify-center bg-white dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/60 rounded text-[9px] font-sans text-zinc-400 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
						/
					</kbd>
					命令
				</span>
				<span className="flex items-center gap-1.5">
					<kbd className="px-1.5 h-[18px] flex items-center justify-center bg-white dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/60 rounded text-[9px] font-sans text-zinc-400 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
						↵
					</kbd>
					发送
				</span>
			</div>
		</div>
	);
}
