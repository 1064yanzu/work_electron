// Cursor 风格的聊天输入框 - 支持斜杠命令和动态上下文

import {
	AtSign,
	ChevronDown,
	FileText,
	Folder,
	Globe,
	Image as ImageIcon,
	Mic,
	Quote,
	Send,
	Type,
	X,
} from "lucide-react";
import {
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { listCards, listOutputAssets, listSources } from "../../lib/api";
import { useWorkspaceStore } from "../../lib/workspaceStore";
import {
	type Card,
	type OutputAsset,
	type Source,
	SourceType,
} from "../../types";
import { type SlashCommand, SlashCommandMenu } from "./SlashCommand";

interface ChatInputProps {
	onSubmit: (message: string, command?: SlashCommand) => void;
	onAddContext?: () => void;
	disabled?: boolean;
	placeholder?: string;
	model?: string;
	onModelClick?: () => void;
}

export function ChatInput({
	onSubmit,
	disabled = false,
	placeholder = "输入消息，或用 / 唤起命令...",
	model,
	onModelClick,
}: ChatInputProps) {
	const [value, setValue] = useState("");
	const [showSlashMenu, setShowSlashMenu] = useState(false);
	const [slashFilter, setSlashFilter] = useState("");
	const [activeCommand, setActiveCommand] = useState<SlashCommand | null>(null);

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
			const text = await file.text();
			addSelectionToContext(text, file.name);
			console.log("已添加文件上下文:", file.name);
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
		if (trimmed && !disabled) {
			// 如果有激活的命令，附带命令信息
			onSubmit(trimmed, activeCommand || undefined);
			setValue("");
			setActiveCommand(null);
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

		// 否则作为普通 Slash Command 激活
		setActiveCommand(command);

		// 如果命令有预设提示词，填充到输入框
		if (command.prompt) {
			setValue(command.prompt);
		} else {
			setValue("");
		}

		// 聚焦输入框
		textareaRef.current?.focus();
	};

	const clearActiveCommand = () => {
		setActiveCommand(null);
	};

	return (
		<div className="relative">
			<input
				type="file"
				ref={fileInputRef}
				className="hidden"
				onChange={handleFileSelect}
			/>

			{/* 斜杠命令菜单 */}
			<SlashCommandMenu
				isOpen={showSlashMenu}
				onClose={() => setShowSlashMenu(false)}
				onSelect={handleSelectCommand}
				filter={slashFilter}
				commands={dynamicCommands}
				hideDefaultCommands={true} // 只显示上下文相关命令
			/>

			{/* 主输入区域 */}
			<div className="bg-white dark:bg-zinc-800 rounded-3xl border border-zinc-200/50 dark:border-zinc-700/50 ring-1 ring-black/5 dark:ring-white/5 focus-within:border-zinc-300 dark:focus-within:border-zinc-600 focus-within:ring-4 focus-within:ring-zinc-100 dark:focus-within:ring-zinc-800 transition-all overflow-hidden shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] hover:shadow-[0_12px_48px_-12px_rgba(0,0,0,0.15)]">
				{/* 上下文 Tags 区域 - 模仿图2的高级展示 */}
				{contexts.length > 0 && (
					<div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
						{contexts.map((ctx) => (
							<div
								key={ctx.id}
								className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 bg-zinc-100 dark:bg-zinc-700/50 text-zinc-700 dark:text-zinc-200 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-700 group transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
							>
								{ctx.type === "file" || ctx.sourceId ? (
									<FileText className="w-3 h-3 text-zinc-500" />
								) : (
									<Quote className="w-3 h-3 text-zinc-500" />
								)}
								<span className="max-w-[120px] truncate">{ctx.title}</span>
								<button
									onClick={() => removeContext(ctx.id)}
									className="p-0.5 rounded-md hover:bg-zinc-300/50 dark:hover:bg-zinc-600/50 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
								>
									<X className="w-3 h-3" />
								</button>
							</div>
						))}
					</div>
				)}

				{/* 激活的命令标签 - 保持原有逻辑 */}
				{activeCommand && (
					<div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50/50 dark:bg-zinc-900/30 border-b border-zinc-100 dark:border-zinc-700/50">
						<div className="flex items-center gap-2 px-2.5 py-1 bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-zinc-200/50 dark:border-zinc-700/50">
							<activeCommand.icon className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
							<span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
								{activeCommand.name}
							</span>
						</div>
						<button
							onClick={clearActiveCommand}
							className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors w-5 h-5 flex items-center justify-center rounded-full hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50"
						>
							✕
						</button>
					</div>
				)}

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

						{/* 模型选择 */}
						<button
							onClick={onModelClick}
							className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 rounded-xl transition-colors group"
						>
							<span className="font-medium truncate max-w-[100px]">
								{model ? model.split("/").pop()?.slice(0, 12) : "Auto"}
							</span>
							<ChevronDown className="w-3 h-3 text-zinc-300 group-hover:text-zinc-500 dark:group-hover:text-zinc-300 transition-colors" />
						</button>
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
