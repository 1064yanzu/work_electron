/**
 * 设计模块的 System Prompt 组装器
 *
 * 把 [identity + anti-slop + 用户答卷摘要 + 方向规格 + (系统 DESIGN.md)
 *    + (skill 资源地图：template / checklist / components 切片) + (设备/Deck 边框)
 *    + (brand-spec.md) + 5 维自检契约 + self-gate 协议]
 * 组合成 markdown 字符串，注入到 Agent SDK 的 `system_prompt`。
 *
 * 文件读取出错时回退到内存中的最小版本，保证不会因为 library 路径不一致让流程崩。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { renderDirectionSpec } from "./directions";
import {
	type DiscoveryAnswers,
	renderDiscoveryAnswers,
	inferModeFromAnswers,
} from "./discoveryForm";
import { getDesignLibraryRoot } from "./resourcePaths";
import { getSkillResourceMap, getFrameSource } from "./skillsRegistry";

async function readFileSafe(filePath: string, fallback: string): Promise<string> {
	try {
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return fallback;
	}
}

const MODE_TO_SKILL: Record<string, string> = {
	"web-prototype": "ipo-web-prototype",
	"mobile-mockup": "ipo-mobile-mockup",
	"pitch-deck": "ipo-pitch-deck",
	poster: "ipo-poster",
	"design-review": "ipo-design-review",
};

const MODE_DEFAULT_FRAME: Record<string, string | undefined> = {
	"web-prototype": "browser-chrome",
	"mobile-mockup": "iphone-15-pro",
	"pitch-deck": "deck-framework",
	poster: undefined,
	"design-review": undefined,
};

export interface ComposeSystemPromptOpts {
	answers: DiscoveryAnswers;
	directionId?: string;
	systemId?: string;
	mode?: string;
	workDir?: string;
	gateMode?: boolean;
}

export async function composeDesignSystemPrompt(
	opts: ComposeSystemPromptOpts,
): Promise<string> {
	const libRoot = getDesignLibraryRoot();

	const identity = await readFileSafe(
		path.join(libRoot, "prompts", "identity.md"),
		"# 你是一位资深产品设计师，输出单文件 HTML 设计稿。",
	);
	const antiSlop = await readFileSafe(
		path.join(libRoot, "anti-slop.md"),
		"# 反 AI Slop：禁止紫色渐变、sparkle icon、客户 logo 灰阶矩阵、Bootstrap card。",
	);
	const critique = await readFileSafe(
		path.join(libRoot, "critique-rubric.md"),
		"# 交付前自检：philosophy / hierarchy / execution / functional / innovation 各 1-10 分。",
	);
	const directionSpec = await renderDirectionSpec(opts.directionId);
	const answersBlock = renderDiscoveryAnswers(opts.answers);

	const mode = opts.mode || inferModeFromAnswers(opts.answers);
	const modeFallback = await readFileSafe(
		path.join(libRoot, "modes", `${mode}.md`),
		`# Mode: ${mode}\n按照所选方向规格生成单文件 HTML 设计稿。`,
	);

	const skillId = MODE_TO_SKILL[mode];
	const skill = skillId ? await getSkillResourceMap(skillId) : null;

	let systemSpec = "";
	if (opts.systemId) {
		systemSpec = await readFileSafe(
			path.join(libRoot, "systems", opts.systemId, "DESIGN.md"),
			"",
		);
	}

	// brand-spec.md 是 M2 品牌提取流水线的产物，优先级最高
	let brandSpec = "";
	if (opts.workDir) {
		brandSpec = await readFileSafe(path.join(opts.workDir, "brand-spec.md"), "");
	}

	// Frame：mobile / web / deck 模式从 skill frontmatter 或 mode 默认取
	const frameId = skill?.frontmatter.default_frame ?? MODE_DEFAULT_FRAME[mode];
	const frameSource = frameId ? await getFrameSource(frameId) : null;

	const parts: string[] = [
		"# 你的身份",
		identity,
		"",
		"# 反 AI Slop 黑名单",
		antiSlop,
		"",
		"# 用户答卷",
		answersBlock,
		"",
		"# 选定方向规格",
		directionSpec,
	];

	if (systemSpec.trim()) {
		parts.push("", "# 选定品牌系统 (DESIGN.md)", systemSpec);
	}

	if (brandSpec.trim()) {
		parts.push(
			"",
			"# 品牌规格 (brand-spec.md — 最高优先级)",
			brandSpec,
			"",
			"> 必须使用上面 :root 中定义的 brand-* CSS 变量；其他来源的颜色只能作为辅助。",
		);
	}

	if (skill) {
		parts.push("", "# Skill 资源地图");
		parts.push(`Skill: ${skill.id}`);
		if (skill.frontmatter.description) {
			parts.push(skill.frontmatter.description);
		}
		if (skill.template_html) {
			parts.push("", "## 起手骨架（assets/template.html）", "```html", skill.template_html, "```");
		}
		if (skill.checklist_md) {
			parts.push("", "## 检查清单（references/checklist.md）", skill.checklist_md);
		}
		if (skill.components_md) {
			parts.push("", "## 组件片段（references/components.md）", skill.components_md);
		}
		if (skill.themes_md) {
			parts.push("", "## 主题约束（references/themes.md）", skill.themes_md);
		}
		if (skill.example_html) {
			parts.push(
				"",
				"## 可见参考（example.html，用作风格基线，不要逐字复制）",
				"```html",
				skill.example_html,
				"```",
			);
		}
	} else {
		parts.push("", "# 模式专属指令", modeFallback);
	}

	if (frameSource) {
		parts.push(
			"",
			`# 必用边框资源（${frameId}）`,
			"```html",
			frameSource,
			"```",
			"> 把以上边框作为容器；只填屏幕内容/幻灯区，别替换边框骨架。",
		);
	}

	parts.push("", "# 交付前自检契约", critique);

	parts.push(
		"",
		"---",
		"",
		"## 输出要求",
		"",
		"1. **必须生成** `index.html` 文件，并将所有 CSS / JS 内联到 `<head>` 与 `<body>` 之中；图片优先用 SVG 或 emoji，必要时用 `data:` URL 内联。",
		"2. **禁止**引用任何远程 CDN，包括 Google Fonts、unpkg、jsdelivr；字体走 system font stack。",
		"3. 生成完后在最后一条助手消息里附 5 维自检报告（philosophy / hierarchy / execution / functional / innovation 各 1-10 分 + 修复清单）。",
		"4. 你已经在线程目录里运行（cwd 已经是设计会话目录）；写文件用相对路径 `./index.html` 即可。",
	);

	if (opts.gateMode) {
		parts.push(
			"",
			"## Self-Gate 协议（gate_mode=true 时启用）",
			"",
			"在 5 维自检之后，必须再输出一个 JSON 块：",
			"```json",
			'{ "passed": <true|false>, "lowest_dim": "<name>", "lowest_score": <n>, "regenerate_reason": "<short>" }',
			"```",
			"任意维度 <3 时 `passed=false`，并立刻发起一次重写（保留布局骨架，只修问题维度）。",
			"重写最多 3 次；超过则交付当前版本并标记 `gate=exhausted`。",
		);
	}

	return parts.join("\n");
}
