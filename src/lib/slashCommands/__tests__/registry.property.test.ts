/**
 * Claude Code 风格斜杠命令 —— Registry 属性测试（Task 1.3 / Property 1）。
 *
 * **Validates: Requirements R2.2, R11.3, R14.7**
 *
 * 设计取舍：
 * - 项目目前未引入 `fast-check` / `vitest`（详见 `package.json` 与 tasks.md 对本任务的注解），
 *   任务硬性要求在本任务范围内不新增依赖。
 *   因此本文件使用 Node.js 内建 `node:test` + 确定性伪随机发生器（seeded PRNG）
 *   做 100 次随机输入采样，模拟 PBT 的"任意输入下性质守恒"语义。
 * - 断言使用 `node:assert/strict`，严格模式。
 * - 所有测试共享一套 **最小可运行** 的 `CommandContext`，避免触及 store / IPC 等
 *   外部依赖；本测试只关心 Registry 行为，不负责 UI 或执行器。
 *
 * 覆盖的 Property（来自 `design.md` Property 1）：
 * 1. 唯一性：任意命令序列中含重复 id → `registerAll` 抛错且状态守恒（回滚）；
 * 2. 回滚：批次中部抛错 → 注册表状态 === 批次前；
 * 3. `replaceCustom` 与内置冲突 → 保留内置；
 * 4. 幂等：同一 `unregister` 多次调用 no-op 且不抛错。
 *
 * 运行方式：`tsx --test src/lib/slashCommands/__tests__/registry.property.test.ts`
 */

import assert from "node:assert/strict";
import test from "node:test";

import { CommandRegistry, type CommandIndex } from "../registry";
import { SlashCommandConflictError } from "../types";
import type {
	CommandContext,
	CommandGroupId,
	SlashCommandDefinition,
	SlashCommandsSettingsSnapshot,
} from "../types";

// ---------------------------------------------------------------------------
// 确定性伪随机数（避免不同运行产生不同结果；任务硬性要求固定种子）
// ---------------------------------------------------------------------------

/**
 * mulberry32：单参数、32 位状态的快速 PRNG，输出 `[0, 1)`。
 * 选择它是因为它 **完全确定**，可复现，零依赖。
 */
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

/** 固定种子：任何一次失败都能被精确回放。 */
const SEED = 0x5afe_1d3a;

/** 每个 property 的采样次数；与设计文档"最小 100 迭代"对齐。 */
const ITERATIONS = 100;

// ---------------------------------------------------------------------------
// 生成器：命令定义 / 分组 / id 等
// ---------------------------------------------------------------------------

const GROUPS: readonly CommandGroupId[] = [
	"session",
	"runtime",
	"inspect",
	"workspace",
	"custom",
];

function pick<T>(rng: () => number, xs: readonly T[]): T {
	// 非空断言由调用方保证 xs.length >= 1
	const idx = Math.floor(rng() * xs.length);
	return xs[Math.min(idx, xs.length - 1)] as T;
}

function randomIdentifier(rng: () => number): string {
	// 只生成 ASCII 小写 + 数字，长度 1~8；足够覆盖唯一性与冲突场景。
	const len = 1 + Math.floor(rng() * 8);
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
	let out = "";
	for (let i = 0; i < len; i++) {
		const k = Math.floor(rng() * alphabet.length);
		out += alphabet[k];
	}
	return out;
}

/** 构造一个通过最小可用性校验的定义；`availability` 直接返回 `available`。 */
function makeDef(
	id: string,
	group: CommandGroupId = "session",
): SlashCommandDefinition {
	return {
		id,
		name: `命令-${id}`,
		description: `用于测试的命令 ${id}`,
		group,
		kind: "action",
		availability: () => ({ state: "available" }),
	};
}

/**
 * 生成一条随机命令序列，可能包含重复 id。
 * - `size ∈ [2, 10]`：太小难以触发重复，太大会拖慢测试。
 * - `duplicateBias ∈ [0, 1]`：较大时大概率复用已生成 id。
 */
function genDefSeq(
	rng: () => number,
	duplicateBias: number,
): SlashCommandDefinition[] {
	const size = 2 + Math.floor(rng() * 9);
	const result: SlashCommandDefinition[] = [];
	const seenIds: string[] = [];
	for (let i = 0; i < size; i++) {
		let id: string;
		if (seenIds.length > 0 && rng() < duplicateBias) {
			// 复用已有 id，刻意制造冲突
			id = pick(rng, seenIds);
		} else {
			id = randomIdentifier(rng);
			seenIds.push(id);
		}
		result.push(makeDef(id, pick(rng, GROUPS)));
	}
	return result;
}

// ---------------------------------------------------------------------------
// 最小 `CommandContext` 构造器（用于 list 路径；本文件其实不直接调 list，
// 仅在 replaceCustom 场景用 byId 校验即可，因此不暴露复杂 ctx）
// ---------------------------------------------------------------------------

function makeSettings(): SlashCommandsSettingsSnapshot {
	return {
		enabled: true,
		visibility: {},
		defaultColorThemeId: "default",
		customScanEnabled: true,
	};
}

function makeCtx(): CommandContext {
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
		settings: makeSettings(),
		invokeSelectModel: () => {
			/* no-op for tests */
		},
	};
}

/**
 * Registry 当前状态的结构化快照，便于两次状态做精确比较。
 * 只取对外可观察字段，不依赖 `__resetForTests` 之外的内部态。
 */
interface RegistrySnapshot {
	readonly ids: readonly string[];
	readonly sortedVisibleIds: readonly string[];
}

function snapshot(reg: CommandRegistry): RegistrySnapshot {
	const ctx = makeCtx();
	const listed = reg.list(ctx);
	return {
		// byId 无法枚举所有 id，但 list(ctx) 在最小 ctx 下会返回所有 `available`
		// 定义；我们在生成器中保证每个 def 的 availability 均为 `available`，因此
		// `listed` 等价于当前已注册定义全集。
		ids: listed.map((d) => d.id),
		sortedVisibleIds: [...listed.map((d) => d.id)].sort(),
	};
}

function snapshotEquals(a: RegistrySnapshot, b: RegistrySnapshot): boolean {
	if (a.ids.length !== b.ids.length) return false;
	for (let i = 0; i < a.ids.length; i++) {
		if (a.ids[i] !== b.ids[i]) return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// Property 1.a：唯一性 —— `registerAll` 遇到重复 id 必抛错
// ---------------------------------------------------------------------------

test("property 1.a: registerAll 对含重复 id 的批次必然抛出 SlashCommandConflictError", () => {
	const rng = createRng(SEED ^ 0x01);
	let checked = 0;
	for (let i = 0; i < ITERATIONS; i++) {
		// 有意偏向重复以让几乎每个样本都能触发；剩余由断言保证：
		// 若本轮样本无重复 id，则跳过（不计入 checked 统计）。
		const defs = genDefSeq(rng, 0.6);

		const idSet = new Set<string>();
		let hasDup = false;
		for (const d of defs) {
			if (idSet.has(d.id)) {
				hasDup = true;
				break;
			}
			idSet.add(d.id);
		}
		if (!hasDup) continue;

		const reg = new CommandRegistry();
		assert.throws(
			() => reg.registerAll(defs),
			SlashCommandConflictError,
			`含重复 id 的批次应抛出 SlashCommandConflictError (iter ${i})`,
		);
		checked += 1;
	}
	// 至少有一部分样本命中"含重复 id"分支，否则说明生成器有问题。
	assert.ok(
		checked > ITERATIONS / 5,
		`含重复 id 的样本过少：${checked} / ${ITERATIONS}`,
	);
});

// ---------------------------------------------------------------------------
// Property 1.b：回滚 —— 批次中部抛错后，注册表状态恢复到批次前
// ---------------------------------------------------------------------------

test("property 1.b: registerAll 失败时注册表状态与批次前完全一致（原子回滚）", () => {
	const rng = createRng(SEED ^ 0x02);
	let rolledBack = 0;
	for (let i = 0; i < ITERATIONS; i++) {
		const reg = new CommandRegistry();

		// 预先注册一批确定性的基础命令，作为"批次前"的参照状态。
		const baseSize = 1 + Math.floor(rng() * 4);
		const baseDefs: SlashCommandDefinition[] = [];
		const baseIds = new Set<string>();
		while (baseDefs.length < baseSize) {
			const id = randomIdentifier(rng);
			if (baseIds.has(id)) continue;
			baseIds.add(id);
			baseDefs.push(makeDef(id, pick(rng, GROUPS)));
		}
		reg.registerAll(baseDefs);
		const before = snapshot(reg);

		// 再构造一个"一定会抛错"的增量批次：包含一条与已存在 id 冲突的定义。
		const conflictingId = pick(rng, [...baseIds]);
		const incremental: SlashCommandDefinition[] = [
			makeDef(randomIdentifier(rng), pick(rng, GROUPS)),
			makeDef(randomIdentifier(rng), pick(rng, GROUPS)),
			makeDef(conflictingId, pick(rng, GROUPS)), // 触发冲突的条目
			makeDef(randomIdentifier(rng), pick(rng, GROUPS)),
		];

		assert.throws(
			() => reg.registerAll(incremental),
			SlashCommandConflictError,
		);

		const after = snapshot(reg);
		assert.ok(
			snapshotEquals(before, after),
			`回滚失败：before=${JSON.stringify(before.ids)} after=${JSON.stringify(after.ids)} (iter ${i})`,
		);
		rolledBack += 1;
	}
	assert.equal(rolledBack, ITERATIONS);
});

// ---------------------------------------------------------------------------
// Property 1.c：replaceCustom 与内置冲突 → 保留内置
// ---------------------------------------------------------------------------

test("property 1.c: replaceCustom 尝试覆盖内置 id 时保留内置，不抛错", () => {
	const rng = createRng(SEED ^ 0x03);
	for (let i = 0; i < ITERATIONS; i++) {
		const reg = new CommandRegistry();

		// 1) 注入一组内置命令（group != "custom"）。
		const builtinGroups: CommandGroupId[] = [
			"session",
			"runtime",
			"inspect",
			"workspace",
		];
		const builtinSize = 1 + Math.floor(rng() * 4);
		const builtins: SlashCommandDefinition[] = [];
		const builtinIds = new Set<string>();
		while (builtins.length < builtinSize) {
			const id = randomIdentifier(rng);
			if (builtinIds.has(id)) continue;
			builtinIds.add(id);
			builtins.push(makeDef(id, pick(rng, builtinGroups)));
		}
		reg.registerAll(builtins);
		const beforeBuiltinDef = reg.byId([...builtinIds][0] as string);
		assert.ok(beforeBuiltinDef !== null);

		// 2) 构造一组 custom 命令，其中至少一条与内置 id 冲突。
		const collidingId = pick(rng, [...builtinIds]);
		const customDefs: SlashCommandDefinition[] = [
			// 良性 custom
			makeDef(randomIdentifier(rng), "custom"),
			// 与内置同 id 的冲突项；必须被静默拒绝
			makeDef(collidingId, "custom"),
			makeDef(randomIdentifier(rng), "custom"),
		];

		// 静默 console.warn 以免污染测试输出，同时验证不抛错
		const originalWarn = console.warn;
		console.warn = () => {
			/* silenced in test */
		};
		try {
			reg.replaceCustom(customDefs);
		} finally {
			console.warn = originalWarn;
		}

		// 3) 验证：
		//    a) 内置命令依然存在且 group 未被覆盖为 "custom"；
		//    b) 被冲突拦截的 custom 条目不会注入；
		//    c) 其余不冲突的 custom 条目都成功进入注册表。
		const afterBuiltinDef = reg.byId(collidingId);
		assert.ok(afterBuiltinDef !== null, "内置命令不应被删除");
		assert.notEqual(
			afterBuiltinDef.group,
			"custom",
			"内置命令的 group 不应被 replaceCustom 覆盖",
		);

		for (const d of customDefs) {
			const got = reg.byId(d.id);
			if (d.id === collidingId) {
				// 冲突条目不应成为 custom
				assert.notEqual(got?.group, "custom");
			} else if (customDefs.filter((x) => x.id === d.id).length === 1) {
				// 不冲突且批内唯一的 custom 条目必须进入注册表
				assert.ok(got !== null, `期望 custom id "${d.id}" 被注册`);
				assert.equal(got.group, "custom");
			}
		}

		// 迭代结束：内置集合依旧完整
		for (const bid of builtinIds) {
			assert.ok(
				reg.byId(bid) !== null,
				`内置 id "${bid}" 在 replaceCustom 后消失了 (iter ${i})`,
			);
		}
	}
});

// ---------------------------------------------------------------------------
// Property 1.d：unregister 幂等（多次调用不抛错、不误删新条目）
// ---------------------------------------------------------------------------

test("property 1.d: unregister 多次调用 no-op；若同 id 被重新注册也不会误删新条目", () => {
	const rng = createRng(SEED ^ 0x04);
	for (let i = 0; i < ITERATIONS; i++) {
		const reg = new CommandRegistry();
		const id = randomIdentifier(rng);
		const firstDef = makeDef(id, pick(rng, GROUPS));
		const unregister = reg.register(firstDef);

		// 1) 多次调用幂等，且不抛错
		const times = 1 + Math.floor(rng() * 5);
		for (let t = 0; t < times; t++) {
			assert.doesNotThrow(() => unregister());
		}
		assert.equal(reg.byId(id), null, `首轮 unregister 后应不存在 id=${id}`);

		// 2) 同 id 重新注册后，旧 handle 不应误删新条目
		const secondDef = makeDef(id, pick(rng, GROUPS));
		reg.register(secondDef);
		// 再次调用旧 handle —— 按实现它已被标记 inactive，应直接 no-op
		assert.doesNotThrow(() => unregister());
		const current = reg.byId(id);
		assert.ok(current !== null, "旧 handle 不应把新注册的同 id 条目误删");
		assert.equal(current, secondDef);
	}
});

// ---------------------------------------------------------------------------
// Property 1.e：预计算索引被冻结，且与 definition 字段小写严格一致
// （来自 Task 1.3 的"在注册时冻结 lowerId/lowerName/lowerDesc"要求）
// ---------------------------------------------------------------------------

test("property 1.e: listIndexed 返回的 CommandIndex 与 definition 字段小写一致，且被 Object.freeze", () => {
	const rng = createRng(SEED ^ 0x05);
	for (let i = 0; i < ITERATIONS; i++) {
		const reg = new CommandRegistry();
		const size = 1 + Math.floor(rng() * 6);
		const defs: SlashCommandDefinition[] = [];
		const ids = new Set<string>();
		while (defs.length < size) {
			const id = randomIdentifier(rng);
			if (ids.has(id)) continue;
			ids.add(id);
			defs.push(makeDef(id, pick(rng, GROUPS)));
		}
		reg.registerAll(defs);

		const ctx = makeCtx();
		const indexed = reg.listIndexed(ctx);
		assert.equal(indexed.length, defs.length);

		for (const entry of indexed) {
			const { definition, index } = entry;
			// 小写一致性
			assert.equal(index.lowerId, definition.id.toLowerCase());
			assert.equal(index.lowerName, definition.name.toLowerCase());
			assert.equal(index.lowerDesc, definition.description.toLowerCase());

			// 冻结不可变
			assert.ok(
				Object.isFrozen(index),
				`CommandIndex 必须被 Object.freeze (id=${definition.id})`,
			);

			// 尝试写入：严格模式下会抛 TypeError；非严格下应为 no-op。
			// 这里不依赖严格模式，仅断言赋值后仍然保持原值，以确认冻结生效。
			const before: CommandIndex = {
				lowerId: index.lowerId,
				lowerName: index.lowerName,
				lowerDesc: index.lowerDesc,
			};
			try {
				(index as unknown as { lowerId: string }).lowerId = "__mutated__";
			} catch {
				// 严格模式下赋值抛错即为"冻结生效"，吞掉异常即可
			}
			assert.equal(index.lowerId, before.lowerId);
			assert.equal(index.lowerName, before.lowerName);
			assert.equal(index.lowerDesc, before.lowerDesc);
		}

		// list(ctx) 与 listIndexed(ctx) 顺序必须完全一致（回归保护）
		const bare = reg.list(ctx);
		assert.equal(bare.length, indexed.length);
		for (let k = 0; k < bare.length; k++) {
			assert.equal(bare[k]?.id, indexed[k]?.definition.id);
		}
	}
});
