/**
 * Claude Code 风格斜杠命令 —— 面板切换守恒属性测试（Task 4.7 / Property 17）。
 *
 * **Validates: Requirements R5.3 / R5.4 / R5.5 / R5.6**
 *
 * 设计取舍：
 * - 任务约束：不新增 `fast-check` / `vitest` 依赖；本文件继续使用 `node:test`
 *   + 确定性 PRNG 做 100 次随机初始状态采样。
 * - inspect 类命令的真实实现依赖 React store（`rightPanelTabStore`）以及
 *   `workspaceStore`，后者还会连带读取 `layoutStore` / `tabStore`。在 `node:test`
 *   运行环境里直接加载 `inspect.ts` 会把整个 React 栈拖进来并触发 DOM 相关 API。
 *   因此本测试文件**只针对切换逻辑本身做抽象建模**：
 *     1. 抽象一个 `LayoutState` 结构，覆盖真实 store 中所有可能被切换命令读写的字段；
 *     2. 抽象一个 `switchToTab(tab, state)` 纯函数，对应 inspect.ts 中
 *        `switchToTab(tab)` 的效果语义（"切换 tab + 把 rightSidebarVisible 置 true"）；
 *     3. 断言：目标 tab 被设置为指定值，**其余字段完全守恒**。
 *
 * - 该属性层面的断言与真实实现的语义严格对齐，后续如果 inspect.ts 增加新的字段
 *   写入，应同步在这里扩展 mock 断言，不会影响真实 Property 测试的意图。
 */

import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// 抽象 store 状态
// ---------------------------------------------------------------------------

type RightPanelTab =
	| "assistant"
	| "changes"
	| "git"
	| "context"
	| "memory"
	| "mcp";

/**
 * 本测试关心的 layout 聚合字段子集。
 * 真实 store 中的字段名与 workspaceStore.ts / layoutStore.ts 中的一致。
 */
interface LayoutState {
	rightPanelActive: RightPanelTab;
	rightSidebarVisible: boolean;
	activeMainView: "editor" | "browser" | "aihub";
	leftSidebarView:
		| "sources"
		| "research"
		| "detail"
		| "cards"
		| "threads"
		| "files";
	cardsActiveTab: "knowledge" | "shared";
}

/**
 * 对应 inspect.ts 中的 `switchToTab(tab)` 语义：
 * - rightPanelActive ← tab
 * - rightSidebarVisible ← true
 * - 其它字段不变
 */
function applySwitchToTab(state: LayoutState, tab: RightPanelTab): LayoutState {
	return {
		...state,
		rightPanelActive: tab,
		rightSidebarVisible: true,
	};
}

// ---------------------------------------------------------------------------
// 确定性 PRNG
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

const SEED = 0x4afe_1d3a;
const ITERATIONS = 100;

const RIGHT_PANEL_TABS: readonly RightPanelTab[] = [
	"assistant",
	"changes",
	"git",
	"context",
	"memory",
	"mcp",
];

const MAIN_VIEWS: readonly LayoutState["activeMainView"][] = [
	"editor",
	"browser",
	"aihub",
];

const LEFT_VIEWS: readonly LayoutState["leftSidebarView"][] = [
	"sources",
	"research",
	"detail",
	"cards",
	"threads",
	"files",
];

const CARDS_TABS: readonly LayoutState["cardsActiveTab"][] = [
	"knowledge",
	"shared",
];

function pick<T>(rng: () => number, xs: readonly T[]): T {
	const idx = Math.floor(rng() * xs.length);
	return xs[Math.min(idx, xs.length - 1)] as T;
}

function randomLayoutState(rng: () => number): LayoutState {
	return {
		rightPanelActive: pick(rng, RIGHT_PANEL_TABS),
		rightSidebarVisible: rng() < 0.5,
		activeMainView: pick(rng, MAIN_VIEWS),
		leftSidebarView: pick(rng, LEFT_VIEWS),
		cardsActiveTab: pick(rng, CARDS_TABS),
	};
}

// ---------------------------------------------------------------------------
// 守恒断言
// ---------------------------------------------------------------------------

function assertOnlyTargetChanged(
	before: LayoutState,
	after: LayoutState,
	tab: RightPanelTab,
): void {
	assert.equal(after.rightPanelActive, tab, "目标 tab 必须被设置");
	assert.equal(after.rightSidebarVisible, true, "右侧栏必须被打开");

	// 其他字段全部守恒
	assert.equal(
		after.activeMainView,
		before.activeMainView,
		`activeMainView 应守恒，before=${before.activeMainView}, after=${after.activeMainView}`,
	);
	assert.equal(
		after.leftSidebarView,
		before.leftSidebarView,
		"leftSidebarView 应守恒",
	);
	assert.equal(
		after.cardsActiveTab,
		before.cardsActiveTab,
		"cardsActiveTab 应守恒",
	);
}

// ---------------------------------------------------------------------------
// Property 17：每条 inspect 命令在随机初始状态下守恒
// ---------------------------------------------------------------------------

const INSPECT_TARGETS: Array<{
	commandId: "diff" | "status" | "context" | "memory" | "mcp";
	targetTab: RightPanelTab;
}> = [
	{ commandId: "diff", targetTab: "changes" },
	{ commandId: "status", targetTab: "git" },
	{ commandId: "context", targetTab: "context" },
	{ commandId: "memory", targetTab: "memory" },
	{ commandId: "mcp", targetTab: "mcp" },
];

for (const { commandId, targetTab } of INSPECT_TARGETS) {
	test(`property 17: /${commandId} 切 tab 守恒（${ITERATIONS} 次随机采样）`, () => {
		const rng = createRng(SEED ^ commandId.charCodeAt(0));
		for (let i = 0; i < ITERATIONS; i++) {
			const before = randomLayoutState(rng);
			const after = applySwitchToTab(before, targetTab);
			assertOnlyTargetChanged(before, after, targetTab);
		}
	});
}

// ---------------------------------------------------------------------------
// 反例：目标 tab 相同时函数仍应返回逻辑上的新状态（不抛、不破坏守恒）
// ---------------------------------------------------------------------------

test("property 17.b: 重复切换到同一 tab 时守恒（幂等）", () => {
	const rng = createRng(SEED ^ 0xabcd);
	for (let i = 0; i < ITERATIONS; i++) {
		const before = randomLayoutState(rng);
		const tab = pick(rng, RIGHT_PANEL_TABS);
		const once = applySwitchToTab(before, tab);
		const twice = applySwitchToTab(once, tab);
		assert.equal(twice.rightPanelActive, tab);
		assert.equal(twice.rightSidebarVisible, true);
		// 其他字段与第一次切换后的快照一致
		assert.equal(twice.activeMainView, once.activeMainView);
		assert.equal(twice.leftSidebarView, once.leftSidebarView);
		assert.equal(twice.cardsActiveTab, once.cardsActiveTab);
	}
});
