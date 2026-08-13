// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：skills（共 18 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

export interface SkillsIpcSchema {
	// ==================
	// Claude Code 斜杠命令（扫描 / git diff / 写 CLAUDE.md）
	// ==================
	slash_commands_scan: {
		input: {
			workspace_dir: string;
			include_user_home: boolean;
			max_files?: number;
		};
		output: Array<{
			id: string;
			name?: string;
			description?: string;
			prompt: string;
			source: "project" | "user";
			sourcePath: string;
		}>;
	};
	slash_commands_git_diff: {
		input: { workspace_dir: string; max_bytes?: number };
		output: { has_changes: boolean; diff: string; stat: string };
	};
	slash_commands_write_init: {
		input: { workspace_dir: string; overwrite: boolean };
		output: {
			path: string;
			created: boolean;
			overwritten: boolean;
			/**
			 * 当 `overwrite=false` 且目标已存在时，主进程返回结构化错误标识，
			 * 由前端拦截后弹确认对话框，用户同意后带 `overwrite=true` 重调。
			 * 其它运行时异常仍按抛错处理。
			 */
			error?: "exists";
		};
	};
	/**
	 * 唤起原生目录选择对话框；供 `/add-dir` 等命令使用。
	 * 取消时返回 `canceled: true` 而非抛错。
	 */
	slash_commands_pick_directory: {
		input: {
			/** 对话框标题；默认 "选择目录"。 */
			title?: string;
			/** 起始目录；建议传当前工作区。 */
			default_path?: string;
		};
		output: {
			canceled: boolean;
			/** 用户选中的绝对路径；canceled=true 时为空字符串。 */
			path: string;
		};
	};
	/**
	 * 唤起原生保存文件对话框；供 `/export` 等命令使用。
	 * 取消时返回 `canceled: true` 而非抛错。
	 */
	slash_commands_save_dialog: {
		input: {
			title?: string;
			default_path?: string;
			/** 文件扩展名过滤；默认 markdown。 */
			filters?: Array<{ name: string; extensions: string[] }>;
		};
		output: {
			canceled: boolean;
			path: string;
		};
	};
	/**
	 * 把字符串内容写入指定绝对路径；用于 `/export` 输出 Markdown 文件。
	 * 路径必须是绝对路径；目标目录不存在时会自动 mkdir -p。
	 */
	slash_commands_export_session_md: {
		input: {
			path: string;
			content: string;
		};
		output: {
			path: string;
			bytes: number;
		};
	};

	// ==================
	// Agent Skills
	// ==================
	list_skills: {
		input: Record<string, never>;
		output: Array<{
			name: string;
			description: string;
			location: string;
			enabled: boolean;
			/** 来自 SKILL.md `od.mode` 或描述启发，决定该技能是否归属"设计/媒体"类 */
			modeClass: "design" | "general";
			/** 原始 od.mode（若存在），用于 UI 展示 chip */
			modeTag?: string;
			/** 用户是否手动设置过启用状态；未手动调过的项跟随设计模式开关 */
			userOverride: boolean;
			/** 来自 Claude 插件市场等只读源，本面板不允许删除 */
			readonly?: boolean;
		}>;
	};
	import_skill: {
		input: { sourcePath: string };
		output: {
			name: string;
			description: string;
			location: string;
			enabled: boolean;
			modeClass: "design" | "general";
			modeTag?: string;
			userOverride: boolean;
		};
	};
	delete_skill: {
		input: { skillName: string };
		output: { success: boolean };
	};
	set_skill_enabled: {
		input: { skillName: string; enabled: boolean };
		output: { success: boolean };
	};
	// ==================
	// Skills Marketplace（多源市场）
	// ==================
	skills_marketplace_list_sources: {
		input: Record<string, never>;
		output: {
			sources: Array<{
				id: string;
				name: string;
				type:
					| "anthropic_marketplace_json"
					| "skills_sh"
					| "tencent_skillhub"
					| "custom_json";
				url: string;
				enabled: boolean;
				trust?: "official" | "community" | "custom";
			}>;
			mirrors: Array<{
				id: string;
				name: string;
				pattern: string;
				enabled: boolean;
			}>;
			autoCheck: boolean;
		};
	};
	skills_marketplace_set_sources: {
		input: {
			sources?: Array<{
				id: string;
				name: string;
				type:
					| "anthropic_marketplace_json"
					| "skills_sh"
					| "tencent_skillhub"
					| "custom_json";
				url: string;
				enabled: boolean;
				trust?: "official" | "community" | "custom";
			}>;
			mirrors?: Array<{
				id: string;
				name: string;
				pattern: string;
				enabled: boolean;
			}>;
			autoCheck?: boolean;
		};
		output: { success: boolean };
	};
	skills_marketplace_search: {
		input: { query?: string; sourceId?: string };
		output: {
			entries: Array<{
				id: string;
				sourceId: string;
				trust: "official" | "community" | "custom";
				name: string;
				displayName?: string;
				description: string;
				version?: string;
				author?: string;
				homepage?: string;
				tags?: string[];
				icon?: string;
				license?: string;
				sha256?: string;
				artifact: unknown;
				rawSourceUrl?: string;
				installed?: boolean;
				installedVersion?: string;
			}>;
			errors: Array<{ sourceId: string; error: string }>;
		};
	};
	skills_marketplace_install: {
		input: { entryId: string };
		output: {
			success: boolean;
			name?: string;
			location?: string;
			error?: string;
		};
	};
	skills_marketplace_uninstall: {
		input: { skillName: string };
		output: { success: boolean };
	};
	skills_marketplace_check_updates: {
		input: Record<string, never>;
		output: {
			updates: Array<{
				name: string;
				currentVersion?: string;
				latestVersion?: string;
				entryId: string;
				sourceId: string;
			}>;
		};
	};
	skills_marketplace_test_mirror: {
		input: Record<string, never>;
		output: {
			results: Array<{
				url: string;
				ok: boolean;
				latencyMs?: number;
				error?: string;
			}>;
		};
	};
	skills_marketplace_preview: {
		input: { entryId: string };
		output: {
			skillMd?: string;
			usedUrl?: string;
			error?: string;
		};
	};
}
