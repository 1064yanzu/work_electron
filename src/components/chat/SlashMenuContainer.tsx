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
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const { prompts: customPrompts, folders: customFolders } = useCustomPromptStore();
    const { enabledSkills } = useSkillsStore(); // 使用 hook 获取已启用的 Agent Skills
    const menuRef = useRef<HTMLDivElement>(null);

    // 当菜单打开时重置状态
    useEffect(() => {
        if (isOpen) {
            setLevel("primary");
            setSelectedCategory(null);
            setCollapsedGroups(new Set());
        }
    }, [isOpen]);

    // 监听 Backspace 返回上一级
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (level === "secondary" && e.key === "Backspace" && !filter) {
                e.preventDefault();
                setLevel("primary");
                setSelectedCategory(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, level, filter]);

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
    const getCategoryGroups = useCallback((): CommandGroup[] => {
        switch (selectedCategory) {
            case "file": {
                // 文件按来源分组
                const groups: CommandGroup[] = [];

                // 资料库
                const sourceCommands = dynamicCommands.filter((cmd) => cmd.group === "资料库");
                if (sourceCommands.length > 0) {
                    groups.push({
                        id: "sources",
                        name: "📚 资料库",
                        commands: sourceCommands,
                        isCollapsible: true,
                    });
                }

                // 最近打开
                const recentCommands = dynamicCommands.filter((cmd) => cmd.group === "最近打开");
                if (recentCommands.length > 0) {
                    groups.push({
                        id: "recent",
                        name: "🕐 最近打开",
                        commands: recentCommands,
                        isCollapsible: true,
                    });
                }

                // 文档
                const docCommands = dynamicCommands.filter((cmd) => cmd.group === "文档");
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
                const folderCommands = dynamicCommands.filter((cmd) => cmd.id === "import-file");
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
                    const groupName = p.folderId ? (folderNameMap.get(p.folderId) || "未分类") : "未分类";

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
                const agentSkillCommands: SlashCommand[] = enabledSkills.map(skill => ({
                    id: `agent-skill-${skill.name}`,
                    name: skill.name,
                    description: skill.description || "强制使用此技能",
                    icon: () => <Zap className="w-4 h-4" />,
                    category: "skill" as const,
                    group: "Agent 技能",
                    // 存储 skill 名称以便后续强制执行
                    prompt: `[FORCE_SKILL:${skill.name}]`,
                }));

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
    }, [selectedCategory, dynamicCommands, customPrompts, enabledSkills]);

    // 获取类别标题和颜色
    const getCategoryInfo = useCallback(() => {
        const cat = slashCategories.find((c) => c.id === selectedCategory);
        return {
            name: cat?.name || "",
            iconColor: cat?.iconColor || "text-zinc-500",
            Icon: cat?.icon,
        };
    }, [selectedCategory]);

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

    // 二级菜单
    const groups = getCategoryGroups();
    const { name: categoryName, iconColor, Icon } = getCategoryInfo();
    const showAddPromptButton = selectedCategory === "prompt";

    // 计算总命令数
    const totalCommands = groups.reduce((sum, g) => sum + g.commands.length, 0);

    return (
        <div
            ref={menuRef}
            className="absolute left-0 bottom-full mb-2 w-[340px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border border-zinc-200/60 dark:border-zinc-700/60 overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
            {/* 头部：返回按钮 + 标题 */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <button
                    onClick={handleBack}
                    className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all active:scale-95"
                    title="返回"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                    {Icon && (
                        <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                            <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                        </div>
                    )}
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {categoryName}
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-full">
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
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm border-b border-zinc-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all group"
                >
                    <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-200">
                        <Plus className="w-4 h-4 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200" />
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
                {groups.length === 0 && totalCommands === 0 ? (
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
                        {groups.map((group) => (
                            <GroupSection
                                key={group.id}
                                group={group}
                                filter={filter}
                                isCollapsed={collapsedGroups.has(group.id)}
                                onToggle={() => toggleGroup(group.id)}
                                onSelect={onSelect}
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
        </div>
    );
}

// 分组区块组件
function GroupSection({
    group,
    filter,
    isCollapsed,
    onToggle,
    onSelect,
}: {
    group: CommandGroup;
    filter: string;
    isCollapsed: boolean;
    onToggle: () => void;
    onSelect: (command: SlashCommand) => void;
}) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // 过滤命令
    const filteredCommands = useMemo(() => {
        if (!filter) return group.commands;
        const lowerFilter = filter.toLowerCase();
        return group.commands.filter(
            (cmd) =>
                cmd.name.toLowerCase().includes(lowerFilter) ||
                cmd.description.toLowerCase().includes(lowerFilter),
        );
    }, [group.commands, filter]);

    // 重置选中
    useEffect(() => {
        setSelectedIndex(0);
    }, [filter]);

    // 键盘导航
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isCollapsed) return;

            switch (e.key) {
                case "ArrowUp":
                    e.preventDefault();
                    setSelectedIndex((prev) =>
                        prev > 0 ? prev - 1 : filteredCommands.length - 1,
                    );
                    break;
                case "ArrowDown":
                    e.preventDefault();
                    setSelectedIndex((prev) =>
                        prev < filteredCommands.length - 1 ? prev + 1 : 0,
                    );
                    break;
                case "Enter":
                    e.preventDefault();
                    if (filteredCommands[selectedIndex]) {
                        onSelect(filteredCommands[selectedIndex]);
                    }
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isCollapsed, filteredCommands, selectedIndex, onSelect]);

    if (filteredCommands.length === 0) return null;

    return (
        <div className="mb-1">
            {/* 分组标题 */}
            {group.isCollapsible ? (
                <button
                    onClick={onToggle}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                    {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                    ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {group.name}
                    </span>
                    <span className="px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                        {filteredCommands.length}
                    </span>
                </button>
            ) : (
                <div className="px-4 py-2">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {group.name}
                    </span>
                </div>
            )}

            {/* 命令列表 */}
            {!isCollapsed && (
                <div className="px-1.5">
                    {filteredCommands.map((command, index) => {
                        const isSelected = index === selectedIndex;
                        return (
                            <button
                                key={command.id}
                                ref={(el) => {
                                    itemRefs.current[index] = el;
                                }}
                                onClick={() => onSelect(command)}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-150
                  ${isSelected
                                        ? "bg-zinc-100 dark:bg-zinc-800 ring-1 ring-inset ring-black/5 dark:ring-white/10"
                                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                    }`}
                            >
                                {/* 图标 */}
                                <div
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all
                    ${isSelected
                                            ? "bg-white dark:bg-zinc-700 shadow-sm"
                                            : "bg-zinc-100 dark:bg-zinc-800"
                                        }`}
                                >
                                    <command.icon
                                        className={`w-4 h-4 ${isSelected ? "text-zinc-700 dark:text-zinc-200" : "text-zinc-500 dark:text-zinc-400"}`}
                                    />
                                </div>

                                {/* 文字 */}
                                <div className="flex-1 min-w-0">
                                    <div
                                        className={`text-sm font-medium truncate ${isSelected
                                            ? "text-zinc-900 dark:text-zinc-100"
                                            : "text-zinc-700 dark:text-zinc-300"
                                            }`}
                                    >
                                        {command.name}
                                    </div>
                                    <div
                                        className={`text-xs truncate ${isSelected
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
