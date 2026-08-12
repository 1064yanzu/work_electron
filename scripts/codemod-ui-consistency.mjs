#!/usr/bin/env node
/**
 * codemod-ui-consistency.mjs — 前端一致性批量整改（2026-08-13）
 *
 * 依据 docs/前端体验审查报告.md 执行的机械替换：
 *  S1  zinc/gray/slate/neutral/stone-N → cream-N（950 归并到 900）
 *  S5  过渡时长两档化：75/100/200→150，300→250（500/700/1000 仪式感保留）
 *  S6  transition-all → 定向属性（颜色/透明度/变换/阴影），排除尺寸动画文件
 *  S4  rounded 任意值 → 标准刻度
 *  L2  间距任意值 → 标准刻度
 *  L1  text-[11px]→text-xs；text-[10px]→text-[11px]（先 11 后 10）
 *  I6  backdrop-blur-xl → backdrop-blur-md
 *  I3  active:scale-90 → active:scale-95
 *  S8  border-black/[0.02] → border-black/[0.06]（浅色下面板边界可见性）
 *
 * 用法：node scripts/codemod-ui-consistency.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = decodeURIComponent(new URL("..", import.meta.url).pathname);

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		const st = statSync(p);
		if (st.isDirectory()) walk(p, out);
		else if (/\.(tsx|ts)$/.test(name)) out.push(p.slice(ROOT.length));
	}
	return out;
}
const files = walk(join(ROOT, "src"));

/** 尺寸动画依赖 transition-all 的文件，跳过 S6，人工另行处理 */
const TRANSITION_ALL_EXCLUDE = new Set(["src/components/ui/ProgressBar.tsx"]);

/** 终端/代码画布等刻意硬编码深色的文件不参与色阶替换（它们用 hex，不用色阶，双保险） */
const COLOR_EXCLUDE = new Set([
	"src/components/Terminal/TerminalInstance.tsx",
	"src/components/sandbox/workspace/MonacoEditor.tsx",
]);


/** @type {Array<{name:string, apply:(code:string, file:string)=>string}>} */
const rules = [
	{
		name: "S1 硬编码色阶→cream",
		apply(code, file) {
			if (COLOR_EXCLUDE.has(file)) return code;
			return code.replace(
				/-(zinc|gray|slate|neutral|stone)-(\d{2,3})\b/g,
				(_, _family, num) => `-cream-${num === "950" ? "900" : num}`,
			);
		},
	},
	{
		name: "S5 时长两档化",
		apply(code) {
			return code
				.replace(/\bduration-(75|100|200)\b/g, "duration-150")
				.replace(/\bduration-300\b/g, "duration-250");
		},
	},
	{
		name: "S6 transition-all 定向化",
		apply(code, file) {
			if (TRANSITION_ALL_EXCLUDE.has(file)) return code;
			return code.replace(
				/\btransition-all\b/g,
				"transition-[color,background-color,border-color,opacity,box-shadow,transform]",
			);
		},
	},
	{
		name: "S4 圆角收敛",
		apply(code) {
			const map = {
				"rounded-[2px]": "rounded-sm",
				"rounded-[3px]": "rounded",
				"rounded-[7px]": "rounded-lg",
				"rounded-[8px]": "rounded-lg",
				"rounded-[10px]": "rounded-xl",
				"rounded-[14px]": "rounded-2xl",
				"rounded-[20px]": "rounded-2xl",
				"rounded-[22px]": "rounded-3xl",
				"rounded-[24px]": "rounded-3xl",
				"rounded-[26px]": "rounded-3xl",
				"rounded-[28px]": "rounded-3xl",
				"rounded-[34px]": "rounded-3xl",
			};
			for (const [from, to] of Object.entries(map)) {
				code = code.split(from).join(to);
			}
			return code;
		},
	},
	{
		name: "L2 间距收敛",
		apply(code) {
			const map = {
				"mt-[1px]": "mt-px",
				"space-y-[1px]": "space-y-px",
				"pb-[2px]": "pb-0.5",
				"p-[2px]": "p-0.5",
				"mt-[2px]": "mt-0.5",
				"py-[2px]": "py-0.5",
				"p-[3px]": "p-1",
				"mt-[3px]": "mt-1",
				"py-[3px]": "py-1",
				"mt-[5px]": "mt-1",
				"py-[6px]": "py-1.5",
				"py-[7px]": "py-1.5",
				"p-[8px]": "p-2",
				"py-[9px]": "py-2",
				"p-[10px]": "p-2.5",
				"pl-[10px]": "pl-2.5",
				"p-[14px]": "p-3.5",
				"ml-[22px]": "ml-5.5",
				"pl-[30px]": "pl-8",
				"pl-[38px]": "pl-10",
			};
			for (const [from, to] of Object.entries(map)) {
				code = code.split(from).join(to);
			}
			return code;
		},
	},
	{
		name: "L1 小字号升级（先 11→xs，再 10→11）",
		apply(code) {
			return code
				.replace(/text-\[11px\]/g, "text-xs")
				.replace(/text-\[10px\]/g, "text-[11px]");
		},
	},
	{
		name: "I6 毛玻璃收敛",
		apply(code) {
			return code.replace(/\bbackdrop-blur-xl\b/g, "backdrop-blur-md");
		},
	},
	{
		name: "I3 按压幅度统一",
		apply(code) {
			return code.replace(/\bactive:scale-90\b/g, "active:scale-95");
		},
	},
	{
		name: "S8 面板边框可见性",
		apply(code) {
			// 实际代码中无 border-black/[0.02]（仅存在于旧设计文档）；
			// --panel-border 变量调整在 index.css 手工完成。
			return code;
		},
	},
];

let totalChanged = 0;
const stats = new Map();

for (const file of files) {
	const path = `${ROOT}${file}`;
	const original = readFileSync(path, "utf8");
	let code = original;
	for (const rule of rules) {
		const next = rule.apply(code, file);
		if (next !== code) {
			stats.set(rule.name, (stats.get(rule.name) ?? 0) + 1);
			code = next;
		}
	}
	if (code !== original) {
		totalChanged++;
		if (!DRY_RUN) writeFileSync(path, code);
	}
}

console.log(`${DRY_RUN ? "[dry-run] " : ""}共修改 ${totalChanged} 个文件`);
for (const [name, count] of stats) console.log(`  ${name}: ${count} 个文件`);
