// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：harness（共 62 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	AiHubSiteRow,
	BrowserCookieSourceRow,
	HarnessBoardEntryRow,
	HarnessBridgeCallRow,
	HarnessBridgeResult,
	HarnessCouncilAnswerRow,
	HarnessCouncilRunRow,
	HarnessDetectionRow,
	HarnessHandoffPackage,
	HarnessHandoffPlan,
	HarnessHandoffRow,
	HarnessHubSettingsRow,
	HarnessJobAttemptRow,
	HarnessJobInputRow,
	HarnessJobRow,
	HarnessJobRunRow,
	HarnessMcpStatusRow,
	HarnessMessageRow,
	HarnessQuotaRow,
	HarnessRouteCandidateRow,
	HarnessRouteRow,
	HarnessRuntimeRow,
	HarnessSearchHit,
	HarnessSessionRow,
	HarnessUsageRow,
} from "./common";

export interface HarnessIpcSchema {
	// ==================
	// AI Harness Hub（跨 harness 会话资产互通）
	// ==================
	/** 探测本机已安装的 AI CLI 及其能力（可读会话 / 可注入） */
	harness_detect: {
		input: Record<string, never>;
		output: { harnesses: HarnessDetectionRow[] };
	};
	/** 跨入口用量统计（口径见 HarnessUsageRow 注释） */
	harness_usage_stats: {
		input: Record<string, never>;
		output: {
			harnesses: HarnessUsageRow[];
			/** 最近 30 天每天的消息条数（本机时区） */
			daily: { date: string; messages: number }[];
			generated_at: number;
		};
	};
	/** 列出已摄取的会话（按 harness / cwd 过滤，updated_at 倒序） */
	harness_sessions_list: {
		input: {
			harness?: string;
			cwd?: string;
			limit?: number;
			offset?: number;
		};
		output: { sessions: HarnessSessionRow[]; total: number };
	};
	/** 取单个会话的完整转录 */
	harness_session_get: {
		input: { session_id: string; limit?: number; offset?: number };
		output: {
			session: HarnessSessionRow | null;
			messages: HarnessMessageRow[];
		};
	};
	/** 全文检索会话消息（FTS5 trigram，支持中文子串） */
	harness_sessions_search: {
		input: { query: string; harness?: string; limit?: number };
		output: { hits: HarnessSearchHit[] };
	};
	/** 触发一次全量扫描摄取（进度走 harness-ingest-progress 事件） */
	harness_ingest_scan: {
		input: { include_ipo_sdk?: boolean };
		output: { updated: number; scanned: number; skipped_lines: number };
	};
	/** 删除一个已摄取的会话（仅删本地 canonical 记录，不动原始 JSONL） */
	harness_session_delete: {
		input: { session_id: string };
		output: { success: boolean };
	};
	/** 蒸馏生成 HANDOFF 交接包（进度走 harness-handoff-event 事件） */
	harness_handoff_create: {
		input: {
			session_id: string;
			target_harness: string;
			model?: string;
			/**
			 * 接力档位。缺省 / "auto" 走自动选档（同入口优先原生续接，
			 * 短会话走原文接力，超长才蒸馏）。
			 */
			mode?: "auto" | "native" | "raw" | "distill";
		};
		output: {
			handoff_id: string;
			package: HarnessHandoffPackage;
			/** 实际使用的档位 */
			mode: "native" | "raw" | "distill";
			/** 选档原因，原样展示给用户 */
			reason: string;
			/** mode === native 时的启动命令 */
			resume_command: string | null;
		};
	};
	/**
	 * 预演接力方案：不真正生成交接包，只算出会走哪一档、为什么。
	 * UI 在用户点「接力」之前调用，避免先花钱蒸馏再告诉他其实能无损续接。
	 */
	harness_handoff_plan: {
		input: {
			session_id: string;
			target_harness: string;
			mode?: "auto" | "native" | "raw" | "distill";
		};
		output: HarnessHandoffPlan;
	};
	/**
	 * 原生续接：在 App 内起 pty 直接跑 `claude --resume` / `codex resume`。
	 * 上下文完全无损、零 LLM 成本，只在同一入口内可用。
	 */
	harness_resume_launch: {
		input: {
			session_id: string;
			/** 分叉出新会话，不覆盖原始历史 */
			fork?: boolean;
			/** 覆盖工作目录；默认用源会话的 cwd */
			cwd?: string;
		};
		output: {
			pty_id: string;
			command: string;
			ready_detected: boolean;
		};
	};
	/** 在 App 内起 pty 跑目标 CLI 并注入交接包 */
	harness_handoff_launch: {
		input: {
			handoff_id: string;
			/** 覆盖工作目录；默认用源会话的 cwd */
			cwd?: string;
			/** 覆盖注入指令 */
			instruction?: string;
			/** 是否把交接包写入 cwd/HANDOFF.md */
			write_file?: boolean;
		};
		output: {
			pty_id: string;
			handoff_path: string | null;
			ready_detected: boolean;
		};
	};
	/** 关闭一个 harness pty */
	harness_pty_close: {
		input: { pty_id: string };
		output: { success: boolean };
	};
	/** 列出历史迁移记录 */
	harness_handoff_list: {
		input: { session_id?: string; limit?: number };
		output: { handoffs: HarnessHandoffRow[] };
	};
	/** 取单条迁移记录的完整交接包 markdown */
	harness_handoff_get: {
		input: { handoff_id: string };
		output: { handoff: HarnessHandoffRow | null };
	};
	/** 更新交接包内容（用户在预览里编辑后保存） */
	harness_handoff_update: {
		input: { handoff_id: string; package_md: string };
		output: { success: boolean };
	};

	// ==================
	// AI Hub（内嵌 Web AI 站点）
	// ==================
	/** 列出可用的 Web AI 站点（内置 + 用户自定义） */
	aihub_sites_list: {
		input: Record<string, never>;
		output: { sites: AiHubSiteRow[] };
	};
	/** 保存站点清单覆盖（设置面板用） */
	aihub_sites_save: {
		input: { sites: AiHubSiteRow[] };
		output: { success: boolean; sites: AiHubSiteRow[] };
	};
	/**
	 * 在中栏挂载并显示某站点（bounds 由渲染端上报）。
	 *
	 * 中栏支持分屏后可以同时挂载多个站点，本命令**不会**摘掉其它站点。
	 */
	aihub_open: {
		input: {
			site_id: string;
			bounds: { x: number; y: number; width: number; height: number };
		};
		output: { success: boolean };
	};
	/** 更新某个站点内嵌视图的 bounds（分屏拖动 / 面板 resize） */
	aihub_set_bounds: {
		input: {
			site_id: string;
			bounds: { x: number; y: number; width: number; height: number };
		};
		output: { success: boolean };
	};
	/**
	 * 从中栏移除内嵌视图（保活页面与登录态，不销毁）。
	 * 不传 site_id 表示摘掉全部（模态层遮挡、中栏整体切走时用）。
	 */
	aihub_close: {
		input: { site_id?: string };
		output: { success: boolean };
	};
	/** 把交接包注入站点输入框；DOM 失败自动降级剪贴板 */
	aihub_inject: {
		input: { site_id: string; text: string };
		output: { ok: boolean; method: "dom" | "clipboard" };
	};
	/** 从站点当前对话提取消息（尽力而为） */
	aihub_extract: {
		input: { site_id: string };
		output: {
			ok: boolean;
			messages: { role: string; content: string }[];
		};
	};
	/** 把提取到的 Web 对话存成一个 canonical 会话 */
	aihub_import_session: {
		input: {
			site_id: string;
			title?: string;
			messages: { role: string; content: string }[];
		};
		output: { session_id: string };
	};
	/** 列出本机可导入登录态的浏览器 profile */
	aihub_cookie_sources: {
		/** 传 site_id 时会顺带统计每个 profile 有多少条该站点的有效 cookie */
		input: { site_id?: string };
		output: { sources: BrowserCookieSourceRow[] };
	};
	/** 重新加载某站点页面（导入登录态后必须走一次才会生效） */
	aihub_reload: {
		input: { site_id: string };
		output: { ok: boolean };
	};
	/**
	 * 从本机浏览器导入某站点的登录态（cookie）到该站点的内嵌分区。
	 * 只搬运目标站点注册域及其子域的 cookie，不整库搬运。
	 */
	aihub_import_cookies: {
		input: { site_id: string; browser: string; profile: string };
		output: {
			ok: boolean;
			imported: number;
			skipped: number;
			error?: string;
		};
	};

	// ==================
	// AI Hub 互通升级（交换格式 / 互为工具 / 编排）
	// 设计说明见 docs/harness-hub-互通升级施工文档.md
	// ==================

	/**
	 * 把一段会话导出成交换文件。
	 *
	 * `format: "json"` 产出 `.aihub-session.json`（结构化，本应用与 CLI 可精确还原）；
	 * `format: "markdown"` 产出人类与任意 Web AI 都能直接读的 `.md`。
	 */
	harness_session_export: {
		input: {
			session_id: string;
			format?: "json" | "markdown";
			/** 是否连带最近一次交接包一起导出 */
			include_handoff?: boolean;
			/** 输出目录；不传写到系统临时目录 */
			dir?: string;
		};
		output: {
			path: string;
			file_name: string;
			bytes: number;
			message_count: number;
		};
	};
	/**
	 * 导入一个外部会话文件。
	 *
	 * 支持 `.aihub-session.json`、ChatGPT 官方导出的 `conversations.json`、
	 * Claude Code / Codex 的原生 `.jsonl`。识别不出会明确报错，不静默产出空会话。
	 */
	harness_session_import: {
		input: {
			/** 文件绝对路径（与 text 二选一） */
			path?: string;
			/** 直接给内容（拖拽 / 粘贴场景） */
			text?: string;
			/** ChatGPT 导出包里选第几段会话 */
			index?: number;
		};
		output: {
			session_id: string;
			detected_format: string;
			message_count: number;
			/** 该文件里一共有几段会话（ChatGPT 导出包可能有几百段） */
			sibling_count: number;
			title: string | null;
		};
	};
	/** 列出 ChatGPT 导出包里的会话清单，供用户挑一段导入 */
	harness_import_candidates: {
		input: { path: string };
		output: {
			conversations: {
				index: number;
				title: string;
				message_count: number;
				updated_at: number;
			}[];
		};
	};
	/**
	 * 把一段会话作为**附件**送进 Web 站点，并填入一句引导语。
	 *
	 * 这是「长上下文塞不进输入框」的解法。附件通道失败时如实回落到
	 * 「把内容当正文填入」并在 method 里说明，不假装上传成功。
	 */
	aihub_send_session: {
		input: {
			site_id: string;
			session_id: string;
			/** 覆盖引导语 */
			prompt?: string;
			/** 是否连带交接包 */
			include_handoff?: boolean;
		};
		output: {
			ok: boolean;
			/** attachment = 走了附件通道；inline = 回落到正文；clipboard = 都失败 */
			method: "attachment" | "inline" | "clipboard";
			path: string | null;
			error: string | null;
		};
	};

	/** 把另一个入口当工具调用一次（同步等结果） */
	harness_bridge_call: {
		input: {
			target: string;
			kind: "cli" | "web" | "app";
			prompt: string;
			cwd?: string;
			timeout_ms?: number;
			/** 允许目标 agent 改文件；缺省用设置里的值（默认只读） */
			allow_write?: boolean;
		};
		output: HarnessBridgeResult;
	};
	/** 列出跨入口调用审计 */
	harness_bridge_calls_list: {
		input: { limit?: number; target?: string };
		output: { calls: HarnessBridgeCallRow[] };
	};

	/** 反向 MCP Server 状态与一键接入命令 */
	harness_mcp_status: {
		input: Record<string, never>;
		output: HarnessMcpStatusRow;
	};
	/** 打开 / 关闭反向 MCP Server */
	harness_mcp_set_enabled: {
		input: { enabled: boolean };
		output: HarnessMcpStatusRow;
	};
	/** 轮换访问 token（怀疑泄漏时） */
	harness_mcp_rotate_token: {
		input: Record<string, never>;
		output: HarnessMcpStatusRow;
	};

	/** 跑一次多入口议会（进度走 harness-council-event 事件） */
	harness_council_run: {
		input: {
			question: string;
			members: {
				harness: string;
				kind: "cli" | "web" | "app";
				label: string;
			}[];
			cwd?: string;
			/** 只收集各路答案，跳过裁决合并 */
			skip_verdict?: boolean;
			timeout_ms?: number;
		};
		output: {
			run_id: string;
			answers: HarnessCouncilAnswerRow[];
			verdict: string;
			status: string;
			error: string | null;
		};
	};
	/** 列出历史议会 */
	harness_council_list: {
		input: { limit?: number };
		output: { runs: HarnessCouncilRunRow[] };
	};
	/** 取一次议会的全部原始答案 */
	harness_council_get: {
		input: { run_id: string };
		output: { answers: HarnessCouncilAnswerRow[] };
	};

	/** 读某个工作目录的共享白板 */
	harness_board_list: {
		input: { cwd?: string; include_done?: boolean };
		output: {
			entries: HarnessBoardEntryRow[];
			markdown: string;
			/** 落盘的 BOARD.md 路径；全局白板没有落盘目标时为 null */
			file_path: string | null;
		};
	};
	/** 往共享白板追加一条 */
	harness_board_add: {
		input: {
			cwd?: string;
			kind: string;
			content: string;
			author?: string;
			session_id?: string;
		};
		output: { entry: HarnessBoardEntryRow };
	};
	/** 修改白板条目内容 / 完成状态 */
	harness_board_update: {
		input: { id: string; content?: string; state?: "open" | "done" };
		output: { success: boolean };
	};
	/** 删除白板条目 */
	harness_board_remove: {
		input: { id: string };
		output: { success: boolean };
	};

	/** 列出能力路由表 */
	harness_routes_list: {
		input: Record<string, never>;
		output: {
			routes: HarnessRouteRow[];
			capabilities: {
				capability: string;
				label: string;
				description: string;
			}[];
		};
	};
	/** 保存一条路由规则 */
	harness_route_save: {
		input: { capability: string; harnesses: string[]; enabled?: boolean };
		output: { routes: HarnessRouteRow[] };
	};
	/** 恢复某能力的默认顺序 */
	harness_route_reset: {
		input: { capability: string };
		output: { routes: HarnessRouteRow[] };
	};
	/** 解析某能力当前该派给谁（返回全部候选及不可用原因） */
	harness_route_resolve: {
		input: { capability: string };
		output: {
			capability: string;
			label: string;
			candidates: HarnessRouteCandidateRow[];
		};
	};

	/** 列出各入口额度状态 */
	harness_quota_list: {
		input: Record<string, never>;
		output: { quotas: HarnessQuotaRow[] };
	};
	/** 重扫最近转录，刷新限额信号 */
	harness_quota_refresh: {
		input: Record<string, never>;
		output: { quotas: HarnessQuotaRow[] };
	};
	/** 手动标记 / 解除某入口不可用 */
	harness_quota_set_block: {
		input: { harness: string; blocked: boolean };
		output: { quota: HarnessQuotaRow };
	};
	/** 清除某入口的自动检测记录（确认是误判时） */
	harness_quota_clear: {
		input: { harness: string };
		output: { quota: HarnessQuotaRow };
	};

	/** 读 AI Hub 设置 */
	harness_settings_get: {
		input: Record<string, never>;
		output: HarnessHubSettingsRow;
	};
	/** 存 AI Hub 设置（部分更新） */
	harness_settings_save: {
		input: Partial<HarnessHubSettingsRow>;
		output: HarnessHubSettingsRow;
	};

	// ---------- 自动化：运行态监测 ----------

	/** 列出当前所有执行体（含刚结束的，保留 5 分钟） */
	harness_runtime_list: {
		input: Record<string, never>;
		output: { runtimes: HarnessRuntimeRow[] };
	};
	/** 中止一个执行体。返回 false 表示它不支持中止或已经结束 */
	harness_runtime_abort: {
		input: { runtime_id: string };
		output: { ok: boolean };
	};

	// ---------- 自动化：任务 ----------

	/** 列出全部自动化任务 */
	harness_job_list: {
		input: Record<string, never>;
		output: { jobs: HarnessJobRow[] };
	};
	/** 新建或更新任务（不传 id 为新建） */
	harness_job_save: {
		input: HarnessJobInputRow;
		output: { job: HarnessJobRow };
	};
	/** 删除任务（连带其运行记录） */
	harness_job_delete: {
		input: { job_id: string };
		output: { ok: boolean };
	};
	/** 启用 / 停用（停用会清掉下次触发时刻） */
	harness_job_set_enabled: {
		input: { job_id: string; enabled: boolean };
		output: { job: HarnessJobRow | null };
	};
	/** 立即运行一次（绕过触发器与时间窗，仍受并发上限约束） */
	harness_job_run_now: {
		input: { job_id: string };
		output: { run_id: string | null; error: string | null };
	};
	/** 取消正在进行的运行 */
	harness_job_cancel: {
		input: { run_id: string };
		output: { ok: boolean };
	};

	// ---------- 自动化：运行记录 ----------

	/** 运行历史；不传 job_id 则返回全部任务的最近记录 */
	harness_job_runs_list: {
		input: { job_id?: string | null; limit?: number };
		output: { runs: HarnessJobRunRow[] };
	};
	/** 单次运行详情，含每次尝试的失败原因与等待时长 */
	harness_job_run_get: {
		input: { run_id: string };
		output: {
			run: HarnessJobRunRow | null;
			attempts: HarnessJobAttemptRow[];
		};
	};
}
