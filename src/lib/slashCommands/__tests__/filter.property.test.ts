/**
 * Claude Code 风格斜杠命令 —— Filter 属性测试（Property 2）。
 *
 * **Validates: Requirements R1.4, R9.4**
 *
 * 使用项目自带的 node:test + 确定性 PRNG，与 registry.property.test.ts 保持同一风格。
 */

import assert from "node:assert/strict";
import test from "node:test";

import { CommandRegistry } from "../registry";
import { matchFilter } from "../filter";
import type {
	CommandContext,
	CommandGroupId,
	SlashCommandDefinition,
	SlashCommandsSettingsSnapshot,
} from "../types";

// ---------------------------------------------------------------------------
// 随机工具
// ---------------------------------------------------------------------------

function createRng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const SEED = 0xf11e_12;
const ITER = 100;
const GROUPS: readonly CommandGroupId[] = [
	"session",
	"runtime",
	"inspect",
	"workspace",
	"custom",
];

function pick<T>(rng: () => number, xs: readonly T[]): T {
	return xs[Math.min(Math.floor(rng() * xs.length), xs.length - 1)] as T;
}

function randomId(rng: () => number, len = 6): string {
	const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
	let out = "";
	for (let i = 0; i < len; i++) out += abc[Math.floor(rng() * abc.length)];
	return out;
}

function makeDef(
	id: string,
	name: string,
	desc: string,
): SlashCommandDefinition {
	return {
		id,
		name,
		description: desc,
		group: pick(createRng(id.length), GROUPS),
		kind: "action",
		availability: () => ({ state: "available" }),
	};
}

function makeCtx(): CommandContext {
	const settings: SlashCommandsSettingsSnapshot = {
		enabled: true,
		visibility: {},
		defaultColorThemeId: "default",
		customScanEnabled: true,
	};
	return {
		activeSession: null,
		sdkSessionId: null,
		recentResumableSessions: [],
		currentModel: null,
		availableModels: [],
		planModeEnabled: false,
		permissionMode: "default",
		workspacePath: null,
		hasGitRepo: false,
		rightSidebarVisible: false,
		currentColorThemeId: "default",
		settings,
		invokeSelectModel: () => undefined,
	};
}

// ---------------------------------------------------------------------------
// Property 2.a：空过滤词保持原序
// ---------------------------------------------------------------------------

test("property 2.a: 空过滤词返回原 Registry 顺序", () => {
	const rng = createRng(SEED ^ 0x01);
	for (let i = 0; i < ITER; i++) {
		const reg = new CommandRegistry();
		const size = 2 + Math.floor(rng() * 10);
		const defs: SlashCommandDefinition[] = [];
		const seen = new Set<string>();
		while (defs.length < size) {
			const id = randomId(rng);
			if (seen.has(id)) continue;
			seen.add(id);
			defs.push(makeDef(id, `名-${id}`, `描述-${id}`));
		}
		reg.registerAll(defs);
		const indexed = reg.listIndexed(makeCtx());
		const result = matchFilter("", indexed);
		assert.equal(result.length, indexed.length);
		for (let k = 0; k < result.length; k++) {
			assert.equal(result[k]?.definition.id, indexed[k]?.definition.id);
		}
	}
});

// ---------------------------------------------------------------------------
// Property 2.b：id 前缀优先于 name 前缀优先于子串
// ---------------------------------------------------------------------------

test("property 2.b: id 前缀 > name 前缀 > 子串；同分保持稳定序", () => {
	const rng = createRng(SEED ^ 0x02);
	for (let i = 0; i < ITER; i++) {
		const reg = new CommandRegistry();
		// 造三条命中不同层级的命令
		const id = "mo" + randomId(rng, 3); // id 前缀命中 "mo"
		const name = "mo" + randomId(rng, 3); // name 前缀命中 "mo"
		const subId = "abc" + randomId(rng, 3);
		const subName = "xxmoyyy";
		reg.registerAll([
			makeDef(id, "无关", "无关描述"),
			makeDef(subId, name, "无关"),
			// 子串命中：name 与 id 都不以 mo 开头，但 name 里含 mo
			makeDef(randomId(rng, 4) + "z", subName, "子串命中描述"),
		]);
		const indexed = reg.listIndexed(makeCtx());
		const result = matchFilter("mo", indexed);
		assert.ok(result.length >= 3);
		// 第 1 个必须是 id 前缀命中项
		assert.equal(result[0]?.definition.id, id);
		// score 单调递减
		for (let k = 1; k < result.length; k++) {
			assert.ok((result[k - 1]?.score ?? 0) >= (result[k]?.score ?? 0));
		}
	}
});

// ---------------------------------------------------------------------------
// Property 2.c：大小写不敏感（case-insensitive）
// ---------------------------------------------------------------------------

test("property 2.c: 大写/小写不改变命中集合", () => {
	const rng = createRng(SEED ^ 0x03);
	for (let i = 0; i < ITER; i++) {
		const reg = new CommandRegistry();
		const size = 2 + Math.floor(rng() * 6);
		const defs: SlashCommandDefinition[] = [];
		const seen = new Set<string>();
		while (defs.length < size) {
			const id = randomId(rng);
			if (seen.has(id)) continue;
			seen.add(id);
			defs.push(makeDef(id, `名-${id}`, `描述-${id}`));
		}
		reg.registerAll(defs);
		const indexed = reg.listIndexed(makeCtx());
		const q = randomId(rng, 2);
		const lower = matchFilter(q.toLowerCase(), indexed).map(
			(r) => r.definition.id,
		);
		const upper = matchFilter(q.toUpperCase(), indexed).map(
			(r) => r.definition.id,
		);
		assert.deepEqual(upper, lower);
	}
});
