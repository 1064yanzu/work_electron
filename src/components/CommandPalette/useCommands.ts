// 命令构建 — 把 App 当前状态转成 CommandItem[]
//
// 注意：App 本身不持久这个列表。每次 useCommands() 重新构建一次，
// 因为命令依赖：当前主题、当前面板可见性等动态状态。

import {
	FileText,
	MessageSquare,
	Moon,
	Palette,
	Settings,
	Sparkles,
	Sun,
	Terminal as TerminalIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { themeManager } from "../../lib/theme";
import { workspaceStore } from "../../lib/workspaceStore";
import { layoutStore } from "../../lib/stores/layoutStore";
import { designStore } from "../../lib/stores/designStore";
import { designStartSession } from "../../lib/api/design";
import { toast } from "../ui/Toast";
import type { CommandItem } from "./types";

interface UseCommandsArgs {
	onOpenSettings: (tab?: string) => void;
	onOpenTerminal?: () => void;
}

export function useCommands(args: UseCommandsArgs): CommandItem[] {
	const [currentTheme, setCurrentTheme] = useState<string>(
		themeManager.getTheme(),
	);

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

		// 设计模块
		items.push({
			id: "design.new",
			title: "新建设计",
			description: "创建一个新的设计会话并进入答卷流程",
			icon: Palette,
			keywords: ["design", "new", "create", "shèjì", "xinjian"],
			group: "设计",
			action: async () => {
				try {
					const result = await designStartSession({ title: "未命名设计" });
					designStore.setDiscoveryForm(result.discovery_form);
					designStore.setCurrentSession({
						id: result.session_id,
						title: "未命名设计",
						status: "draft",
						work_dir: result.work_dir,
						created_at: Date.now(),
						updated_at: Date.now(),
					});
					designStore.setStage("discovery");
					layoutStore.setMainView("design");
					layoutStore.setLeftSidebarView("design");
					layoutStore.setLeftSidebarCollapsed(true);
				} catch (err) {
					toast.error(
						`新建设计失败: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			},
		});

		items.push({
			id: "design.open",
			title: "进入设计模式",
			description: "切换到中栏「设计」主视图",
			icon: Palette,
			keywords: ["design", "open", "mode", "panel"],
			group: "设计",
			action: () => {
				layoutStore.setMainView("design");
				layoutStore.setLeftSidebarView("design");
				layoutStore.setLeftSidebarCollapsed(true);
			},
		});

		items.push({
			id: "design.exit",
			title: "退出设计模式",
			description: "切回 editor 视图并展开左栏",
			icon: Palette,
			keywords: ["design", "exit", "back", "editor"],
			group: "设计",
			action: () => {
				layoutStore.setMainView("editor");
				layoutStore.setLeftSidebarCollapsed(false);
			},
		});

		return items;
	}, [args, currentTheme]);
}
