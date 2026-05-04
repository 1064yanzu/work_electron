import {
	Code,
	Database,
	FileCode,
	FileText,
	Globe,
	Link,
	Search,
	Settings,
	Command,
	Table,
	Upload,
	Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SlashCommand {
	id: string;
	label: string;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
	category: "tool" | "context" | "action";
	keywords: string[];
	action: () => void;
}

interface SlashCommandMenuProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (command: SlashCommand) => void;
	searchQuery: string;
	position?: { top: number; left: number; width: number };
}

export function SlashCommandMenu({
	isOpen,
	onClose,
	onSelect,
	searchQuery,
	position,
}: SlashCommandMenuProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const menuRef = useRef<HTMLDivElement>(null);

	// 定义所有可用命令
	const allCommands: SlashCommand[] = [
		// 工具类
		{
			id: "search-web",
			label: "网页搜索",
			description: "使用搜索引擎查找信息",
			icon: Globe,
			category: "tool",
			keywords: ["search", "web", "搜索", "网页"],
			action: () => console.log("Web search"),
		},
		{
			id: "add-url",
			label: "添加 URL",
			description: "从网页链接导入内容",
			icon: Link,
			category: "tool",
			keywords: ["url", "link", "链接", "网址"],
			action: () => console.log("Add URL"),
		},
		{
			id: "upload-file",
			label: "上传文件",
			description: "上传文档、PDF 等文件",
			icon: Upload,
			category: "tool",
			keywords: ["upload", "file", "上传", "文件"],
			action: () => console.log("Upload file"),
		},
		{
			id: "add-text",
			label: "添加文本",
			description: "直接输入文本内容",
			icon: FileText,
			category: "tool",
			keywords: ["text", "note", "文本", "笔记"],
			action: () => console.log("Add text"),
		},
		{
			id: "run-workflow",
			label: "运行工作流",
			description: "执行预设的自动化流程",
			icon: Workflow,
			category: "tool",
			keywords: ["workflow", "automation", "工作流", "自动化"],
			action: () => console.log("Run workflow"),
		},
		{
			id: "use-llm",
			label: "调用 LLM",
			description: "使用大语言模型分析",
			icon: Command,
			category: "tool",
			keywords: ["llm", "ai", "gpt", "模型"],
			action: () => console.log("Use LLM"),
		},
		{
			id: "code-analysis",
			label: "代码分析",
			description: "分析代码结构和质量",
			icon: Code,
			category: "tool",
			keywords: ["code", "analysis", "代码", "分析"],
			action: () => console.log("Code analysis"),
		},
		{
			id: "data-extract",
			label: "数据提取",
			description: "从文档中提取结构化数据",
			icon: Table,
			category: "tool",
			keywords: ["data", "extract", "数据", "提取"],
			action: () => console.log("Data extract"),
		},

		// 上下文类
		{
			id: "context-sources",
			label: "选择信息源",
			description: "从已有信息源中选择",
			icon: Database,
			category: "context",
			keywords: ["source", "context", "信息源", "上下文"],
			action: () => console.log("Select sources"),
		},
		{
			id: "context-notes",
			label: "引用笔记",
			description: "引用之前的笔记内容",
			icon: FileText,
			category: "context",
			keywords: ["note", "reference", "笔记", "引用"],
			action: () => console.log("Reference notes"),
		},
		{
			id: "context-outputs",
			label: "引用输出",
			description: "引用之前的输出内容",
			icon: FileCode,
			category: "context",
			keywords: ["output", "result", "输出", "结果"],
			action: () => console.log("Reference outputs"),
		},

		// 操作类
		{
			id: "action-settings",
			label: "打开设置",
			description: "配置应用设置",
			icon: Settings,
			category: "action",
			keywords: ["settings", "config", "设置", "配置"],
			action: () => console.log("Open settings"),
		},
	];

	// 过滤命令
	const filteredCommands = allCommands.filter((cmd) => {
		if (!searchQuery) return true;
		const query = searchQuery.toLowerCase();
		return (
			cmd.label.toLowerCase().includes(query) ||
			cmd.description.toLowerCase().includes(query) ||
			cmd.keywords.some((k) => k.toLowerCase().includes(query))
		);
	});

	// 按类别分组
	const groupedCommands = {
		tool: filteredCommands.filter((c) => c.category === "tool"),
		context: filteredCommands.filter((c) => c.category === "context"),
		action: filteredCommands.filter((c) => c.category === "action"),
	};

	const categoryLabels = {
		tool: "工具",
		context: "上下文",
		action: "操作",
	};

	useEffect(() => {
		setSelectedIndex(0);
	}, [searchQuery]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isOpen) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((prev) =>
					Math.min(prev + 1, filteredCommands.length - 1),
				);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (filteredCommands[selectedIndex]) {
					onSelect(filteredCommands[selectedIndex]);
				}
			} else if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, selectedIndex, filteredCommands, onSelect, onClose]);

	if (!isOpen) return null;

	// 调试信息
	console.log("SlashCommandMenu render:", {
		filteredCommandsLength: filteredCommands.length,
		position,
		searchQuery,
	});

	const menuContent = (
		<>
			{/* 背景遮罩 */}
			<div className="fixed inset-0 z-[9998]" onClick={onClose} />

			{/* 命令菜单 */}
			<div
				ref={menuRef}
				className="fixed z-[9999] min-h-[200px] max-h-[500px] overflow-y-auto bg-cream-50 dark:bg-cream-900 border border-cream-400 dark:border-cream-500 rounded-2xl shadow-bai-pop"
				style={{
					top: position ? `${position.top + 8}px` : "50%",
					left: position ? `${position.left}px` : "50%",
					width: position ? `${position.width}px` : "500px",
					maxWidth: "90vw",
				}}
			>
				{/* 搜索提示 */}
				{searchQuery && (
					<div className="px-4 py-2 text-xs text-text-muted border-b border-border bg-surface">
						搜索:{" "}
						<span className="font-medium text-text-primary">{searchQuery}</span>
					</div>
				)}

				{/* 命令列表 */}
				<div className="p-2">
					{filteredCommands.length === 0 ? (
						<div className="px-4 py-8 text-center text-text-muted">
							<Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
							<p>未找到匹配的命令</p>
						</div>
					) : (
						<>
							{Object.entries(groupedCommands).map(([category, commands]) => {
								if (commands.length === 0) return null;

								return (
									<div key={category} className="mb-2">
										<div className="px-2 py-1 text-xs font-medium text-text-muted">
											{categoryLabels[category as keyof typeof categoryLabels]}
										</div>
										{commands.map((cmd) => {
											const globalIndex = filteredCommands.indexOf(cmd);
											const isSelected = globalIndex === selectedIndex;
											const Icon = cmd.icon;

											return (
												<button
													key={cmd.id}
													onClick={() => onSelect(cmd)}
													className={`
                            w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors
                            ${
															isSelected
																? "bg-primary/10 text-primary"
																: "hover:bg-surface text-text-primary"
														}
                          `}
												>
													<Icon
														className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isSelected ? "text-primary" : "text-text-muted"}`}
													/>
													<div className="flex-1 min-w-0">
														<div
															className={`font-medium text-sm ${isSelected ? "text-primary" : "text-text-primary"}`}
														>
															{cmd.label}
														</div>
														<div className="text-xs text-text-muted mt-0.5">
															{cmd.description}
														</div>
													</div>
													{isSelected && (
														<div className="text-xs text-text-muted mt-1">
															↵
														</div>
													)}
												</button>
											);
										})}
									</div>
								);
							})}
						</>
					)}
				</div>

				{/* 底部提示 */}
				<div className="px-4 py-2 text-xs text-text-muted border-t border-border bg-surface flex items-center justify-between">
					<div>
						<kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-xs">
							↑↓
						</kbd>
						<span className="ml-2">选择</span>
						<kbd className="ml-4 px-1.5 py-0.5 bg-surface border border-border rounded text-xs">
							↵
						</kbd>
						<span className="ml-2">执行</span>
					</div>
					<div>
						<kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-xs">
							ESC
						</kbd>
						<span className="ml-2">关闭</span>
					</div>
				</div>
			</div>
		</>
	);

	return createPortal(menuContent, document.body);
}
