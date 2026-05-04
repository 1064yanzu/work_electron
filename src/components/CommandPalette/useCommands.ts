// 命令构建 — 把 App 当前状态转成 CommandItem[]
//
// 注意：App 本身不持久这个列表。每次 useCommands() 重新构建一次，
// 因为命令依赖：项目列表、当前主题、当前面板可见性等动态状态。

import {
	FileText,
	Folder,
	FolderPlus,
	LayoutDashboard,
	MessageSquare,
	Moon,
	Settings,
	Sparkles,
	Sun,
	Terminal as TerminalIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listProjects } from "../../lib/api";
import { themeManager } from "../../lib/theme";
import { workspaceStore } from "../../lib/workspaceStore";
import type { Project } from "../../types";
import type { CommandItem } from "./types";

interface UseCommandsArgs {
	onOpenProject: (projectId: string) => void;
	onOpenDashboard: () => void;
	onOpenSettings: (tab?: string) => void;
	onOpenTerminal?: () => void;
	onCreateProject?: () => void;
}

export function useCommands(args: UseCommandsArgs): CommandItem[] {
	const [projects, setProjects] = useState<Project[]>([]);
	const [currentTheme, setCurrentTheme] = useState<string>(
		themeManager.getTheme(),
	);

	useEffect(() => {
		(async () => {
			try {
				const list = await listProjects();
				setProjects(list);
			} catch {
				// 忽略 — 命令面板降级到不展示项目
			}
		})();

		const unsub = themeManager.subscribe(() =>
			setCurrentTheme(themeManager.getTheme()),
		);
		return () => unsub();
	}, []);

	return useMemo<CommandItem[]>(() => {
		const items: CommandItem[] = [];

		// 全局导航
		items.push({
			id: "nav.dashboard",
			title: "返回工作台",
			description: "回到首屏项目列表",
			icon: LayoutDashboard,
			keywords: ["dashboard", "home", "shouye", "首页"],
			group: "导航",
			action: () => args.onOpenDashboard(),
		});

		if (args.onCreateProject) {
			items.push({
				id: "project.new",
				title: "新建项目",
				description: "创建一个新的工作空间",
				icon: FolderPlus,
				keywords: ["new", "create", "create project", "xinjian"],
				group: "项目",
				action: () => args.onCreateProject?.(),
			});
		}

		// 项目快速跳转
		for (const project of projects.slice(0, 30)) {
			items.push({
				id: `project.open.${project.id}`,
				title: project.name,
				description: project.description || "打开项目",
				icon: Folder,
				keywords: [
					"project",
					"open",
					project.id,
					...(project.description ? [project.description] : []),
				],
				group: "项目",
				action: () => args.onOpenProject(project.id),
			});
		}

		// 工作区操作
		items.push({
			id: "ws.toggle-right-sidebar",
			title: "切换 Copilot 侧边栏",
			description: "显示或隐藏右侧 AI 侧边栏",
			icon: MessageSquare,
			keywords: ["copilot", "right", "sidebar", "ai", "celebianlan"],
			group: "工作区",
			shortcut: ["⌘", "L"],
			action: () => workspaceStore.toggleRightSidebar(),
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

		// 设置
		const settingsTabs: Array<{
			tab: string;
			title: string;
			desc?: string;
		}> = [
			{ tab: "models", title: "模型设置", desc: "Provider / API key / 模型默认" },
			{ tab: "theme", title: "外观与主题", desc: "切换浅色/深色 / 主题色" },
			{ tab: "agent", title: "Agent 设置" },
			{ tab: "data", title: "数据与备份" },
			{ tab: "mascot", title: "IP 形象" },
			{ tab: "skills", title: "Skills 与市场" },
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

		// FileText 仅作为 prefetch 防止 tree-shake 误删（实际未使用，但保留导入便于未来扩展）
		void FileText;

		return items;
	}, [args, projects, currentTheme]);
}
