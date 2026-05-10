/**
 * Claude Code 风格斜杠命令 —— 可见性属性测试（Property 6）。
 *
 * **Validates: Requirements R7.3, R10.3, R14.6**
 *
 * 断言：settings.visibility 中标记为 "hide" 的命令，无论过滤词为何，
 * 都不会出现在 `list(ctx)` 与 `matchFilter(q, listIndexed(ctx))` 的结果里。
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
const SEED = 0x1234_abcd;
const ITER = 100;
const GROUPS: readonly CommandGroupId[] = [
	"session",
	"runtime",
	"inspect",
	"workspace",
];
const pick = <T,>(rng: () => number, xs: readonly T[]): T =>
	xs[Math.min(Math.floor(rng() * xs.length), xs.length - 1)] as T;
const rid = (rng: () => number, n = 5): string => {
	const abc = "abcdefghijklmnopqrstuvwxyz";
	let s = "";
	for (let i = 0; i < n; i++) s += abc[Math.floor(rng() * abc.length)];
	return s;
};

function makeDef(id: string, g: CommandGroupId): SlashCommandDefinition {
	return {
		id,
		name: `名-${id}`,
		description: `描述-${id}`,
		group: g,
		kind: "action",
		availability: () => ({ state: "available" }),
	};
}

function baseSettings(): SlashCommandsSettingsSnapshot {
	return {
		enabled: true,
		visibility: {},
		defaultColorThemeId: "default",
		customScanEnabled: true,
	};
}

function makeCtx(visibility: Record<string, "show" | "hide">): CommandContext {
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
		settings: { ...baseSettings(), visibility },
		invokeSelectModel: () => undefined,
	};
}

test("property 6: hidden 命令对任意 filter 都不出现", () => {
	const rng = createRng(SEED);
	for (let i = 0; i < ITER; i++) {
		const reg = new CommandRegistry();
		const size = 3 + Math.floor(rng() * 8);
		const defs: SlashCommandDefinition[] = [];
		const seen = new Set<string>();
		while (defs.length < size) {
			const id = rid(rng);
			if (seen.has(id)) continue;
			seen.add(id);
			defs.push(makeDef(id, pick(rng, GROUPS)));
		}
		reg.registerAll(defs);

		// 随机隐藏一半
		const hidden: Record<string, "show" | "hide"> = {};
		const hiddenSet = new Set<string>();
		for (const d of defs) {
			if (rng() < 0.5) {
				hidden[d.id] = "hide";
				hiddenSet.add(d.id);
			}
		}

		const ctx = makeCtx(hidden);
		const listed = reg.list(ctx);
		for (const d of listed) {
			assert.ok(!hiddenSet.has(d.id), `hidden ${d.id} 出现在 list 中`);
		}
		// 数量等式
		assert.equal(listed.length, defs.length - hiddenSet.size);

		// 对任意 filter 都不命中
		const indexed = reg.listIndexed(ctx);
		for (const q of ["", "a", "abc", "xyz"]) {
			const matched = matchFilter(q, indexed);
			for (const m of matched) {
				assert.ok(!hiddenSet.has(m.definition.id));
			}
		}
	}
});
