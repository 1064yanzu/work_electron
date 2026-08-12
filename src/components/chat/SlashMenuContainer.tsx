// 斜杠命令二级菜单容器
// 扁平化版本：默认进入「命令」二级菜单；顶部胶囊条切换其他类型；三级子菜单走 CommandSubmenuView。

import { Blocks, ChevronRight, FileText, Plus } from "lucide-react";
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
	getRecentCommandIds,
	matchFilter,
	onSlashCommandsPrefsChanged,
	useSlashCommandContext,
	type CommandContext,
	type SlashCommandDefinition,
	type SlashCommandSubOption,
} from "../../lib/slashCommands";
import { chatStore, useChatStoreSelector } from "../../lib/chat/store";
import { EmptyState } from "../ui/EmptyState";
import { EVENTS, events } from "../../lib/events";
import { slashCategories } from "./SlashPrimaryMenu";
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
// 顶部胶囊条：扁平化菜单的类别切换器
// ---------------------------------------------------------------------------

interface CategoryPillsProps {
	selectedId: string;
	onSelect: (id: string) => void;
	itemCount?: number;
}

function CategoryPills({
	selectedId,
	onSelect,
	itemCount,
}: CategoryPillsProps) {
	return (
		<div className="flex items-center gap-1 px-2 py-2 border-b border-border overflow-x-auto scrollbar-hide">
			{slashCategories.map((cat) => {
				const isActive = cat.id === selectedId;
				return (
					<button
						type="button"
						key={cat.id}
						onClick={() => onSelect(cat.id)}
						className={`group inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium whitespace-nowrap transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-120 ease-out cursor-pointer select-none
							${
								isActive
									? `${cat.gradient} shadow-[0_1px_2px_rgba(0,0,0,0.04)]`
									: "text-text-muted hover:bg-warm-200"
							}`}
					>
						<cat.icon
							className={`w-3.5 h-3.5 transition-colors duration-120 ${
								isActive ? "" : "text-text-light"
							}`}
						/>
						<span>{cat.name}</span>
						{isActive && typeof itemCount === "number" && itemCount >= 0 && (
							<span className="text-[11px] opacity-60">{itemCount}</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

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
	// 扁平化：默认直接进入「命令」二级菜单，不再经过 primary 类型选择层。
	// 顶部胶囊按钮可切换到文件 / 提示词 / 技能 / 操作 等其他类别。
	const [level, setLevel] = useState<MenuLevel>({
		type: "secondary",
		categoryId: "command",
	});
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);
	const [activeCommandIndex, setActiveCommandIndex] = useState(0);
	const [activeCommandsCategoryId, setActiveCommandsCategoryId] = useState<
		string | null
	>(null);
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
			// 扁平化：每次打开都直接进入「命令」二级菜单
			setLevel({ type: "secondary", categoryId: "command" });
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

	// ---- 选择一级类别（顶部胶囊点击）----
	const handleSelectCategory = useCallback((categoryId: string) => {
		setLevel({ type: "secondary", categoryId });
		setActiveCommandIndex(0);
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

	const selectedCategory = level.type === "secondary" ? level.categoryId : null;

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
			const allItems = matched.map((m) => ({
				definition: m.definition,
				availability: m.definition.availability(commandCtx),
				matchPositions: m.matchPositions,
			}));

			// 过滤为空 + 有 LRU 时,把最近使用的命令复制到顶部"最近使用"虚拟分组,
			// 同时保留它们在原 group 的位置(让用户既能快速找到常用,又能按分类找)。
			if (!filter.trim() && allItems.length > 0) {
				const recentIds = getRecentCommandIds();
				if (recentIds.length > 0) {
					const idToItem = new Map(
						allItems.map((it) => [it.definition.id, it] as const),
					);
					const recentItems = recentIds
						.map((id) => idToItem.get(id))
						.filter((it): it is (typeof allItems)[number] => Boolean(it))
						.map((it) => ({ ...it, sectionId: "recent" as const }));
					if (recentItems.length > 0) {
						return [...recentItems, ...allItems];
					}
				}
			}
			return allItems;
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
				// 命令类别已经是最顶层：Backspace + 空 filter 时不 preventDefault,
				// 让 ChatInput 自然删除 `/` 字符,从而关闭菜单 —— 符合扁平化直觉。
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
				// 扁平化:其他类别 Backspace 切回命令类别(而不是 primary)
				setLevel({ type: "secondary", categoryId: "command" });
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

	// 扁平化菜单不再渲染 SlashPrimaryMenu(一级类型选择);若 level 意外为 primary,
	// 直接关闭以保险。
	if (level.type === "primary") {
		return null;
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
				className="absolute left-0 bottom-full mb-2 w-[320px] bg-surface rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
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
				className="absolute left-0 bottom-full mb-2 w-[340px] bg-surface rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
			>
				<CategoryPills
					selectedId="command"
					onSelect={handleSelectCategory}
					itemCount={commandItems.length}
				/>

				<div className="max-h-[320px] overflow-y-auto">
					{commandsCategoryDisabled ? (
						<div className="px-4 py-8 text-center">
							<p className="text-sm text-text-muted">
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

				<div className="px-4 py-1.5 border-t border-border">
					<div className="flex items-center justify-center gap-4 text-[11px] text-text-light">
						<span className="flex items-center gap-1">
							<span className="font-mono text-[11px]">↑↓</span>
							<span>导航</span>
						</span>
						<span className="flex items-center gap-1">
							<span className="font-mono text-[11px]">↵</span>
							<span>选择</span>
						</span>
						<span className="flex items-center gap-1">
							<span className="font-mono text-[11px]">Tab</span>
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
			className="absolute left-0 bottom-full mb-2 w-[340px] bg-surface rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
		>
			<CategoryPills
				selectedId={selectedCategory ?? "command"}
				onSelect={handleSelectCategory}
				itemCount={totalCommands}
			/>

			{showAddPromptButton && onOpenPromptLibrary && (
				<div
					role="button"
					tabIndex={-1}
					onClick={() => {
						onOpenPromptLibrary();
						onClose();
					}}
					className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-border hover:bg-warm-100 transition-colors duration-150 cursor-pointer select-none group"
				>
					<div className="w-6 h-6 rounded-md bg-warm-200 flex items-center justify-center group-hover:bg-warm-300 transition-colors duration-150">
						<Plus className="w-3.5 h-3.5 text-text-muted group-hover:text-text-secondary" />
					</div>
					<div>
						<span className="text-xs font-medium text-text-secondary group-hover:text-text-primary">
							添加提示词
						</span>
					</div>
				</div>
			)}

			<div className="max-h-[300px] overflow-y-auto">
				{filteredGroups.length === 0 && totalCommands === 0 ? (
					<EmptyState
						size="sm"
						title={
							selectedCategory === "prompt"
								? "暂无自定义提示词"
								: "暂无可用命令"
						}
					/>
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

			<div className="px-4 py-1.5 border-t border-border">
				<div className="flex items-center justify-center gap-4 text-[11px] text-text-light">
					<span className="flex items-center gap-1">
						<span className="font-mono text-[11px]">⌫</span>
						<span>返回</span>
					</span>
					<span className="flex items-center gap-1">
						<span className="font-mono text-[11px]">↵</span>
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
					className="w-full flex items-center gap-1.5 px-4 py-1.5 text-left hover:bg-warm-100 transition-colors duration-150 cursor-pointer select-none"
				>
					<ChevronRight
						className={`w-3 h-3 text-text-light transition-transform duration-150 ${
							isCollapsed ? "" : "rotate-90"
						}`}
					/>
					<span className="text-xs font-medium text-text-light">
						{group.name}
					</span>
					<span className="text-[11px] text-text-light">
						{filteredCommands.length}
					</span>
				</div>
			) : (
				<div className="px-4 py-1.5">
					<span className="text-xs font-medium text-text-light">
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
								className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left cursor-pointer select-none
                  transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-120 ease-out
                  ${isSelected ? "bg-warm-200" : ""}`}
							>
								<div
									className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-120
                    ${
											isSelected
												? "bg-surface dark:bg-warm-800 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
												: "bg-warm-200"
										}`}
								>
									<command.icon
										className={`w-3.5 h-3.5 transition-colors duration-120
                      ${isSelected ? "text-text-secondary" : "text-text-muted"}`}
									/>
								</div>

								<div className="flex-1 min-w-0">
									<div
										className={`text-sm font-medium truncate transition-colors duration-120
                      ${
												isSelected ? "text-text-primary" : "text-text-secondary"
											}`}
									>
										{command.name}
									</div>
									<div className="text-xs truncate text-text-light">
										{command.description}
									</div>
								</div>

								{isSelected && (
									<span className="text-[11px] font-mono text-text-light flex-shrink-0">
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
