// 斜杠命令二级菜单容器
// 整合一级菜单（类型选择）、二级菜单（具体命令 / 自定义分类）与三级子菜单（submenu）。

import { ArrowLeft, Blocks, ChevronRight, FileText, Plus } from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useCustomPromptStore } from "../../lib/customPromptStore";
import { useSkillsStore } from "../../lib/skillsStore";
import {
	buildCommandContext,
	commandRegistry,
	executeSlashCommand,
	matchFilter,
	onSlashCommandsPrefsChanged,
	useSlashCommandContext,
	type CommandContext,
	type SlashCommandDefinition,
	type SlashCommandSubOption,
} from "../../lib/slashCommands";
import { chatStore, useChatStoreSelector } from "../../lib/chat/store";
import { EVENTS, events } from "../../lib/events";
import { Terminal as TerminalIcon } from "lucide-react";
import { SlashPrimaryMenu, slashCategories } from "./SlashPrimaryMenu";
import { type SlashCommand, defaultCommands } from "./SlashCommand";
import {
	CommandsCategoryView,
	type CommandsCategoryViewItem,
} from "./slash/CommandsCategoryView";
import { CommandSubmenuView } from "./slash/CommandSubmenuView";
import { RenameInline } from "./slash/RenameInline";

interface SlashMenuContainerProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (command: SlashCommand) => void;
	filter: string;
	dynamicCommands?: SlashCommand[];
	onOpenPromptLibrary?: () => void;
}

// ---------------------------------------------------------------------------
// 分组类型
// ---------------------------------------------------------------------------

interface CommandGroup {
	id: string;
	name: string;
	commands: SlashCommand[];
	isCollapsible: boolean;
}

interface FilteredCommandGroup extends CommandGroup {
	filteredCommands: SlashCommand[];
}

// ---------------------------------------------------------------------------
// 菜单层级状态
// ---------------------------------------------------------------------------

type MenuLevel =
	| { type: "primary" }
	| { type: "secondary"; categoryId: string }
	| { type: "tertiary"; command: SlashCommandDefinition }
	| { type: "rename"; sessionId: string; initialTitle: string };

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export function SlashMenuContainer({
	isOpen,
	onClose,
	onSelect,
	filter,
	dynamicCommands = [],
	onOpenPromptLibrary,
}: SlashMenuContainerProps) {
	const [level, setLevel] = useState<MenuLevel>({ type: "primary" });
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);
	const [activeCommandIndex, setActiveCommandIndex] = useState(0);
	const [activeCommandsCategoryId, setActiveCommandsCategoryId] =
		useState<string | null>(null);
	const { prompts: customPrompts, folders: customFolders } =
		useCustomPromptStore();
	const { enabledSkills } = useSkillsStore();
	const menuRef = useRef<HTMLDivElement>(null);

	// 订阅 chatStore 与 slashCommands 偏好变更，保证 command ctx 是最新的
	useSyncExternalStore(
		onSlashCommandsPrefsChanged,
		() => 0,
		() => 0,
	);
	const chatRevision = useChatStoreSelector(
		(state) => state.sessions.length + (state.activeSessionId ? 1 : 0),
	);

	const slashBridge = useSlashCommandContext();

	// ---- 菜单打开时重置状态 ----
	useEffect(() => {
		if (isOpen) {
			setLevel({ type: "primary" });
			setCollapsedGroups(new Set());
			setActiveCommandIndex(0);
			setActiveCommandsCategoryId(null);
		}
	}, [isOpen]);

	// ---- 点击外部关闭 ----
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

	// ---- 选择一级类别 ----
	const handleSelectCategory = useCallback((categoryId: string) => {
		setLevel({ type: "secondary", categoryId });
		setActiveCommandIndex(0);
	}, []);

	// ---- 返回上一级 ----
	const handleBack = useCallback(() => {
		setLevel((prev) => {
			if (prev.type === "tertiary") {
				return { type: "secondary", categoryId: "command" };
			}
			if (prev.type === "secondary") return { type: "primary" };
			if (prev.type === "rename") return { type: "secondary", categoryId: "command" };
			return prev;
		});
	}, []);

	const toggleGroup = useCallback((groupId: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(groupId)) next.delete(groupId);
			else next.add(groupId);
			return next;
		});
	}, []);

	// ------------------------------------------------------------------
	// 构建"命令"类别的 ctx + 可见命令
	// ------------------------------------------------------------------

	const selectedCategory =
		level.type === "secondary" ? level.categoryId : null;

	const commandCtx: CommandContext | null = useMemo(() => {
		if (selectedCategory !== "command") return null;
		try {
			return buildCommandContext({
				invokeSelectModel: slashBridge.invokeSelectModel,
			});
		} catch (err) {
			console.warn("[SlashMenu] buildCommandContext 失败。", err);
			return null;
		}
		// 依赖 chatRevision 让 ctx 在会话结构变化时重建
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedCategory, slashBridge.invokeSelectModel, chatRevision]);

	const commandItems: CommandsCategoryViewItem[] = useMemo(() => {
		if (selectedCategory !== "command" || !commandCtx) return [];
		try {
			const indexed = commandRegistry.listIndexed(commandCtx);
			const matched = matchFilter(filter, indexed);
			return matched.map((m) => ({
				definition: m.definition,
				availability: m.definition.availability(commandCtx),
			}));
		} catch (err) {
			console.warn("[SlashMenu] 构建命令列表失败。", err);
			return [];
		}
	}, [selectedCategory, commandCtx, filter]);

	// 命令类别被禁用时（settings.enabled===false）直接空列表
	const commandsCategoryDisabled = useMemo(() => {
		if (!commandCtx) return false;
		return commandCtx.settings.enabled === false;
	}, [commandCtx]);

	// 初始化/filter 变化时，确保 activeCommandsCategoryId 指向首个 available 命令
	useEffect(() => {
		if (selectedCategory !== "command") return;
		if (commandItems.length === 0) {
			setActiveCommandsCategoryId(null);
			return;
		}
		const firstAvailable =
			commandItems.find((it) => it.availability.state === "available") ??
			commandItems[0];
		setActiveCommandsCategoryId(firstAvailable?.definition.id ?? null);
	}, [selectedCategory, commandItems]);

	// ------------------------------------------------------------------
	// "其它"类别的分组逻辑（沿用旧实现）
	// ------------------------------------------------------------------

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
				for (const f of customFolders) folderNameMap.set(f.id, f.name);
				const groupMap = new Map<string, SlashCommand[]>();
				for (const p of customPrompts) {
					const groupName = p.folderId
						? folderNameMap.get(p.folderId) || "未分类"
						: "未分类";
					const cmd: SlashCommand = {
						id: `prompt-${p.id}`,
						name: p.name,
						description: p.shortDescription || p.content.slice(0, 40),
						icon: () =>
							p.icon ? (
								<span className="text-sm">{p.icon}</span>
							) : (
								<FileText
									className="w-4 h-4 text-text-secondary"
									strokeWidth={1.5}
								/>
							),
						category: "context" as const,
						group: groupName,
						prompt: p.content,
					};
					if (!groupMap.has(groupName)) groupMap.set(groupName, []);
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
						icon: () => <Blocks className="w-4 h-4" strokeWidth={1.5} />,
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
	}, [
		selectedCategory,
		dynamicCommands,
		customPrompts,
		customFolders,
		enabledSkills,
	]);

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
	const commandItemsRef = useRef(commandItems);
	const activeCommandsCategoryIdRef = useRef<string | null>(null);

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
		commandItemsRef.current = commandItems;
	}, [commandItems]);
	useEffect(() => {
		activeCommandsCategoryIdRef.current = activeCommandsCategoryId;
	}, [activeCommandsCategoryId]);

	// ---- Escape 关闭（统一处理） ----
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

	// ---- 命令执行 ----
	const runCommand = useCallback(
		async (id: string, option?: SlashCommandSubOption) => {
			try {
				await executeSlashCommand(id, option, {
					invokeSelectModel: slashBridge.invokeSelectModel,
				});
			} catch (err) {
				console.error("[SlashMenu] executeSlashCommand 抛错。", err);
			}
		},
		[slashBridge.invokeSelectModel],
	);

	const handleCommandSelected = useCallback(
		(item: CommandsCategoryViewItem) => {
			const def = item.definition;
			// /rename：进入本地行内输入框
			if (def.id === "rename") {
				const s = chatStore.getState();
				const active = s.sessions.find((x) => x.id === s.activeSessionId);
				if (active) {
					setLevel({
						type: "rename",
						sessionId: active.id,
						initialTitle: active.title,
					});
				}
				return;
			}
			if (def.kind === "submenu") {
				setLevel({ type: "tertiary", command: def });
				return;
			}
			// action / prompt
			void runCommand(def.id);
			onClose();
		},
		[onClose, runCommand],
	);

	const handleSubmenuPick = useCallback(
		(option: SlashCommandSubOption) => {
			if (level.type !== "tertiary") return;
			void runCommand(level.command.id, option);
			onClose();
		},
		[level, onClose, runCommand],
	);

	// ---- 键盘导航（secondary 层的命令 / 其它类别）----
	useEffect(() => {
		if (!isOpen) return;
		if (level.type !== "secondary") return;

		const handleKeyDown = (event: KeyboardEvent) => {
			// 命令类别走自己的键盘导航
			if (level.categoryId === "command") {
				const items = commandItemsRef.current;
				if (event.key === "Backspace" && !filterRef.current) {
					event.preventDefault();
					setLevel({ type: "primary" });
					return;
				}
				if (items.length === 0) return;
				switch (event.key) {
					case "ArrowUp":
					case "ArrowDown": {
						event.preventDefault();
						const curId = activeCommandsCategoryIdRef.current;
						const curIndex = curId
							? items.findIndex((it) => it.definition.id === curId)
							: 0;
						const dir = event.key === "ArrowDown" ? 1 : -1;
						let next = curIndex + dir;
						// 跳过 disabled
						for (let tried = 0; tried < items.length; tried++) {
							if (next < 0) next = items.length - 1;
							if (next >= items.length) next = 0;
							if (items[next]!.availability.state === "available") break;
							next += dir;
						}
						setActiveCommandsCategoryId(items[next]?.definition.id ?? null);
						break;
					}
					case "Enter": {
						event.preventDefault();
						const curId = activeCommandsCategoryIdRef.current;
						const item = items.find((it) => it.definition.id === curId);
						if (item && item.availability.state === "available") {
							handleCommandSelected(item);
						}
						break;
					}
					case "Tab": {
						event.preventDefault();
						const curId = activeCommandsCategoryIdRef.current;
						const item = items.find((it) => it.definition.id === curId);
						if (item) {
							events.emit(EVENTS.SLASH_FILL_INPUT, {
								text: `/${item.definition.id}`,
							});
						}
						break;
					}
				}
				return;
			}

			// 其它类别沿用旧的导航
			if (event.key === "Backspace" && !filterRef.current) {
				event.preventDefault();
				setLevel({ type: "primary" });
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
	}, [isOpen, level, onSelect, handleCommandSelected]);

	if (!isOpen) return null;

	// ----------------- 一级菜单 -----------------
	if (level.type === "primary") {
		return (
			<SlashPrimaryMenu
				isOpen={isOpen}
				onClose={onClose}
				onSelectCategory={handleSelectCategory}
				filter={filter}
			/>
		);
	}

	// ----------------- /rename 行内输入框 -----------------
	if (level.type === "rename") {
		return (
			<div
				ref={menuRef}
				className="absolute left-0 bottom-full mb-2 w-[320px] z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
			>
				<RenameInline
					sessionId={level.sessionId}
					initialTitle={level.initialTitle}
					onDone={onClose}
				/>
			</div>
		);
	}

	// ----------------- 三级子菜单 -----------------
	if (level.type === "tertiary") {
		let options: SlashCommandSubOption[] = [];
		try {
			if (commandCtx && level.command.getSubmenu) {
				options = level.command.getSubmenu(commandCtx);
			}
		} catch (err) {
			console.warn("[SlashMenu] getSubmenu 抛错。", err);
			options = [];
		}
		return (
			<div
				ref={menuRef}
				className="absolute left-0 bottom-full mb-2 w-[320px] bg-surface dark:bg-[#2b2b2b] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
			>
				<CommandSubmenuView
					definition={level.command}
					options={options}
					filter={filter}
					onPick={handleSubmenuPick}
					onBack={() => setLevel({ type: "secondary", categoryId: "command" })}
				/>
			</div>
		);
	}

	// ----------------- 二级菜单（命令类别：走 CommandsCategoryView） -----------------
	if (level.categoryId === "command") {
		return (
			<div
				ref={menuRef}
				className="absolute left-0 bottom-full mb-2 w-[320px] bg-surface dark:bg-[#2b2b2b] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
			>
				<div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#f0f0f0] dark:border-[#333]">
					<div
						role="button"
						tabIndex={-1}
						onClick={() => setLevel({ type: "primary" })}
						className="w-7 h-7 flex items-center justify-center text-[#999] hover:text-[#666] dark:hover:text-[#bbb] hover:bg-[#f3f3f3] dark:hover:bg-[#363636] rounded-lg transition-colors duration-100 active:scale-95 cursor-pointer select-none"
						title="返回"
					>
						<ArrowLeft className="w-4 h-4" />
					</div>
					<div className="flex items-center gap-2">
						<div
							className={`w-5 h-5 rounded-md flex items-center justify-center ${gradient}`}
						>
							<TerminalIcon className="w-3 h-3" />
						</div>
						<span className="text-[13px] font-medium text-[#1a1a1a] dark:text-[#eee]">
							{categoryName || "命令"}
						</span>
						{commandItems.length > 0 && (
							<span className="text-[10px] text-[#bbb] dark:text-[#555]">
								{commandItems.length}
							</span>
						)}
					</div>
				</div>

				<div className="max-h-[320px] overflow-y-auto">
					{commandsCategoryDisabled ? (
						<div className="px-4 py-8 text-center">
							<p className="text-[13px] text-[#999] dark:text-[#666]">
								命令类别已在设置中关闭。
							</p>
						</div>
					) : (
						<CommandsCategoryView
							items={commandItems}
							activeId={activeCommandsCategoryId}
							onActiveChange={setActiveCommandsCategoryId}
							onSelect={handleCommandSelected}
						/>
					)}
				</div>

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
						<span className="flex items-center gap-1">
							<span className="font-mono text-[9px]">Tab</span>
							<span>回填</span>
						</span>
					</div>
				</div>
			</div>
		);
	}

	// ----------------- 二级菜单（其它类别，沿用旧 UI） -----------------
	return (
		<div
			ref={menuRef}
			className="absolute left-0 bottom-full mb-2 w-[300px] bg-surface dark:bg-[#2b2b2b] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
		>
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
						<div
							className={`w-5 h-5 rounded-md flex items-center justify-center ${gradient}`}
						>
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

// ---------------------------------------------------------------------------
// 分组区块组件（旧 UI，用于 file / prompt / action 类别）
// ---------------------------------------------------------------------------

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
			{group.isCollapsible ? (
				<div
					role="button"
					tabIndex={-1}
					onClick={onToggle}
					className="w-full flex items-center gap-1.5 px-4 py-1.5 text-left hover:bg-[#fafafa] dark:hover:bg-[#333]/60 transition-colors duration-100 cursor-pointer select-none"
				>
					<ChevronRight
						className={`w-3 h-3 text-[#ccc] dark:text-[#555] transition-transform duration-150 ${
							isCollapsed ? "" : "rotate-90"
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
                  ${isSelected ? "bg-[#f3f3f3] dark:bg-[#363636]" : ""}`}
							>
								<div
									className={`w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0 transition-all duration-[120ms]
                    ${
										isSelected
											? "bg-surface dark:bg-[#404040] shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
											: "bg-[#f5f5f5] dark:bg-[#363636]"
									}`}
								>
									<command.icon
										className={`w-3.5 h-3.5 transition-colors duration-[120ms]
                      ${isSelected ? "text-[#555] dark:text-[#ccc]" : "text-[#999] dark:text-[#666]"}`}
									/>
								</div>

								<div className="flex-1 min-w-0">
									<div
										className={`text-[13px] font-medium truncate transition-colors duration-[120ms]
                      ${
											isSelected
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
