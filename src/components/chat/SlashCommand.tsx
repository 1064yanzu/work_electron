// 斜杠命令菜单组件

import {
	ChevronDown,
	ChevronRight,
	FileEdit,
	Lightbulb,
	ListChecks,
	MessageSquare,
	Pencil,
	Search,
	Command,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface SlashCommand {
	id: string;
	name: string;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
	category: "context" | "skill" | "action" | "data";
	group?: string; // 新增分组字段
	action?: () => void;
	prompt?: string; // 预设的提示词
}

// 预设命令列表 - 基础功能类
export const defaultCommands: SlashCommand[] = [
	// 技能类
	{
		id: "write",
		name: "写作",
		description: "帮我写文章、报告",
		icon: Pencil,
		category: "skill",
		group: "技能",
		prompt: "请帮我写一篇关于以下主题的文章：",
	},
	{
		id: "edit",
		name: "编辑",
		description: "润色、修改文本",
		icon: FileEdit,
		category: "skill",
		group: "技能",
		prompt: "请帮我润色和改进以下文本：",
	},
	{
		id: "summarize",
		name: "总结",
		description: "总结内容要点",
		icon: ListChecks,
		category: "skill",
		group: "技能",
		prompt: "请帮我总结以下内容的要点：",
	},
	{
		id: "brainstorm",
		name: "头脑风暴",
		description: "生成创意想法",
		icon: Lightbulb,
		category: "skill",
		group: "技能",
		prompt: "请帮我针对以下主题进行头脑风暴，列出创意想法：",
	},
	{
		id: "explain",
		name: "解释",
		description: "解释概念或内容",
		icon: MessageSquare,
		category: "skill",
		group: "技能",
		prompt: "请通俗易懂地解释以下概念或内容：",
	},

	// 动作类
	{
		id: "search",
		name: "搜索",
		description: "搜索资料库",
		icon: Search,
		category: "action",
		group: "操作",
	},
	{
		id: "generate",
		name: "生成",
		description: "AI 生成内容",
		icon: Command,
		category: "action",
		group: "操作",
	},
];

interface SlashCommandMenuProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (command: SlashCommand) => void;
	filter: string;
	commands?: SlashCommand[]; // 允许传入动态命令
	hideDefaultCommands?: boolean; // 是否隐藏默认命令
	position?: { top: number; left: number };
}

export function SlashCommandMenu({
	isOpen,
	onClose,
	onSelect,
	filter,
	commands = [], // 默认为空，将与 defaultCommands 合并
	hideDefaultCommands = false,
}: SlashCommandMenuProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);
	const menuRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

	// 合并静态和动态命令
	const allCommands = hideDefaultCommands
		? commands
		: [...commands, ...defaultCommands];

	// 过滤命令
	const filteredCommands = useMemo(() => {
		return allCommands.filter(
			(cmd) =>
				cmd.name.toLowerCase().includes(filter.toLowerCase()) ||
				cmd.description.toLowerCase().includes(filter.toLowerCase()),
		);
	}, [allCommands, filter]);

	// 分组逻辑
	const groupedCommands = useMemo(() => {
		const groups: Record<string, SlashCommand[]> = {};
		const defaultGroup = "其他";

		filteredCommands.forEach((cmd) => {
			const groupName = cmd.group || defaultGroup;
			if (!groups[groupName]) {
				groups[groupName] = [];
			}
			groups[groupName].push(cmd);
		});

		return groups;
	}, [filteredCommands]);

	// 扁平化列表用于键盘导航（跳过已折叠的组）
	const flatCommands = useMemo(() => {
		const flat: SlashCommand[] = [];
		Object.entries(groupedCommands).forEach(([groupName, cmds]) => {
			if (!collapsedGroups.has(groupName)) {
				flat.push(...cmds);
			}
		});
		return flat;
	}, [groupedCommands, collapsedGroups]);

	// 重置选中项
	useEffect(() => {
		setSelectedIndex(0);
		itemRefs.current = [];
	}, [filter, collapsedGroups]);

	// 自动滚动到选中项
	useEffect(() => {
		if (itemRefs.current[selectedIndex]) {
			itemRefs.current[selectedIndex]?.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
			});
		}
	}, [selectedIndex]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isOpen) return;

			switch (e.key) {
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((prev) =>
						prev > 0 ? prev - 1 : flatCommands.length - 1,
					);
					break;
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((prev) =>
						prev < flatCommands.length - 1 ? prev + 1 : 0,
					);
					break;
				case "Enter":
					e.preventDefault();
					if (flatCommands[selectedIndex]) {
						onSelect(flatCommands[selectedIndex]);
					}
					break;
				case "Escape":
					e.preventDefault();
					onClose();
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, flatCommands, selectedIndex, onSelect, onClose]);

	// 点击外部关闭
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen, onClose]);

	const toggleGroup = (groupName: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(groupName)) {
				next.delete(groupName);
			} else {
				next.add(groupName);
			}
			return next;
		});
	};

	if (!isOpen) return null;

	if (flatCommands.length === 0 && Object.keys(groupedCommands).length === 0)
		return null;

	let currentIndex = 0;

	return (
		<div
			ref={menuRef}
			className="absolute left-0 bottom-full mb-2 w-[320px] bg-surface rounded-xl shadow-2xl border border-border overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150"
		>
			<div className="max-h-[320px] overflow-y-auto py-1.5 scrollbar-hide">
				{Object.entries(groupedCommands).map(([groupName, commands]) => {
					if (commands.length === 0) return null;
					const isCollapsed = collapsedGroups.has(groupName);

					return (
						<div key={groupName} className="mb-1 last:mb-0">
							{/* 分组标题 - 改为 Button 以明确可交互性 */}
							<button
								type="button"
								className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-text-light uppercase tracking-wider hover:bg-warm-200 dark:hover:bg-cream-700 rounded transition-colors select-none outline-none focus:bg-warm-200 dark:focus:bg-cream-700"
								onClick={() => toggleGroup(groupName)}
							>
								<span>{groupName}</span>
								{isCollapsed ? (
									<ChevronRight className="w-3 h-3" />
								) : (
									<ChevronDown className="w-3 h-3" />
								)}
							</button>

							{/* 分组内容 */}
							{!isCollapsed && (
								<div className="space-y-0.5">
									{commands.map((command) => {
										const isSelected = currentIndex === selectedIndex;
										const myIndex = currentIndex++; // 记录当前的全局索引

										return (
											<button
												key={command.id}
												ref={(el) => {
													itemRefs.current[myIndex] = el;
												}}
												onClick={() => onSelect(command)}
												className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors text-sm
                          ${
														isSelected
															? "bg-warm-200 dark:bg-cream-700 text-text-primary"
															: "text-text-secondary hover:bg-warm-50 dark:hover:bg-cream-700/50"
													}
                        `}
											>
												<div
													className={`p-1.5 rounded-md ${isSelected ? "bg-surface dark:bg-cream-600 shadow-sm" : "bg-warm-200"}`}
												>
													<command.icon className="w-4 h-4" />
												</div>
												<div className="flex-1 min-w-0">
													<div className="font-medium truncate">
														{command.name}
													</div>
													<div className="text-xs text-text-light truncate opacity-80">
														{command.description}
													</div>
												</div>
												{isSelected && (
													<span className="text-[11px] text-text-light font-medium bg-surface dark:bg-cream-600 px-1.5 py-0.5 rounded shadow-sm">
														↵
													</span>
												)}
											</button>
										);
									})}
								</div>
							)}
						</div>
					);
				})}

				{flatCommands.length === 0 && (
					<div className="px-4 py-8 text-center text-sm text-text-light">
						未找到相关命令
					</div>
				)}
			</div>
		</div>
	);
}
