/**
 * Turn-1 Discovery 表单 Schema —— 前后端共享的字段定义
 *
 * 前端 DiscoveryForm.tsx 据此渲染 React 控件；后端 design_start_session
 * 把同一份 schema 返给前端，避免双源真理。
 */

export type DiscoveryFieldType = "select" | "multiselect" | "text" | "textarea";

export interface DiscoveryFieldOption {
	value: string;
	label: string;
	description?: string;
}

export interface DiscoveryField {
	id: string;
	type: DiscoveryFieldType;
	label: string;
	help?: string;
	required?: boolean;
	options?: DiscoveryFieldOption[];
	default_value?: string | string[];
	placeholder?: string;
}

export interface DiscoveryFormSchema {
	version: string;
	fields: DiscoveryField[];
}

export type DiscoveryAnswers = Record<string, string | string[] | undefined>;

export const DISCOVERY_FORM_SCHEMA: DiscoveryFormSchema = {
	version: "1.0.0",
	fields: [
		{
			id: "output_kind",
			type: "select",
			label: "你想做什么？",
			help: "选择交付物形态，会自动决定生成模式（mode）",
			required: true,
			options: [
				{
					value: "web-prototype",
					label: "网页原型 / 落地页",
					description: "可在浏览器响应式预览的 hi-fi 设计稿",
				},
				{
					value: "mobile-mockup",
					label: "移动应用 Mockup",
					description: "带设备框、单屏 / 多屏导航",
				},
				{
					value: "pitch-deck",
					label: "演示稿（Pitch Deck）",
					description: "16:9 多页 HTML 演示，键盘箭头切页",
				},
				{
					value: "poster",
					label: "海报 / 社交卡片",
					description: "1080×1080 或 1080×1920 单张视觉",
				},
			],
			default_value: "web-prototype",
		},
		{
			id: "topic",
			type: "textarea",
			label: "简介",
			help: "一句话说清这是给谁、解决什么问题、想传达什么气质（30–200 字）",
			required: true,
			placeholder:
				"例：一款给独立创作者用的写作工具，主打「无干扰长写作」，气质沉静、像翻一本质感书。",
		},
		{
			id: "tone",
			type: "select",
			label: "气质 / 调性",
			required: true,
			options: [
				{ value: "modern-minimal", label: "现代极简（Linear / Vercel 风）" },
				{ value: "editorial", label: "杂志编辑（New Yorker 风）" },
				{ value: "tech-utility", label: "机器界面（Terminal 风）" },
				{ value: "brutalist", label: "实验粗粝（Sagmeister 风）" },
				{ value: "soft-warm", label: "奶油暖调（Claude 风）" },
			],
			default_value: "modern-minimal",
		},
		{
			id: "brand",
			type: "select",
			label: "品牌资产",
			help: "如果有具体品牌（颜色/字体/Logo）选「我有品牌规范」；否则选「让我从内置方向里挑」",
			required: true,
			options: [
				{
					value: "pick-direction",
					label: "我没有品牌 — 让我从 5 个方向里选",
					description: "用内置 OKLch 方向规格",
				},
				{
					value: "brand-spec",
					label: "我有品牌 — 让我从内置系统库挑（如 Linear / Stripe / Claude）",
					description: "Phase 2 启用",
				},
			],
			default_value: "pick-direction",
		},
		{
			id: "scale",
			type: "select",
			label: "页面规模",
			required: true,
			options: [
				{ value: "single-screen", label: "单屏 / 单页" },
				{ value: "landing-page", label: "完整落地页（多 section）" },
				{ value: "multi-page", label: "多页（导航 + 内容页）" },
			],
			default_value: "landing-page",
		},
		{
			id: "must_haves",
			type: "textarea",
			label: "必须包含的元素",
			help: "可选。每行一条。例：CTA「立即试用」/ 价格表 / FAQ / 客户证言",
			required: false,
			placeholder: "Hero 标题\n3 个核心特性\n定价（3 档）\nFooter",
		},
		{
			id: "dont_haves",
			type: "textarea",
			label: "避免出现",
			help: "可选。例：不要紫色渐变 / 不要 emoji / 不要 sparkle icon",
			required: false,
			placeholder: "不要紫色渐变背景\n不要客户 logo 矩阵",
		},
	],
};

/** 把答卷转成一段 Markdown 摘要，注入到 system prompt */
export function renderDiscoveryAnswers(answers: DiscoveryAnswers): string {
	const lines: string[] = ["# 用户答卷", ""];
	for (const field of DISCOVERY_FORM_SCHEMA.fields) {
		const raw = answers[field.id];
		if (raw == null || raw === "") continue;
		const value = Array.isArray(raw) ? raw.join(", ") : String(raw);
		lines.push(`## ${field.label}`);
		lines.push(value);
		lines.push("");
	}
	return lines.join("\n");
}

/**
 * 由 output_kind 推断默认 mode；如果用户后续手动选了 mode 就以用户为准。
 */
export function inferModeFromAnswers(answers: DiscoveryAnswers): string {
	const kind = String(answers.output_kind ?? "web-prototype");
	switch (kind) {
		case "mobile-mockup":
			return "mobile-mockup";
		case "pitch-deck":
			return "pitch-deck";
		case "poster":
			return "poster";
		case "web-prototype":
		default:
			return "web-prototype";
	}
}
