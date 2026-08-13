/**
 * settingsCatalog.test.ts — 设置体系骨架层单元测试
 *
 * 覆盖：
 *   - 5 个一级分类、24 个二级 Tab 的数量断言
 *   - 每个 subtab.id 都在 `SUBTAB_ID_SET` 里
 *   - `normalizeSettingsTabId` 对新 id 原样放行、对空/未知 id 降级
 *
 * 注：legacy 扁平 id 的映射表已随 C6 收敛移除（全仓统一新 id），
 * 不再测试旧 id 归一。
 *
 * 运行方式：`tsx --test src/components/Settings/__tests__/settingsCatalog.test.ts`
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
	SETTINGS_CATEGORIES,
	SETTINGS_SUBTABS,
	SUBTAB_ID_SET,
	getFirstSubtabOf,
	getSubtab,
	getSubtabsByCategory,
	normalizeSettingsTabId,
} from "../settingsCatalog";

test("SETTINGS_CATEGORIES 固定 5 条", () => {
	assert.equal(SETTINGS_CATEGORIES.length, 5);
	const ids = SETTINGS_CATEGORIES.map((c) => c.id);
	assert.deepEqual(ids, ["general", "ai", "workshop", "integrations", "data"]);
});

test("SETTINGS_SUBTABS 固定 25 条", () => {
	// 2026-08 新增「剪藏服务」（integrations.clip）：23 → 24
	// 2026-08 新增「AI 代理」（integrations.aiProxy）：24 → 25
	assert.equal(SETTINGS_SUBTABS.length, 25);
});

test("SETTINGS_SUBTABS 每条 id 都能被 SUBTAB_ID_SET 命中", () => {
	for (const s of SETTINGS_SUBTABS) {
		assert.ok(
			SUBTAB_ID_SET.has(s.id),
			`subtab id ${s.id} 未在 SUBTAB_ID_SET 中`,
		);
	}
});

test("每个 subtab 都能反查到 category，category 也必须在 SETTINGS_CATEGORIES 声明", () => {
	const categoryIds = new Set(SETTINGS_CATEGORIES.map((c) => c.id));
	for (const s of SETTINGS_SUBTABS) {
		assert.ok(categoryIds.has(s.category), `${s.id} 指向未知 category`);
		assert.equal(getSubtab(s.id)?.id, s.id);
	}
});

test("getSubtabsByCategory / getFirstSubtabOf 语义", () => {
	for (const c of SETTINGS_CATEGORIES) {
		const subs = getSubtabsByCategory(c.id);
		assert.ok(subs.length > 0, `category ${c.id} 下应至少有 1 条 subtab`);
		assert.equal(getFirstSubtabOf(c.id), subs[0]?.id);
	}
});

test("normalizeSettingsTabId 对新 id 原样返回", () => {
	assert.equal(normalizeSettingsTabId("ai.models"), "ai.models");
	assert.equal(normalizeSettingsTabId("data.stats"), "data.stats");
	assert.equal(
		normalizeSettingsTabId("integrations.harnessHub"),
		"integrations.harnessHub",
	);
});

test("normalizeSettingsTabId 空/未知降级到 ai.models", () => {
	const originalWarn = console.warn;
	const warnings: unknown[][] = [];
	console.warn = (...args: unknown[]) => {
		warnings.push(args);
	};
	try {
		assert.equal(normalizeSettingsTabId(undefined), "ai.models");
		assert.equal(normalizeSettingsTabId(null), "ai.models");
		assert.equal(normalizeSettingsTabId(""), "ai.models");
		// legacy 扁平 id 已不再映射，一律按未知 id 降级
		assert.equal(normalizeSettingsTabId("models"), "ai.models");
		assert.equal(normalizeSettingsTabId("not-a-real-id"), "ai.models");
		// 未知 id 应触发 warn；空/null 不 warn
		assert.ok(warnings.length >= 1, "unknown id 应触发 console.warn");
	} finally {
		console.warn = originalWarn;
	}
});
