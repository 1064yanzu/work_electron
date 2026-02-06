// Cursor 风格的聊天输入框 - 支持斜杠命令和动态上下文

import {
	AtSign,
	ChevronDown,
	FileText,
	Folder,
	Globe,
	Image as ImageIcon,
	Mic,
	Send,
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
import { useWorkspaceStore } from "../../lib/workspaceStore";
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

	// 获取工作区数据 - 实时同步上下文状态
	const {
		docCache,
		addSelectionToContext,
		addFileToContext,
		contexts,
		removeContext,
		addSourceToContext,
	} = useWorkspaceStore();

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
					setSources(sourcesData.value);
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
	}, []);

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
			<div className="bg-white dark:bg-zinc-800 rounded-3xl border border-zinc-200/50 dark:border-zinc-700/50 ring-1 ring-black/5 dark:ring-white/5 focus-within:border-zinc-300 dark:focus-within:border-zinc-600 focus-within:ring-4 focus-within:ring-zinc-100 dark:focus-within:ring-zinc-800 transition-all shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] hover:shadow-[0_12px_48px_-12px_rgba(0,0,0,0.15)]">
				{/* 上下文附件条 - Claude 风格 */}
				{contexts.length > 0 ? (
					<div className="px-4 pt-3 pb-2">
						<div className="flex items-center gap-2 overflow-x-auto">
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
					</div>
				) : null}

				{/* 已选择的命令卡片 - 新 Chips 系统 */}
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
						className="w-full px-4 py-3.5 bg-transparent text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 resize-none focus:outline-none disabled:opacity-50 min-h-[52px] leading-relaxed selection:bg-zinc-100 dark:selection:bg-zinc-700"
						style={{ maxHeight: "200px" }}
					/>
				</div>

				{/* 底部工具栏 */}
				<div className="flex items-center justify-between px-3 py-2.5">
					{/* 左侧：快捷按钮 */}
					<div className="flex items-center gap-1.5">
						<button
							onClick={() => setValue("/")}
							className="p-2 text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 rounded-xl transition-colors"
							title="命令菜单 (/)"
						>
							<AtSign className="w-4 h-4" />
						</button>

						{/* 模型选择 - Dropdown Trigger */}
						<div className="relative">
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
								className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl transition-all border ${
									isModelSelectorOpen
										? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
										: "text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 border-transparent"
								}`}
							>
								<span className="font-medium truncate max-w-[100px]">
									{model ? model.split("/").pop()?.slice(0, 12) : "Auto"}
								</span>
								<ChevronDown className="w-3 h-3 text-zinc-300 group-hover:text-zinc-500 dark:group-hover:text-zinc-300 transition-colors" />
							</button>
						</div>
					</div>

					{/* 右侧：发送按钮 */}
					<button
						onClick={handleSubmit}
						disabled={disabled || !value.trim()}
						className="flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:text-zinc-300 dark:disabled:text-zinc-600 disabled:cursor-not-allowed text-white dark:text-zinc-900 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
					>
						<Send className="w-3.5 h-3.5 ml-0.5" />
					</button>
				</div>
			</div>

			{/* 快捷键提示 */}
			<div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-zinc-300 dark:text-zinc-600 select-none">
				<span className="flex items-center gap-1">
					<kbd className="px-1.5 h-4 flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded text-[9px] font-sans text-zinc-400">
						/
					</kbd>
					命令
				</span>
				<span className="flex items-center gap-1">
					<kbd className="px-1.5 h-4 flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded text-[9px] font-sans text-zinc-400">
						↵
					</kbd>
					发送
				</span>
			</div>
		</div>
	);
}
