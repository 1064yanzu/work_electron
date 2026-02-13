// 斜杠命令二级菜单容器 - Claude 风格高级质感
// 整合一级菜单（类型选择）和二级菜单（具体命令）

import {
	ArrowLeft,
	ChevronDown,
	ChevronRight,
	Plus,
	Sparkles,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCustomPromptStore } from "../../lib/customPromptStore";
import { useSkillsStore } from "../../lib/skillsStore";
import { FocusTrap } from "../ui/FocusTrap";
import { SlashPrimaryMenu, slashCategories } from "./SlashPrimaryMenu";
import { type SlashCommand, defaultCommands } from "./SlashCommand";

interface SlashMenuContainerProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (command: SlashCommand) => void;
	filter: string;
	dynamicCommands?: SlashCommand[];
	onOpenPromptLibrary?: () => void;
}

// 分组类型
interface CommandGroup {
	id: string;
	name: string;
	commands: SlashCommand[];
	isCollapsible: boolean;
}

interface FilteredCommandGroup extends CommandGroup {
	filteredCommands: SlashCommand[];
}

export function SlashMenuContainer({
	isOpen,
	onClose,
	onSelect,
	filter,
	dynamicCommands = [],
	onOpenPromptLibrary,
}: SlashMenuContainerProps) {
	const [level, setLevel] = useState<"primary" | "secondary">("primary");
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);
	const [activeCommandIndex, setActiveCommandIndex] = useState(0);
	const { prompts: customPrompts, folders: customFolders } =
		useCustomPromptStore();
	const { enabledSkills } = useSkillsStore(); // 使用 hook 获取已启用的 Agent Skills
	const menuRef = useRef<HTMLDivElement>(null);

	// 当菜单打开时重置状态
	useEffect(() => {
		if (isOpen) {
			setLevel("primary");
			setSelectedCategory(null);
			setCollapsedGroups(new Set());
			setActiveCommandIndex(0);
		}
	}, [isOpen]);

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

	// 选择类别，进入二级菜单
	const handleSelectCategory = useCallback((categoryId: string) => {
		setSelectedCategory(categoryId);
		setLevel("secondary");
	}, []);

	// 返回一级菜单
	const handleBack = useCallback(() => {
		setLevel("primary");
		setSelectedCategory(null);
	}, []);

	// 切换分组折叠状态
	const toggleGroup = useCallback((groupId: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(groupId)) {
				next.delete(groupId);
			} else {
				next.add(groupId);
			}
			return next;
		});
	}, []);

	// 根据类别获取分组后的命令
	const categoryGroups = useMemo<CommandGroup[]>(() => {
		switch (selectedCategory) {
			case "file": {
				// 文件按来源分组
				const groups: CommandGroup[] = [];

				// 资料库
				const sourceCommands = dynamicCommands.filter(
					(cmd) => cmd.group === "资料库",
				);
				if (sourceCommands.length > 0) {
					groups.push({
						id: "sources",
						name: "📚 资料库",
						commands: sourceCommands,
						isCollapsible: true,
					});
				}

				// 最近打开
				const recentCommands = dynamicCommands.filter(
					(cmd) => cmd.group === "最近打开",
				);
				if (recentCommands.length > 0) {
					groups.push({
						id: "recent",
						name: "🕐 最近打开",
						commands: recentCommands,
						isCollapsible: true,
					});
				}

				// 文档
				const docCommands = dynamicCommands.filter(
					(cmd) => cmd.group === "文档",
				);
				if (docCommands.length > 0) {
					groups.push({
						id: "docs",
						name: "📄 文档缓存",
						commands: docCommands,
						isCollapsible: true,
					});
				}

				return groups;
			}

			case "folder": {
				// 文件夹操作
				const folderCommands = dynamicCommands.filter(
					(cmd) => cmd.id === "import-file",
				);
				return [
					{
						id: "folder-actions",
						name: "📁 文件夹操作",
						commands: folderCommands,
						isCollapsible: false,
					},
				];
			}

			case "prompt": {
				// 自定义提示词按文件夹分组
				// 构建 folderId -> folderName 的映射
				const folderNameMap = new Map<string, string>();
				for (const f of customFolders) {
					folderNameMap.set(f.id, f.name);
				}

				const groupMap = new Map<string, SlashCommand[]>();

				for (const p of customPrompts) {
					// 获取文件夹名称或使用"未分类"
					const groupName = p.folderId
						? folderNameMap.get(p.folderId) || "未分类"
						: "未分类";

					const cmd: SlashCommand = {
						id: `prompt-${p.id}`,
						name: p.name,
						description: p.shortDescription || p.content.slice(0, 40),
						icon: () => <span className="text-sm">{p.icon || "📝"}</span>,
						category: "context" as const,
						group: groupName,
						prompt: p.content,
					};

					if (!groupMap.has(groupName)) {
						groupMap.set(groupName, []);
					}
					groupMap.get(groupName)?.push(cmd);
				}

				const groups: CommandGroup[] = [];
				for (const [groupName, commands] of groupMap) {
					groups.push({
						id: `prompt-${groupName}`,
						name: groupName,
						commands,
						isCollapsible: true,
					});
				}

				return groups;
			}

			case "agent_skill": {
				// Agent 技能（来自设置页面的 Skills）
				const agentSkillCommands: SlashCommand[] = enabledSkills.map(
					(skill) => ({
						id: `agent-skill-${skill.name}`,
						name: skill.name,
						description: skill.description || "强制使用此技能",
						icon: () => <Zap className="w-4 h-4" />,
						category: "skill" as const,
						group: "Agent 技能",
						// 存储 skill 名称以便后续强制执行
						prompt: `[FORCE_SKILL:${skill.name}]`,
					}),
				);

				if (agentSkillCommands.length === 0) {
					return [
						{
							id: "no-agent-skills",
							name: "⚠️ 暂无已启用的 Agent 技能",
							commands: [],
							isCollapsible: false,
						},
					];
				}

				return [
					{
						id: "agent-skills",
						name: "⚡ Agent 技能",
						commands: agentSkillCommands,
						isCollapsible: false,
					},
				];
			}

			case "action": {
				// 操作类命令
				const actionCommands = [
					...defaultCommands.filter((cmd) => cmd.category === "action"),
					...dynamicCommands.filter((cmd) => cmd.group === "卡片"),
				];
				return [
					{
						id: "actions",
						name: "⚡ 快捷操作",
						commands: actionCommands,
						isCollapsible: false,
					},
				];
			}

			default:
				return [];
		}
	}, [selectedCategory, dynamicCommands, customPrompts, customFolders, enabledSkills]);

	// 获取类别标题和颜色
	const getCategoryInfo = useCallback(() => {
		const cat = slashCategories.find((c) => c.id === selectedCategory);
		return {
			name: cat?.name || "",
			iconColor: cat?.iconColor || "text-zinc-500",
			Icon: cat?.icon,
		};
	}, [selectedCategory]);

	const categoryGroupSearchIndex = useMemo(
		() =>
			categoryGroups.map((group) => ({
				group,
				searchableTextList: group.commands.map((command) =>
					`${command.name}\n${command.description}`.toLowerCase(),
				),
			})),
		[categoryGroups],
	);

	const filteredGroups = useMemo<FilteredCommandGroup[]>(() => {
		const keyword = filter.trim().toLowerCase();
		if (!keyword) {
			return categoryGroups
				.map((group) => ({ ...group, filteredCommands: group.commands }))
				.filter((group) => group.filteredCommands.length > 0);
		}
		return categoryGroupSearchIndex
			.map(({ group, searchableTextList }) => ({
				...group,
				filteredCommands: group.commands.filter((_, index) =>
					searchableTextList[index]?.includes(keyword),
				),
			}))
			.filter((group) => group.filteredCommands.length > 0);
	}, [categoryGroups, categoryGroupSearchIndex, filter]);
	const visibleCommands = useMemo(
		() =>
			filteredGroups.flatMap((group) =>
				collapsedGroups.has(group.id) ? [] : group.filteredCommands,
			),
		[filteredGroups, collapsedGroups],
	);
	const visibleCommandIndexMap = useMemo(() => {
		const indexMap = new Map<string, number>();
		for (let index = 0; index < visibleCommands.length; index += 1) {
			const command = visibleCommands[index];
			if (!command) continue;
			indexMap.set(command.id, index);
		}
		return indexMap;
	}, [visibleCommands]);
	const { name: categoryName, iconColor, Icon } = getCategoryInfo();
	const showAddPromptButton = selectedCategory === "prompt";

	// 计算总命令数
	const totalCommands = filteredGroups.reduce(
		(sum, group) => sum + group.filteredCommands.length,
		0,
	);

	useEffect(() => {
		setActiveCommandIndex((previous) => {
			if (visibleCommands.length === 0) return 0;
			return Math.min(previous, visibleCommands.length - 1);
		});
	}, [visibleCommands]);

	const visibleCommandsRef = useRef<SlashCommand[]>(visibleCommands);
	const activeCommandIndexRef = useRef(activeCommandIndex);
	const filterRef = useRef(filter);

	useEffect(() => {
		visibleCommandsRef.current = visibleCommands;
	}, [visibleCommands]);

	useEffect(() => {
		activeCommandIndexRef.current = activeCommandIndex;
	}, [activeCommandIndex]);

	useEffect(() => {
		filterRef.current = filter;
	}, [filter]);

	useEffect(() => {
		if (!isOpen || level !== "secondary") return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Backspace" && !filterRef.current) {
				event.preventDefault();
				setLevel("primary");
				setSelectedCategory(null);
				return;
			}

			const commands = visibleCommandsRef.current;
			if (commands.length === 0) return;
			switch (event.key) {
				case "ArrowUp":
					event.preventDefault();
					setActiveCommandIndex((previous) =>
						previous > 0 ? previous - 1 : commands.length - 1,
					);
					break;
				case "ArrowDown":
					event.preventDefault();
					setActiveCommandIndex((previous) =>
						previous < commands.length - 1 ? previous + 1 : 0,
					);
					break;
				case "Enter":
					event.preventDefault();
					{
						const command = commands[activeCommandIndexRef.current];
						if (command) onSelect(command);
					}
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, level, onSelect]);

	if (!isOpen) return null;

	// 一级菜单
	if (level === "primary") {
		return (
			<SlashPrimaryMenu
				isOpen={isOpen}
				onClose={onClose}
				onSelectCategory={handleSelectCategory}
				filter={filter}
			/>
		);
	}

	return (
		<div
			ref={menuRef}
			className="absolute left-0 bottom-full mb-2 w-[360px] bg-white/98 dark:bg-zinc-900/98 backdrop-blur-2xl rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_12px_32px_-8px_rgba(0,0,0,0.12),0_24px_60px_-12px_rgba(0,0,0,0.15)] border border-zinc-200/40 dark:border-zinc-700/40 overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-3 duration-200"
		>
			<FocusTrap onEscape={onClose} role="menu" aria-label="斜杠命令菜单">
				{/* 头部：返回按钮 + 标题 */}
				<div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800/80">
					<button
						onClick={handleBack}
						aria-label="返回命令类型"
						className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-90"
						title="返回"
					>
						<ArrowLeft className="w-5 h-5" />
					</button>
					<div className="flex items-center gap-2.5">
						{Icon && (
							<div className="w-7 h-7 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-sm">
								<Icon className={`w-4 h-4 ${iconColor}`} />
							</div>
						)}
						<span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
							{categoryName}
						</span>
						<span className="px-2 py-0.5 text-[10px] font-semibold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-full">
							{totalCommands}
						</span>
					</div>
				</div>

				{/* 添加提示词按钮（仅在提示词类别显示）- 高级中性风格 */}
				{showAddPromptButton && onOpenPromptLibrary && (
					<button
						onClick={() => {
							onOpenPromptLibrary();
							onClose();
						}}
						className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left text-sm border-b border-zinc-100 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all group active:scale-[0.99]"
					>
						<div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-sm group-hover:scale-105 group-hover:shadow-md transition-all duration-200">
							<Plus className="w-4.5 h-4.5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200" />
						</div>
						<div>
							<span className="font-medium text-zinc-700 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
								添加提示词
							</span>
							<p className="text-xs text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-500 dark:group-hover:text-zinc-400">
								管理自定义提示词库
							</p>
						</div>
					</button>
				)}

				{/* 命令列表 */}
				<div className="max-h-[320px] overflow-y-auto">
					{filteredGroups.length === 0 && totalCommands === 0 ? (
						<div className="px-4 py-10 text-center">
							<div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
								<Sparkles className="w-6 h-6 text-zinc-400" />
							</div>
							<p className="text-sm text-zinc-500 dark:text-zinc-400">
								{selectedCategory === "prompt"
									? "暂无自定义提示词"
									: "暂无可用命令"}
							</p>
						</div>
					) : (
						<div className="py-1">
							{filteredGroups.map((group) => (
								<GroupSection
									key={group.id}
									group={group}
									filteredCommands={group.filteredCommands}
									isCollapsed={collapsedGroups.has(group.id)}
									onToggle={() => toggleGroup(group.id)}
									onSelect={onSelect}
									activeCommandId={visibleCommands[activeCommandIndex]?.id}
									onHoverCommand={(commandId) => {
										const index = visibleCommandIndexMap.get(commandId);
										if (typeof index === "number") {
											setActiveCommandIndex(index);
										}
									}}
								/>
							))}
						</div>
					)}
				</div>

				{/* 底部快捷键提示 */}
				<div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
					<div className="flex items-center justify-center gap-4 text-[10px] text-zinc-400">
						<span className="flex items-center gap-1">
							<kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-800 rounded shadow-sm ring-1 ring-black/5 dark:ring-white/10 font-medium">
								⌫
							</kbd>
							<span>返回</span>
						</span>
						<span className="flex items-center gap-1">
							<kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-800 rounded shadow-sm ring-1 ring-black/5 dark:ring-white/10 font-medium">
								↵
							</kbd>
							<span>选择</span>
						</span>
					</div>
				</div>
			</FocusTrap>
		</div>
	);
}

// 分组区块组件
function GroupSection({
	group,
	filteredCommands,
	isCollapsed,
	onToggle,
	onSelect,
	activeCommandId,
	onHoverCommand,
}: {
	group: CommandGroup;
	filteredCommands: SlashCommand[];
	isCollapsed: boolean;
	onToggle: () => void;
	onSelect: (command: SlashCommand) => void;
	activeCommandId?: string;
	onHoverCommand: (commandId: string) => void;
}) {
	if (filteredCommands.length === 0) return null;

	return (
		<div className="mb-1">
			{/* 分组标题 */}
			{group.isCollapsible ? (
				<button
					onClick={onToggle}
					className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
				>
					{isCollapsed ? (
						<ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
					) : (
						<ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
					)}
					<span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
						{group.name}
					</span>
					<span className="px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-full">
						{filteredCommands.length}
					</span>
				</button>
			) : (
				<div className="px-4 py-2.5">
					<span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
						{group.name}
					</span>
				</div>
			)}

			{/* 命令列表 */}
			{!isCollapsed && (
				<div className="px-1.5">
					{filteredCommands.map((command) => {
						const isSelected = command.id === activeCommandId;
						return (
							<button
								key={command.id}
								onClick={() => onSelect(command)}
								onMouseEnter={() => onHoverCommand(command.id)}
								className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-all duration-200
                  ${
										isSelected
											? "bg-zinc-100 dark:bg-zinc-800 shadow-sm ring-1 ring-inset ring-black/[0.02] dark:ring-white/[0.04]"
											: "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:scale-[0.98]"
									}`}
							>
								{/* 图标 */}
								<div
									className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200
                    ${
											isSelected
												? "bg-white dark:bg-zinc-700 shadow-md ring-1 ring-black/[0.03] dark:ring-white/[0.06]"
												: "bg-zinc-100 dark:bg-zinc-800 shadow-sm"
										}`}
								>
									<command.icon
										className={`w-4.5 h-4.5 transition-colors ${isSelected ? "text-zinc-700 dark:text-zinc-200" : "text-zinc-500 dark:text-zinc-400"}`}
									/>
								</div>

								{/* 文字 */}
								<div className="flex-1 min-w-0">
									<div
										className={`text-sm font-medium truncate ${
											isSelected
												? "text-zinc-900 dark:text-zinc-100"
												: "text-zinc-700 dark:text-zinc-300"
										}`}
									>
										{command.name}
									</div>
									<div
										className={`text-xs truncate ${
											isSelected
												? "text-zinc-500 dark:text-zinc-400"
												: "text-zinc-400 dark:text-zinc-500"
										}`}
									>
										{command.description}
									</div>
								</div>

								{/* 选中指示器 */}
								{isSelected && (
									<span className="px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 bg-white dark:bg-zinc-700 rounded shadow-sm">
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
}
