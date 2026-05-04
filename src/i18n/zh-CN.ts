// 中文文案字典（zh-CN）
//
// 即使当前只支持中文，也建立 key/value 机制：
// 1. 让组件不再散布硬编码字符串
// 2. 未来加 en-US 时只需新增字典文件
// 3. 文案修改有单一入口，避免漏改
//
// 命名约定：模块.子模块.具体含义（如 dashboard.greeting.morning）
// 调用：import { t } from "@/i18n"; t("dashboard.greeting.morning")

export const zhCN = {
	common: {
		confirm: "确定",
		cancel: "取消",
		save: "保存",
		delete: "删除",
		rename: "重命名",
		edit: "编辑",
		close: "关闭",
		open: "打开",
		retry: "再试一次",
		loading: "加载中...",
		empty: "暂无数据",
		error: "操作失败，请稍后再试",
		success: "操作成功",
		copy: "复制",
		copied: "已复制",
		more: "更多",
		settings: "设置",
		archive: "归档",
		unarchive: "取消归档",
		export: "导出",
		import: "导入",
		search: "搜索",
		clear: "清空",
		back: "返回",
		next: "下一步",
	},

	dashboard: {
		greeting: {
			morning: "早上好",
			afternoon: "下午好",
			evening: "晚上好",
			night: "夜深了",
		},
		subtitle: "准备好开始创作了吗？",
		tabs: {
			overview: "工作台",
			recent: "最近访问",
			archived: "已归档",
		},
		newProject: {
			title: "开始新项目",
			subtitle: "创建空白文档或选择模板",
			expandedTitle: "新建项目",
			placeholder: "项目名称",
			create: "创建",
		},
		emptyOnboarding: {
			heading: "从这里开始",
			createTitle: "创建项目",
			createDesc: "把研究、写作、对话集中起来管理",
			createCta: "立即创建",
			importTitle: "导入资料",
			importDesc: "PDF / Word / Markdown，AI 自动整理",
			importHint: "进入项目后从「资料」标签上传",
			chatTitle: "与 AI 对话",
			chatDesc: "直接提问，引用你的资料库",
			chatHint: "进入项目后从「对话」标签开始",
		},
		emptyArchived: "暂无归档项目",
		emptySearch: (query: string) => `没有找到匹配「${query}」的项目`,
		clearSearch: "清空搜索",
	},

	chat: {
		history: {
			title: "对话历史",
			newSession: "新建对话",
			searchPlaceholder: "搜索对话...",
			noResults: "没有找到相关对话",
			emptyState: "暂无对话记录",
			pinned: "置顶",
			noMessage: "无消息",
			defaultTitle: "新对话",
			deleteAria: (title: string) => `删除对话 ${title}`,
		},
		dateGroup: {
			today: "今天",
			yesterday: "昨天",
			daysAgo: (days: number) => `${days} 天前`,
		},
	},

	settings: {
		tabs: {
			models: "模型设置",
			modelsDesc: "Provider / API key / 模型默认",
			theme: "外观与主题",
			themeDesc: "切换浅色/深色 / 主题色",
			agent: "Agent 设置",
			data: "数据与备份",
			mascot: "IP 形象",
			skills: "Skills 与市场",
			shortcuts: "键盘快捷键",
		},
	},

	commandPalette: {
		placeholder: "搜索命令、项目、设置…",
		noResults: "没有匹配的命令",
		noResultsHint: '试试搜索 "新建" / "设置" / "主题"',
		hintArrow: "选择",
		hintEnter: "执行",
		hintEsc: "关闭",
		groups: {
			navigation: "导航",
			projects: "项目",
			workspace: "工作区",
			settings: "设置",
			theme: "主题",
		},
		commands: {
			backToDashboard: "返回工作台",
			backToDashboardDesc: "回到首屏项目列表",
			newProject: "新建项目",
			newProjectDesc: "创建一个新的工作空间",
			toggleCopilot: "切换 Copilot 侧边栏",
			toggleCopilotDesc: "显示或隐藏右侧 AI 侧边栏",
			openTerminal: "打开终端",
			openTerminalDesc: "在底部唤起集成终端",
			themeLight: "切换到浅色主题",
			themeDark: "切换到深色主题",
			themeSystem: "跟随系统主题",
			currentTheme: "当前主题",
		},
	},

	errors: {
		network: "网络连接异常，请检查网络后重试",
		unauthorized: "权限不足或登录已过期",
		notFound: "资源不存在或已被删除",
		conflict: "存在冲突（可能是名称重复）",
		rateLimit: "请求过于频繁，请稍后再试",
		serverError: "服务暂时不可用，请稍后再试",
		generic: "操作失败，请稍后再试",
	},
} as const;

/** 字典 key 的所有路径，深度合并 */
export type Dict = typeof zhCN;
