// 命令构建 — 把 App 当前状态转成 CommandItem[]
//
// 注意：App 本身不持久这个列表。每次 useCommands() 重新构建一次，
// 因为命令依赖：当前主题、当前面板可见性等动态状态。
// 快捷键提示统一从 shortcutRegistry 查询（单一事实源），不再手写键位。
// 动态命令来自 commandRegistry（功能面板可自行注册/反注册）。

import {
	Blocks,
	BookOpen,
	Columns2,
	FolderOpen,
	Globe,
	Keyboard,
	Library,
	LayoutGrid,
	MessageSquare,
	MessagesSquare,
	Moon,
	Network,
	PanelLeft,
	Plus,
	Rows2,
	Settings,
	Sparkles,
	Sun,
	Terminal as TerminalIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCommandRegistrySelector } from "../../lib/commands/commandRegistry";
import {
	shortcutRegistry,
	useShortcutRegistrySelector,
} from "../../lib/shortcuts";
import { layoutStore } from "../../lib/stores/layoutStore";
import { centerTabsStore } from "../../lib/stores/centerTabsStore";
import { cardLibraryStoreApi } from "../../lib/stores/cardLibraryStore";
import { getLastKnowledgeTab } from "../resource/knowledgeSection";
import { EVENTS, events } from "../../lib/events";
import { toast } from "../ui/Toast";
import { themeManager } from "../../lib/theme";
import { workspaceStore } from "../../lib/workspaceStore";
import type { CommandItem } from "./types";

interface UseCommandsArgs {
	onOpenSettings: (tab?: string) => void;
	onOpenTerminal?: () => void;
}

export function useCommands(args: UseCommandsArgs): CommandItem[] {
	const [currentTheme, setCurrentTheme] = useState<string>(
		themeManager.getTheme(),
	);
	// 订阅注册中心：scoped 快捷键/动态命令变化时刷新提示
	const shortcutEntries = useShortcutRegistrySelector((s) => s.entries);
	const registrySources = useCommandRegistrySelector((s) => s.sources);

	useEffect(() => {
		const unsub = themeManager.subscribe(() =>
			setCurrentTheme(themeManager.getTheme()),
		);
		return () => unsub();
	}, []);

	return useMemo<CommandItem[]>(() => {
		const items: CommandItem[] = [];

		// 工作区操作
		items.push({
			id: "ws.toggle-right-sidebar",
			title: "切换 Copilot 侧边栏",
			description: "显示或隐藏右侧 AI 侧边栏",
			icon: MessageSquare,
			keywords: ["copilot", "right", "sidebar", "ai", "celebianlan"],
			group: "工作区",
			action: () => workspaceStore.toggleRightSidebar(),
		});

		items.push({
			id: "ws.toggle-left-sidebar",
			title: "折叠/展开资源栏",
			description: "收起左侧资源面板，专注中间工作区",
			icon: PanelLeft,
			keywords: ["left", "sidebar", "resources", "ziyuanlan", "zhedie"],
			group: "工作区",
			action: () =>
				layoutStore.setLeftSidebarCollapsed(
					!layoutStore.getState().leftSidebarCollapsed,
				),
		});

		if (args.onOpenTerminal) {
			items.push({
				id: "ws.open-terminal",
				title: "打开终端",
				description: "在底部唤起集成终端",
				icon: TerminalIcon,
				keywords: ["terminal", "shell", "zhongduan"],
				group: "工作区",
				action: () => args.onOpenTerminal?.(),
			});
		}

		items.push({
			id: "ws.shortcut-cheat-sheet",
			title: "快捷键速查表",
			description: "查看全部可用快捷键",
			icon: Keyboard,
			keywords: ["shortcuts", "keyboard", "hotkey", "kuaijiejian", "help"],
			group: "工作区",
			action: () => shortcutRegistry.openCheatSheet(),
		});

		items.push({
			id: "ws.open-aihub",
			title: "打开 Web AI 标签页",
			description: "在中栏以标签页打开 ChatGPT / Gemini / Kimi 等 Web 站点",
			icon: Globe,
			keywords: [
				"aihub",
				"web",
				"chatgpt",
				"gemini",
				"kimi",
				"doubao",
				"deepseek",
				"wangye",
				"zhandian",
				"biaoqianye",
			],
			group: "工作区",
			action: () => {
				void centerTabsStore.openWebSite().then((ok) => {
					if (ok) return;
					toast.info("尚未启用任何 Web AI 站点，请先在设置中启用");
					events.emit(EVENTS.OPEN_SETTINGS, { tab: "integrations.harnessHub" });
				});
			},
		});

		items.push({
			id: "ws.open-hub-tab",
			title: "打开 Agent 接力",
			description:
				"跨入口工作台：统一会话时间线、拖拽接力、多模型议会、共享白板",
			icon: Network,
			keywords: [
				"hub",
				"aihub",
				"session",
				"harness",
				"claude",
				"codex",
				"huihua",
				"zhongshu",
				"jieli",
				"qianyi",
				"handoff",
				"yihui",
				"council",
				"baiban",
				"board",
				"shijianxian",
			],
			group: "工作区",
			action: () => centerTabsStore.openHub(),
		});

		items.push({
			id: "ws.split-right",
			title: "向右拆分中栏",
			description: "把当前标签移到右边的新分屏，两块内容同屏对照",
			icon: Columns2,
			keywords: ["split", "chaifen", "fenping", "right", "分屏", "拆分"],
			group: "工作区",
			action: () => {
				if (!centerTabsStore.splitGroup({ direction: "horizontal" })) {
					toast.info("当前分屏只有一个标签，再拆就空了");
				}
			},
		});

		items.push({
			id: "ws.split-down",
			title: "向下拆分中栏",
			description: "把当前标签移到下方的新分屏",
			icon: Rows2,
			keywords: ["split", "chaifen", "fenping", "down", "分屏", "拆分"],
			group: "工作区",
			action: () => {
				if (!centerTabsStore.splitGroup({ direction: "vertical" })) {
					toast.info("当前分屏只有一个标签，再拆就空了");
				}
			},
		});

		items.push({
			id: "ws.open-browser-tab",
			title: "打开浏览器标签页",
			description: "在中栏以标签页打开内嵌浏览器",
			icon: Globe,
			keywords: ["browser", "liulanqi", "web", "wangye"],
			group: "工作区",
			action: () => centerTabsStore.openBrowser(),
		});

		items.push({
			id: "ws.open-cli-tab",
			title: "打开本机 CLI 标签页",
			description:
				"在中栏起一个 pty 跑 Claude Code / Codex 等本机 coding agent",
			icon: TerminalIcon,
			keywords: [
				"cli",
				"claude",
				"codex",
				"gemini",
				"opencode",
				"agent",
				"zhongduan",
				"benji",
			],
			group: "工作区",
			action: () => {
				void centerTabsStore.ensureClis().then((list) => {
					const first = list[0];
					if (!first) {
						toast.info("未探测到可启动的本机 AI CLI");
						events.emit(EVENTS.OPEN_SETTINGS, {
							tab: "integrations.harnessHub",
						});
						return;
					}
					void centerTabsStore.openCli(first);
				});
			},
		});

		// 左栏导航：与 SidebarRail 的 4 个入口一一对应
		const railTargets: Array<{
			id: string;
			view: string;
			title: string;
			description: string;
			icon: typeof PanelLeft;
			keywords: string[];
		}> = [
			{
				id: "nav.left.files",
				view: "files",
				title: "打开文件面板",
				description: "左栏切到「文件」，浏览工作目录",
				icon: FolderOpen,
				keywords: ["files", "wenjian", "mulu", "zuolan"],
			},
			{
				id: "nav.left.threads",
				view: "threads",
				title: "打开对话列表",
				description: "左栏切到「对话」，查看历史会话",
				icon: MessagesSquare,
				keywords: ["threads", "duihua", "huihua", "history", "zuolan"],
			},
			{
				id: "nav.left.knowledge",
				view: "knowledge",
				title: "打开知识面板",
				description: "左栏切到「知识」（资料库 / 卡片）",
				icon: Library,
				keywords: ["knowledge", "zhishi", "sources", "ziliao", "cards"],
			},
			{
				id: "nav.left.skills",
				view: "skills",
				title: "打开技能面板",
				description: "左栏切到「技能」，管理本地 Skill 与市场",
				icon: Blocks,
				keywords: ["skills", "jineng", "marketplace", "shichang", "zuolan"],
			},
		];
		for (const t of railTargets) {
			items.push({
				id: t.id,
				title: t.title,
				description: t.description,
				icon: t.icon,
				keywords: t.keywords,
				group: "导航",
				action: () => {
					// 「知识」是三个 tab 的合集，回到上次看的那个（与 rail 点击行为一致）
					layoutStore.setLeftSidebarView(
						(t.view === "knowledge"
							? getLastKnowledgeTab()
							: t.view) as ReturnType<
							typeof layoutStore.getState
						>["leftSidebarView"],
					);
					layoutStore.setLeftSidebarCollapsed(false);
				},
			});
		}

		items.push({
			id: "nav.new-thread",
			title: "新建对话",
			description: "选择工作目录并开一个新会话",
			icon: Plus,
			keywords: ["new", "thread", "chat", "xinjian", "duihua", "huihua"],
			group: "导航",
			action: () => {
				layoutStore.setLeftSidebarView("threads");
				layoutStore.setLeftSidebarCollapsed(false);
				events.emit(EVENTS.NEW_THREAD_REQUEST, undefined);
			},
		});

		items.push({
			id: "nav.open-card-library",
			title: "打开知识卡片库",
			description: "全屏浏览沉淀下来的知识卡片",
			icon: LayoutGrid,
			keywords: ["cards", "card", "library", "zhishi", "kapian", "quanping"],
			group: "导航",
			action: () => cardLibraryStoreApi.open(),
		});

		items.push({
			id: "nav.open-reader",
			title: "打开阅读器书架",
			description: "左栏切到资料库，从这里挑一本书进阅读器",
			icon: BookOpen,
			keywords: [
				"reader",
				"book",
				"epub",
				"pdf",
				"yuedu",
				"shujia",
				"dianzishu",
			],
			group: "导航",
			action: () => {
				// 阅读器是「打开某本书」才存在的全屏 overlay（readerStore.openedBookId
				// 驱动），没有「空阅读器」这种状态，所以命令只负责把用户带到书架。
				layoutStore.setLeftSidebarView("sources");
				layoutStore.setLeftSidebarCollapsed(false);
			},
		});

		// 设置
		items.push({
			id: "settings.open",
			title: "打开设置",
			description: "打开设置面板",
			icon: Settings,
			keywords: ["settings", "preferences", "config", "shezhi", "peizhi"],
			group: "设置",
			action: () => args.onOpenSettings(),
		});

		const settingsTabs: Array<{
			tab: string;
			title: string;
			desc?: string;
		}> = [
			{
				tab: "ai.models",
				title: "模型设置",
				desc: "Provider / API key / 模型默认",
			},
			{
				tab: "general.appearance",
				title: "外观与主题",
				desc: "切换浅色/深色 / 主题色",
			},
			{ tab: "ai.agent", title: "Agent 设置" },
			{ tab: "data.storage", title: "数据与备份" },
			{ tab: "workshop.mascot", title: "桌面宠物" },
			{ tab: "ai.defaults", title: "Skills 与市场" },
			{
				tab: "integrations.harnessHub",
				title: "Agent 接力 / Web AI 设置",
				desc: "harness 探测 / 会话摄取 / Web 站点",
			},
		];
		for (const t of settingsTabs) {
			items.push({
				id: `settings.${t.tab}`,
				title: t.title,
				description: t.desc || "打开设置",
				icon: Settings,
				keywords: ["settings", "config", t.tab, "shezhi"],
				group: "设置",
				action: () => args.onOpenSettings(t.tab),
			});
		}

		// 主题快速切换
		const themeTargets: Array<{
			id: "light" | "dark" | "system";
			title: string;
			icon: typeof Sun;
		}> = [
			{ id: "light", title: "切换到浅色主题", icon: Sun },
			{ id: "dark", title: "切换到深色主题", icon: Moon },
			{ id: "system", title: "跟随系统主题", icon: Sparkles },
		];
		for (const t of themeTargets) {
			items.push({
				id: `theme.${t.id}`,
				title: t.title,
				description: currentTheme === t.id ? "当前主题" : undefined,
				icon: t.icon,
				keywords: ["theme", "appearance", t.id, "zhuti"],
				group: "主题",
				action: () => themeManager.setTheme(t.id),
			});
		}

		// 动态注册命令（功能面板通过 commandRegistry.register 注入）
		for (const sourceItems of registrySources.values()) {
			items.push(...sourceItems);
		}

		// 快捷键提示：从 shortcutRegistry 自动带出（覆盖手写 shortcut）
		return items.map((item) => {
			const bound = shortcutRegistry.getByCommand(item.id);
			if (!bound) return item;
			return {
				...item,
				shortcut: bound.keysDisplay ?? shortcutRegistry.formatKeys(bound.keys),
			};
		});
	}, [args, currentTheme, registrySources, shortcutEntries]);
}
