// 命令构建 — 把 App 当前状态转成 CommandItem[]
//
// 注意：App 本身不持久这个列表。每次 useCommands() 重新构建一次，
// 因为命令依赖：当前主题、当前面板可见性等动态状态。
// 快捷键提示统一从 shortcutRegistry 查询（单一事实源），不再手写键位。
// 动态命令来自 commandRegistry（功能面板可自行注册/反注册）。

import {
	Globe,
	Keyboard,
	MessageSquare,
	Moon,
	PanelLeft,
	Settings,
	Sparkles,
	Sun,
	Terminal as TerminalIcon,
	Waypoints,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCommandRegistrySelector } from "../../lib/commands/commandRegistry";
import {
	shortcutRegistry,
	useShortcutRegistrySelector,
} from "../../lib/shortcuts";
import { layoutStore } from "../../lib/stores/layoutStore";
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
			id: "ws.open-harness",
			title: "打开会话中枢",
			description: "浏览并迁移 Claude Code / Codex 等入口的会话",
			icon: Waypoints,
			keywords: [
				"harness",
				"session",
				"hub",
				"claude",
				"codex",
				"huihua",
				"zhongshu",
				"qianyi",
			],
			group: "工作区",
			action: () => workspaceStore.setLeftSidebarView("harness"),
		});

		items.push({
			id: "ws.open-aihub",
			title: "打开 AI Hub",
			description: "在中栏内嵌 ChatGPT / Gemini / Kimi 等 Web 站点",
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
			],
			group: "工作区",
			action: () => workspaceStore.setMainView("aihub"),
		});

		// 设置
		const settingsTabs: Array<{
			tab: string;
			title: string;
			desc?: string;
		}> = [
			{
				tab: "models",
				title: "模型设置",
				desc: "Provider / API key / 模型默认",
			},
			{ tab: "theme", title: "外观与主题", desc: "切换浅色/深色 / 主题色" },
			{ tab: "agent", title: "Agent 设置" },
			{ tab: "data", title: "数据与备份" },
			{ tab: "mascot", title: "桌面宠物" },
			{ tab: "skills", title: "Skills 与市场" },
			{
				tab: "integrations.harnessHub",
				title: "AI 入口互通设置",
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
