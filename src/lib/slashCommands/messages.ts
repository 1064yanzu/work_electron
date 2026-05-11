/**
 * Claude Code 风格斜杠命令 —— 集中中文文案。
 *
 * 任务：T1.5。
 *
 * 职责：
 * - 所有内置命令、执行器、Toast、Tooltip、空态等**中文文案**统一从这里读，禁止
 *   在 `builtin/`、`executor.ts`、UI 层硬编码。
 * - 文案短句优先，单条 ≤ 120 字符（与 `disabled.reason` 长度上限一致）。
 * - 函数型文案（需要参数）走 `fn(...)` 形式，避免字符串拼接散落。
 *
 * 设计理由：
 * - 走 `as const` + readonly，保证下游消费侧能拿到字面量类型，也能被 TS
 *   精确索引（`typeof SLASH_MESSAGES.disabled.reason.no_sdk_session` 等）。
 * - 不引入 `i18n` 依赖，与项目现有零依赖中文约定保持一致。
 */

// ---------------------------------------------------------------------------
// 总表
// ---------------------------------------------------------------------------

export const SLASH_MESSAGES = {
	// ------------------------------------------------------------------
	// 禁用原因（供 availability.disabled.reason 使用）
	// ------------------------------------------------------------------
	disabled: {
		reason: {
			noActiveSession: "请先打开或新建一个会话再试。",
			noSdkSession: "当前会话没有关联 SDK 会话，无法压缩。",
			noForkableSdkSession: "当前会话尚未建立 SDK 会话，无法分叉。",
			noResumableSessions: "没有可恢复的历史会话。",
			noAvailableModels: "模型列表尚未就绪。",
			noWorkspace: "尚未打开工作区，该命令不可用。",
			notGitRepo: "当前工作区不是 Git 仓库，无法执行。",
			unknownSubOption: "未识别的子选项，请重新选择。",
		},
	},

	// ------------------------------------------------------------------
	// Toast 文案（loading / success / failed 三态 + 重试）
	// ------------------------------------------------------------------
	toast: {
		compact: {
			loading: "正在压缩当前会话…",
			success: "已压缩当前会话的上下文。",
			failed: (reason: string): string => `压缩失败：${reason}`,
		},
		review: {
			loading: "正在读取本地变更…",
			noChanges: "当前工作区没有待审查的变更。",
			success: "已发起代码审查。",
			failed: (reason: string): string => `审查失败：${reason}`,
		},
		init: {
			loading: "正在写入 CLAUDE.md…",
			success: "已写入 CLAUDE.md。",
			existsPrompt: "CLAUDE.md 已存在，是否覆盖？",
			overwrittenSuccess: "已覆盖写入 CLAUDE.md。",
			failed: (reason: string): string => `写入失败：${reason}`,
		},
		copy: {
			success: "已复制最近一条回复。",
			empty: "当前会话没有可复制的回复。",
			failed: (reason: string): string => `复制失败：${reason}`,
		},
		approvals: {
			switched: (label: string): string => `已切换审批模式：${label}`,
		},
		help: {
			loading: "正在请 Claude Code 列出命令…",
		},
		cost: {
			loading: "正在请 Claude Code 汇总用量…",
		},
		doctor: {
			loading: "正在跑 Claude Code 健康检查…",
		},
		releaseNotes: {
			loading: "正在请 Claude Code 输出更新日志…",
		},
		outputStyle: {
			switched: (label: string): string => `已切换输出风格：${label}`,
		},
		agents: {
			loading: "正在让 Claude Code 列出子代理…",
		},
		permissions: {
			loading: "正在让 Claude Code 输出当前权限…",
		},
		hooks: {
			loading: "正在让 Claude Code 输出当前 hooks…",
		},
		addDir: {
			loading: (dir: string): string => `正在把目录加入 SDK：${dir}`,
			canceled: "已取消选择目录。",
		},
		securityReview: {
			loading: "正在跑安全审查…",
		},
		export: {
			canceled: "已取消导出。",
			success: (filePath: string): string => `已导出到 ${filePath}`,
			failed: (reason: string): string => `导出失败：${reason}`,
			emptyMessages: "当前会话没有消息可导出。",
		},
		todos: {
			notReady: "Todos 视图尚未就绪。",
		},
		feedback: {
			opened: "已在浏览器打开反馈页面。",
			failed: (reason: string): string => `打开反馈页面失败：${reason}`,
		},
		// 通用失败（executor 兜底用）
		generic: {
			failed: (reason: string): string => `命令执行失败：${reason}`,
			retryLabel: "再试一次",
		},
	},

	// ------------------------------------------------------------------
	// 空态与菜单文案
	// ------------------------------------------------------------------
	empty: {
		noMatch: "未找到匹配的命令。",
	},

	// ------------------------------------------------------------------
	// Tooltip / 辅助文案
	// ------------------------------------------------------------------
	tooltip: {
		disabledPrefix: "当前不可用：",
		submenuHint: "按 Enter 展开子选项",
	},

	// ------------------------------------------------------------------
	// 内置命令文案（name/description）—— builtin/*.ts 必须从此读取
	// ------------------------------------------------------------------
	commands: {
		compact: {
			name: "压缩会话",
			description: "调用 Claude Agent SDK 压缩当前 SDK 会话的上下文。",
		},
		clear: {
			name: "清空会话",
			description: "清空当前会话的消息，保留 SDK 会话关联。",
		},
		new: {
			name: "新建会话",
			description: "创建一条新的聊天会话，不影响当前会话。",
		},
		resume: {
			name: "恢复会话",
			description: "从带 SDK 会话 id 的历史会话中选择并恢复。",
		},
		fork: {
			name: "分叉会话",
			description: "基于当前 SDK 会话新建一条分叉会话。",
		},
		rename: {
			name: "重命名会话",
			description: "为当前会话设置新的标题。",
		},
		model: {
			name: "切换模型",
			description: "在可用模型之间切换当前会话的模型。",
		},
		mode: {
			name: "切换模式",
			description: "在规划模式与常规编码模式之间切换。",
		},
		plan: {
			name: "进入规划模式",
			description: "快速开启规划模式（等价于 /mode plan）。",
		},
		approvals: {
			name: "切换审批模式",
			description: "切换 Claude Agent 运行时的审批模式。",
			subOptions: {
				default: "默认",
				acceptEdits: "自动接受编辑",
				bypassPermissions: "跳过权限检查",
				dontAsk: "不再询问",
				plan: "规划模式",
			},
		},
		theme: {
			name: "切换主题",
			description: "切换应用的代码高亮主题。",
		},
		copy: {
			name: "复制最近回复",
			description: "复制当前会话最近一条助手回复到剪贴板。",
		},
		diff: {
			name: "查看变更",
			description: "打开右侧「变更」标签页。",
		},
		status: {
			name: "查看 Git 状态",
			description: "打开右侧「Git」标签页。",
		},
		context: {
			name: "查看上下文",
			description: "打开右侧「上下文」标签页。",
		},
		memory: {
			name: "查看记忆",
			description: "打开右侧「记忆」标签页。",
		},
		mcp: {
			name: "查看 MCP",
			description: "打开右侧「MCP」标签页。",
		},
		review: {
			name: "代码审查",
			description: "对当前工作区的未提交变更发起代码审查。",
		},
		init: {
			name: "写入 CLAUDE.md",
			description: "在当前工作区写入或覆盖 CLAUDE.md 模板。",
		},
		settings: {
			name: "打开设置",
			description: "跳转到设置面板的 AI 编程页。",
		},
		help: {
			name: "查看命令清单",
			description: "让 Claude Code 真实列出所有可用斜杠命令。",
		},
		cost: {
			name: "查看用量",
			description: "让 Claude Code 统计本会话的 token 用量与花费。",
		},
		doctor: {
			name: "健康检查",
			description: "让 Claude Code 跑一次诊断,排查 SDK / 代理 / 配置问题。",
		},
		releaseNotes: {
			name: "查看更新日志",
			description: "让 Claude Code 输出本版本的更新摘要。",
		},
		outputStyle: {
			name: "切换输出风格",
			description: "切换 Claude 的输出风格(默认 / 讲解型 / 学习型)。",
			subOptions: {
				default: "默认",
				explanatory: "讲解型",
				learning: "学习型",
			},
		},
		agents: {
			name: "查看子代理",
			description: "打开子代理设置,同时让 Claude Code 列出当前可用 agents。",
		},
		permissions: {
			name: "查看权限",
			description: "打开权限设置,同时让 Claude Code 输出当前工具权限。",
		},
		hooks: {
			name: "查看 Hooks",
			description: "打开 hooks 设置,同时让 Claude Code 输出当前 hooks。",
		},
		addDir: {
			name: "添加工作目录",
			description: "选择一个额外目录加入 SDK 的工作目录列表。",
		},
		securityReview: {
			name: "安全审查",
			description:
				"让 Claude Code 跑 security-review skill,对工作区做安全审查。",
		},
		todos: {
			name: "查看 Todos",
			description: "打开右栏 Todos 视图。",
		},
		feedback: {
			name: "提交反馈",
			description: "打开 GitHub Issues 提交反馈或报 bug。",
		},
		export: {
			name: "导出会话",
			description: "把当前会话的消息导出为 Markdown 文件。",
		},
	},

	// ------------------------------------------------------------------
	// clear 注入的系统快照文案（写进 chatStore 的 system 消息 content）
	// ------------------------------------------------------------------
	systemSnapshot: {
		clear: "会话已清空（SDK 会话关联保留）。",
	},

	// ------------------------------------------------------------------
	// /review 使用的中文审查 Prompt 模板（六维度）
	// ------------------------------------------------------------------
	reviewPrompt: {
		header: "请作为资深代码审查员，对以下本地变更进行审查。",
		dimensions: [
			"代码质量：命名、结构、可读性、冗余与重复。",
			"逻辑正确性：是否存在边界条件、竞态、空值与异常分支遗漏。",
			"安全性：是否引入注入、越权、敏感信息泄漏或不当依赖。",
			"性能：是否存在明显的 N+1、不必要的同步阻塞或拷贝。",
			"可维护性：模块边界、耦合度、依赖方向是否合理。",
			"类型安全：TypeScript 类型是否严格；是否存在可疑的 any / unknown。",
		],
		footer:
			"请输出「风险分级（高/中/低）+ 具体位置 + 修改建议」，并给出总体结论。",
	},
} as const;

// ---------------------------------------------------------------------------
// 类型导出（供 TS 完整类型感知）
// ---------------------------------------------------------------------------

export type SlashMessagesShape = typeof SLASH_MESSAGES;
