// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：style（共 23 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	StyleAnalysisData,
	StyleFeedback,
	StyleFeedbackType,
	StyleIntensity,
	StyleProfile,
	StyleProfileDetail,
	StyleProfileRecipe,
	StyleSample,
	StyleSampleAuthStatus,
	StyleSampleContentType,
} from "./common";

export interface StyleIpcSchema {
	// ==================================================================================
	// 语言风格包（Style Profile）IPC channels
	// ==================================================================================

	/** 创建风格包 */
	style_profile_create: {
		input: {
			name: string;
			description?: string;
			language?: string;
			analyze_model_id?: string;
		};
		output: StyleProfile;
	};
	/** 获取风格包列表 */
	style_profile_list: {
		input: { include_archived?: boolean };
		output: StyleProfile[];
	};
	/** 获取风格包详情（含分析结果和样本） */
	style_profile_get: {
		input: { id: string };
		output: StyleProfileDetail;
	};
	/** 更新风格包基本信息 */
	style_profile_update: {
		input: {
			id: string;
			name?: string;
			description?: string;
			language?: string;
			analyze_model_id?: string;
			generation_config?: StyleProfile["generation_config"];
			is_default?: boolean;
		};
		output: StyleProfile;
	};
	/** 删除风格包（含级联删除样本、分析、反馈） */
	style_profile_delete: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 归档/恢复风格包 */
	style_profile_archive: {
		input: { id: string; archive: boolean };
		output: StyleProfile;
	};

	/** 添加样本 */
	style_sample_add: {
		input: {
			profile_id: string;
			title?: string;
			content: string;
			content_type?: StyleSampleContentType;
			authorization_status?: StyleSampleAuthStatus;
		};
		output: StyleSample;
	};
	/** 删除样本 */
	style_sample_remove: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 获取某风格包的所有样本 */
	style_sample_list: {
		input: { profile_id: string };
		output: StyleSample[];
	};
	/** 主进程解析文件（txt/md/docx/pdf）→ 返回文本 */
	style_sample_parse_file: {
		input: { file_path: string };
		output: { content: string; title: string; word_count: number };
	};
	/** 从 zip 压缩包批量导入样本（主进程解压 + 解析） */
	style_sample_import_from_zip: {
		input: { profile_id: string; zip_path: string };
		output: {
			imported: number;
			failed: number;
			results: Array<{ file: string; success: boolean; error?: string }>;
		};
	};

	/** 触发 LLM 分步分析（通过 style-analysis-progress 事件推送进度） */
	style_analysis_start: {
		input: { profile_id: string; model_id?: string };
		output: { job_id: string };
	};
	/** 获取已完成的分析结果 */
	style_analysis_get: {
		input: { profile_id: string };
		output: StyleAnalysisData | null;
	};
	/** 手动更新（校准）分析结果 */
	style_analysis_update: {
		input: { profile_id: string; data: Partial<StyleAnalysisData> };
		output: StyleAnalysisData;
	};

	/** 将风格包渲染为注入用的 system prompt XML 块 */
	style_profile_render_prompt: {
		input: { profile_id: string; intensity?: StyleIntensity };
		output: { prompt: string };
	};

	/** 提交风格反馈 */
	style_feedback_submit: {
		input: {
			profile_id: string;
			feedback_type: StyleFeedbackType;
			session_context?: string;
			note?: string;
		};
		output: StyleFeedback;
	};
	/** 获取风格包的历史反馈 */
	style_feedback_list: {
		input: { profile_id: string; limit?: number };
		output: StyleFeedback[];
	};

	// ==================================================================================
	// 语言风格包混搭配方（Style Recipe）IPC channels
	// ==================================================================================

	/** 创建混搭配方 */
	style_recipe_create: {
		input: {
			name: string;
			description?: string;
			// v2 层级来源（灵魂 / 思维 / 篇章 / 血肉 / 关系性）
			soul_profile_id?: string | null;
			thinking_profile_id?: string | null;
			articulation_profile_id?: string | null;
			texture_profile_id?: string | null;
			relational_profile_id?: string | null;
			// v1 层级来源（向后兼容）
			cognitive_profile_id?: string | null;
			rhetorical_profile_id?: string | null;
			aesthetic_profile_id?: string | null;
			anchors_profile_id?: string | null;
			intensity?: StyleIntensity;
		};
		output: StyleProfileRecipe;
	};
	/** 获取混搭配方列表 */
	style_recipe_list: {
		input: Record<string, never>;
		output: StyleProfileRecipe[];
	};
	/** 获取混搭配方详情 */
	style_recipe_get: {
		input: { id: string };
		output: StyleProfileRecipe;
	};
	/** 更新混搭配方 */
	style_recipe_update: {
		input: {
			id: string;
			name?: string;
			description?: string;
			// v2 层级来源
			soul_profile_id?: string | null;
			thinking_profile_id?: string | null;
			articulation_profile_id?: string | null;
			texture_profile_id?: string | null;
			relational_profile_id?: string | null;
			// v1 层级来源（向后兼容）
			cognitive_profile_id?: string | null;
			rhetorical_profile_id?: string | null;
			aesthetic_profile_id?: string | null;
			anchors_profile_id?: string | null;
			intensity?: StyleIntensity;
		};
		output: StyleProfileRecipe;
	};
	/** 删除混搭配方 */
	style_recipe_delete: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 将混搭配方渲染为注入用的 system prompt XML 块 */
	style_recipe_render_prompt: {
		input: { recipe_id: string; intensity?: StyleIntensity };
		output: { prompt: string };
	};
}
