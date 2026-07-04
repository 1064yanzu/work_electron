/**
 * 防回归检查：扫描 src/ 内新增的硬编码颜色 Tailwind 任意值类名。
 *
 * 背景：主题 token（--t-*）已覆盖语义色 / 品牌色 / 灰阶，
 * 新代码应使用 bg-error / text-success / bg-terracotta 等语义类名，
 * 不要再写 bg-[#xxx] / text-[#xxx] / border-[#xxx]。
 *
 * 策略：白名单存量文件（逐步清理），新增文件出现硬编码色直接报错退出 1。
 * 用法：node scripts/check-hardcoded-colors.mjs   （已挂在 npm run lint 链路）
 */
import { execSync } from "node:child_process";
import process from "node:process";

// 存量待清理文件白名单 —— 2026-07 清理后仅剩死代码文件。
// 清掉一个就从这里删掉一个，禁止往里加新条目
const LEGACY_ALLOWLIST = new Set([
	"src/components/dashboard/DashboardHeader.tsx", // 死代码，待删除
]);

const PATTERN = String.raw`(?:bg|text|border|ring|shadow|from|via|to)-\[#[0-9a-fA-F]{3,8}\]`;

let output = "";
try {
	output = execSync(`rg -n --no-heading -e '${PATTERN}' src --glob '*.tsx' --glob '*.ts'`, {
		encoding: "utf8",
	});
} catch (err) {
	// rg 无匹配时退出码 1，属于通过
	if (err.status === 1) {
		console.log("[check-hardcoded-colors] ✅ 未发现硬编码颜色类名");
		process.exit(0);
	}
	throw err;
}

const violations = [];
for (const line of output.trim().split("\n")) {
	const file = line.split(":", 1)[0];
	if (!LEGACY_ALLOWLIST.has(file)) {
		violations.push(line);
	}
}

if (violations.length > 0) {
	console.error(
		"[check-hardcoded-colors] ❌ 发现新增硬编码颜色类名（请改用主题 token 类名，如 bg-error / text-success / bg-terracotta）：\n",
	);
	for (const v of violations) console.error(`  ${v}`);
	process.exit(1);
}

console.log(
	`[check-hardcoded-colors] ✅ 通过（白名单存量文件 ${LEGACY_ALLOWLIST.size} 个待清理）`,
);
