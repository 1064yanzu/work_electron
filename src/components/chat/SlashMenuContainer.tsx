// 斜杠命令二级菜单容器
// 整合一级菜单（类型选择）和二级菜单（具体命令）

import {
	ArrowLeft,
	ChevronRight,
	Plus,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCustomPromptStore } from "../../lib/customPromptStore";
import { useSkillsStore } from "../../lib/skillsStore";
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
	const { enabledSkills } = useSkillsStore();
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
		setActiveCommandIndex(0);
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
				const groups: CommandGroup[] = [];

				const sourceCommands = dynamicCommands.filter(
					(cmd) => cmd.group === "资料库",
				);
				if (sourceCommands.length > 0) {
					groups.push({
						id: "sources",
						name: "资料库",
						commands: sourceCommands,
						isCollapsible: true,
					});
				}

				const recentCommands = dynamicCommands.filter(
					(cmd) => cmd.group === "最近打开",
				);
				if (recentCommands.length > 0) {
					groups.push({
						id: "recent",
						name: "最近打开",
						commands: recentCommands,
						isCollapsible: true,
					});
				}

				const docCommands = dynamicCommands.filter(
					(cmd) => cmd.group === "文档",
				);
				if (docCommands.length > 0) {
					groups.push({
						id: "docs",
						name: "文档缓存",
						commands: docCommands,
						isCollapsible: true,
					});
				}

				return groups;
			}

			case "folder": {
				const folderCommands = dynamicCommands.filter(
					(cmd) => cmd.id === "import-file",
				);
				return [
					{
						id: "folder-actions",
						name: "文件夹操作",
						commands: folderCommands,
						isCollapsible: false,
					},
				];
			}

			case "prompt": {
				const folderNameMap = new Map<string, string>();
				for (const f of customFolders) {
					folderNameMap.set(f.id, f.name);
				}

				const groupMap = new Map<string, SlashCommand[]>();

				for (const p of customPrompts) {
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
				const agentSkillCommands: SlashCommand[] = enabledSkills.map(
					(skill) => ({
						id: `agent-skill-${skill.name}`,
						name: skill.name,
						description: skill.description || "强制使用此技能",
						icon: () => <Zap className="w-4 h-4" />,
						category: "skill" as const,
						group: "Agent 技能",
						prompt: `[FORCE_SKILL:${skill.name}]`,
					}),
				);

				if (agentSkillCommands.length === 0) {
					return [
						{
							id: "no-agent-skills",
							name: "暂无已启用的 Agent 技能",
							commands: [],
							isCollapsible: false,
						},
					];
				}

				return [
					{
						id: "agent-skills",
						name: "Agent 技能",
						commands: agentSkillCommands,
						isCollapsible: false,
					},
				];
			}

			case "action": {
				const actionCommands = [
					...defaultCommands.filter((cmd) => cmd.category === "action"),
					...dynamicCommands.filter((cmd) => cmd.group === "卡片"),
				];
				return [
					{
						id: "actions",
						name: "快捷操作",
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
			iconColor: cat?.iconColor || "text-[#999]",
			Icon: cat?.icon,
			gradient: cat?.gradient || "",
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

	const { name: categoryName, Icon, gradient } = getCategoryInfo();
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

	// Escape 键关闭
	useEffect(() => {
		if (!isOpen) return;
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [isOpen, onClose]);

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
			className="absolute left-0 bottom-full mb-2 w-[300px] bg-white dark:bg-[#2b2b2b] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
		>
			{/* 头部：返回按钮 + 标题 */}
			<div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#f0f0f0] dark:border-[#333]">
				<div
					role="button"
					tabIndex={-1}
					onClick={handleBack}
					className="w-7 h-7 flex items-center justify-center text-[#999] hover:text-[#666] dark:hover:text-[#bbb] hover:bg-[#f3f3f3] dark:hover:bg-[#363636] rounded-lg transition-colors duration-100 active:scale-95 cursor-pointer select-none"
					title="返回"
				>
					<ArrowLeft className="w-4 h-4" />
				</div>
				<div className="flex items-center gap-2">
					{Icon && (
						<div className={`w-5 h-5 rounded-md flex items-center justify-center ${gradient}`}>
							<Icon className="w-3 h-3" />
						</div>
					)}
					<span className="text-[13px] font-medium text-[#1a1a1a] dark:text-[#eee]">
						{categoryName}
					</span>
					{totalCommands > 0 && (
						<span className="text-[10px] text-[#bbb] dark:text-[#555]">
							{totalCommands}
						</span>
					)}
				</div>
			</div>

			{/* 添加提示词按钮（仅在提示词类别显示） */}
			{showAddPromptButton && onOpenPromptLibrary && (
				<div
					role="button"
					tabIndex={-1}
					onClick={() => {
						onOpenPromptLibrary();
						onClose();
					}}
					className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-[#f0f0f0] dark:border-[#333] hover:bg-[#f8f8f8] dark:hover:bg-[#333] transition-colors duration-100 cursor-pointer select-none group"
				>
					<div className="w-6 h-6 rounded-md bg-[#f3f3f3] dark:bg-[#363636] flex items-center justify-center group-hover:bg-[#eee] dark:group-hover:bg-[#404040] transition-colors duration-100">
						<Plus className="w-3.5 h-3.5 text-[#999] group-hover:text-[#666]" />
					</div>
					<div>
						<span className="text-[12px] font-medium text-[#666] dark:text-[#999] group-hover:text-[#333] dark:group-hover:text-[#ddd]">
							添加提示词
						</span>
					</div>
				</div>
			)}

			{/* 命令列表 */}
			<div className="max-h-[300px] overflow-y-auto">
				{filteredGroups.length === 0 && totalCommands === 0 ? (
					<div className="px-4 py-8 text-center">
						<p className="text-[13px] text-[#999] dark:text-[#666]">
							{selectedCategory === "prompt"
								? "暂无自定义提示词"
								: "暂无可用命令"}
						</p>
					</div>
				) : (
					<div className="py-0.5">
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
			<div className="px-4 py-1.5 border-t border-[#f0f0f0] dark:border-[#333]">
				<div className="flex items-center justify-center gap-4 text-[10px] text-[#ccc] dark:text-[#555]">
					<span className="flex items-center gap-1">
						<span className="font-mono text-[9px]">⌫</span>
						<span>返回</span>
					</span>
					<span className="flex items-center gap-1">
						<span className="font-mono text-[9px]">↵</span>
						<span>选择</span>
					</span>
				</div>
			</div>
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
		<div>
			{/* 分组标题 */}
			{group.isCollapsible ? (
				<div
					role="button"
					tabIndex={-1}
					onClick={onToggle}
					className="w-full flex items-center gap-1.5 px-4 py-1.5 text-left hover:bg-[#fafafa] dark:hover:bg-[#333]/60 transition-colors duration-100 cursor-pointer select-none"
				>
					<ChevronRight
						className={`w-3 h-3 text-[#ccc] dark:text-[#555] transition-transform duration-150 ${isCollapsed ? "" : "rotate-90"
							}`}
					/>
					<span className="text-[11px] font-medium text-[#aaa] dark:text-[#666]">
						{group.name}
					</span>
					<span className="text-[10px] text-[#ccc] dark:text-[#555]">
						{filteredCommands.length}
					</span>
				</div>
			) : (
				<div className="px-4 py-1.5">
					<span className="text-[11px] font-medium text-[#aaa] dark:text-[#666]">
						{group.name}
					</span>
				</div>
			)}

			{/* 命令列表 — 使用 div 替代 button 避免 focus ring */}
			{!isCollapsed && (
				<div className="px-1.5" role="listbox">
					{filteredCommands.map((command) => {
						const isSelected = command.id === activeCommandId;
						return (
							<div
								key={command.id}
								role="option"
								aria-selected={isSelected}
								tabIndex={-1}
								onClick={() => onSelect(command)}
								onMouseEnter={() => onHoverCommand(command.id)}
								className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-left cursor-pointer select-none
                  transition-all duration-[120ms] ease-out
                  ${isSelected
										? "bg-[#f3f3f3] dark:bg-[#363636]"
										: ""
									}`}
							>
								{/* 图标 */}
								<div
									className={`w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0 transition-all duration-[120ms]
                    ${isSelected
											? "bg-white dark:bg-[#404040] shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
											: "bg-[#f5f5f5] dark:bg-[#363636]"
										}`}
								>
									<command.icon
										className={`w-3.5 h-3.5 transition-colors duration-[120ms]
                      ${isSelected ? "text-[#555] dark:text-[#ccc]" : "text-[#999] dark:text-[#666]"}`}
									/>
								</div>

								{/* 文字 */}
								<div className="flex-1 min-w-0">
									<div
										className={`text-[13px] font-medium truncate transition-colors duration-[120ms]
                      ${isSelected
												? "text-[#1a1a1a] dark:text-[#eee]"
												: "text-[#666] dark:text-[#999]"
											}`}
									>
										{command.name}
									</div>
									<div className="text-[11px] truncate text-[#bbb] dark:text-[#555]">
										{command.description}
									</div>
								</div>

								{/* 选中 Enter 提示 */}
								{isSelected && (
									<span className="text-[10px] font-mono text-[#ccc] dark:text-[#555] flex-shrink-0">
										↵
									</span>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
