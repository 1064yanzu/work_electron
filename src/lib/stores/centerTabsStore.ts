/**
 * centerTabsStore —— 中间栏「可分屏编辑器组」总控（仿 VSCode 的 editor groups）。
 *
 * ## 从「一条标签条」到「一棵组树」
 *
 * 上一版只有一条标签条、同一时刻只显示一个标签。但这个中栏承载的是 Web AI 站点、
 * 本机 coding agent、运行图、预览——用户真正想要的是**同屏对照**：左边 ChatGPT、
 * 右边 Gemini、下面跑着 Claude Code。轮换标签把一块大屏用成了一块小屏。
 *
 * 现在的模型：
 *
 * ```
 * layout（树）          groups（每个叶子一组，各自有自己的标签与激活项）
 *   split(horizontal)
 *     ├ leaf g1  ──→   { tabIds: ["web:chatgpt"],  activeTabId: "web:chatgpt" }
 *     └ split(vertical)
 *         ├ leaf g2 ─→ { tabIds: ["web:gemini"],   activeTabId: "web:gemini" }
 *         └ leaf g3 ─→ { tabIds: ["cli:1","graph"], activeTabId: "cli:1" }
 * ```
 *
 * 标签本身存在扁平的 `tabsById` 里，组只持有 id。这样「把标签移到另一组」是一次
 * id 搬运，不需要搬运标签状态（尤其 CLI 标签背后挂着 pty，复制一份状态就等于
 * 丢掉一个真实进程的归属）。
 *
 * ## 拆分时保持树扁平
 *
 * 往同方向再拆一次时，插到**父级 split 的兄弟位**而不是嵌套一层新的 split
 * （与 VSCode 一致）。否则连拆三次就会得到三层嵌套，拖动分隔条的手感与
 * 尺寸分配都会变得难以预期。
 *
 * ## 状态权威（与上一版相同）
 *
 * 本 store 不是新的真相来源，是既有两个状态源的投影 + 门面：
 * - `layoutStore.activeMainView` 决定中栏渲染哪个组件族；
 * - `managedModeStore.ui.centerView` 决定沙盒工作区内部是运行图还是预览。
 * 两个方向都要同步，用 `applying` 重入锁避免绕回来打自己。
 * 分屏后这两个外部 store 跟随**活动组的激活标签**。
 */

import { detectHarnesses, listAiHubSites } from "../api/harnessHub";
import type { AiHubSiteRow, HarnessDetectionRow } from "../api/harnessHub";
import { getCenterUxPrefs } from "../config/centerUx";
import { managedModeStore } from "../managedModeStore";
import {
	collectGroupIds,
	pruneLayout,
	splitAt,
	type LayoutNode,
	type SplitDirection,
} from "./centerLayoutTree";
import type { LayoutState } from "./types";
import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";
import { layoutStore } from "./layoutStore";
import { terminalStore } from "./terminalStore";

/** Web AI 站点标签的 id 前缀：`web:<siteId>` */
export const WEB_TAB_PREFIX = "web:";
/** 本地 CLI 标签的 id 前缀：`cli:<n>` */
export const CLI_TAB_PREFIX = "cli:";

export type CenterTabKind =
	| "graph"
	| "preview"
	| "browser"
	| "hub"
	| "web"
	| "cli";

export interface CenterTab {
	/** 全局唯一；单例标签 id === kind，Web 为 `web:<siteId>`，CLI 为 `cli:<n>` */
	id: string;
	kind: CenterTabKind;
	/** 仅 kind === "web" */
	siteId?: string;
	/** 仅 kind === "cli"：harness id（claude-code / codex / …） */
	harness?: string;
	/** 仅 kind === "cli"：展示名（"Claude Code"） */
	label?: string;
	/** 仅 kind === "cli"：对应的 pty/terminal id；创建是异步的，就绪前为空 */
	terminalId?: string;
}

/** 一个编辑器组：一条标签条 + 一块内容区。 */
export interface TabGroup {
	id: string;
	tabIds: string[];
	/** 空串表示该组没有标签（此时组本身会被回收，不会长期停留在这个状态） */
	activeTabId: string;
}

interface CenterTabsState {
	/** 全部标签，按 id 索引 */
	tabsById: Record<string, CenterTab>;
	/** 全部编辑器组 */
	groups: Record<string, TabGroup>;
	/** 布局树 */
	layout: LayoutNode;
	/** 当前活动组（新标签开在这里；快捷键作用于它） */
	activeGroupId: string;
	/**
	 * 正在被拖拽的标签 id。
	 *
	 * 内容区四条边的分屏落点只在拖拽期间存在——常驻的话会盖住内容区（尤其是
	 * 内嵌网页视图上方的交互区）。落点组件在别的子树里，靠 DataTransfer 传不到，
	 * 所以把"正在拖"这件事放进 store。
	 */
	draggingTabId: string | null;
	/** 已启用的 Web AI 站点：标签标题与「+」菜单都读它 */
	webSites: AiHubSiteRow[];
	/** 本机探测到的 AI CLI：「+」菜单读它 */
	clis: HarnessDetectionRow[];
}

// ============================================================
// 工具
// ============================================================

let groupSeq = 0;
function newGroupId(): string {
	return `g${++groupSeq}`;
}

/** 首次启动（或没有可恢复记录时）的默认标签。 */
function defaultTabs(): CenterTab[] {
	return [
		{ id: "graph", kind: "graph" },
		{ id: "preview", kind: "preview" },
	];
}

function initialState(): CenterTabsState {
	const groupId = newGroupId();
	const tabs = defaultTabs();
	return {
		tabsById: Object.fromEntries(tabs.map((t) => [t.id, t])),
		groups: {
			[groupId]: {
				id: groupId,
				tabIds: tabs.map((t) => t.id),
				activeTabId: currentSandboxTabId(),
			},
		},
		layout: { type: "leaf", groupId },
		activeGroupId: groupId,
		draggingTabId: null,
		webSites: [],
		clis: [],
	};
}

const OPEN_TABS_STORAGE_KEY = "centerTabs:layout";
/** 上一版（单标签条）的持久化 key，用于一次性迁移。 */
const LEGACY_TABS_KEY = "centerTabs:openTabs";
const LEGACY_ACTIVE_KEY = "centerTabs:activeTab";
const LAST_WEB_SITE_STORAGE_KEY = "aihub:last-site-id";

/** 持久化条目：只存「开了哪些标签、怎么排布」，不存内容状态。 */
interface PersistedTab {
	id: string;
	kind: CenterTabKind;
	siteId?: string;
}
interface PersistedLayout {
	version: 2;
	tabs: PersistedTab[];
	groups: { id: string; tabIds: string[]; activeTabId: string }[];
	layout: LayoutNode;
	activeGroupId: string;
}

export function webTabId(siteId: string): string {
	return `${WEB_TAB_PREFIX}${siteId}`;
}

export function siteIdFromTabId(tabId: string): string | null {
	return tabId.startsWith(WEB_TAB_PREFIX)
		? tabId.slice(WEB_TAB_PREFIX.length)
		: null;
}

export function isCliTabId(tabId: string): boolean {
	return tabId.startsWith(CLI_TAB_PREFIX);
}

/**
 * 标签 → 它需要的 `layoutStore.activeMainView`。
 *
 * CLI 标签、Hub 与空态都落在 `editor`：它们是中栏"标签时代"才有的形态，旧的
 * activeMainView 枚举里没有对应项，落在默认值上最安全（不会让任何既有消费者
 * 读到看不懂的值）。中栏究竟渲染什么由布局树说了算。
 */
function mainViewForTab(tabId: string): LayoutState["activeMainView"] {
	if (tabId === "browser") return "browser";
	if (tabId.startsWith(WEB_TAB_PREFIX)) return "aihub";
	return "editor";
}

function currentSandboxTabId(): "graph" | "preview" {
	return managedModeStore.getState().ui.centerView === "preview"
		? "preview"
		: "graph";
}

// ============================================================
// 持久化
// ============================================================

function readPersisted(): PersistedLayout | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(OPEN_TABS_STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as PersistedLayout;
			if (parsed?.version === 2 && Array.isArray(parsed.groups)) return parsed;
			return null;
		}
		// 迁移：上一版是「一个扁平数组 + 一个 activeTabId」，折成单组布局
		const legacyRaw = window.localStorage.getItem(LEGACY_TABS_KEY);
		if (legacyRaw === null) return null;
		const legacyTabs: unknown = JSON.parse(legacyRaw);
		if (!Array.isArray(legacyTabs)) return null;
		const tabs = legacyTabs.filter(
			(item): item is PersistedTab =>
				typeof item === "object" &&
				item !== null &&
				typeof (item as PersistedTab).id === "string" &&
				typeof (item as PersistedTab).kind === "string",
		);
		const active = window.localStorage.getItem(LEGACY_ACTIVE_KEY) ?? "";
		const groupId = "g-migrated";
		return {
			version: 2,
			tabs,
			groups: [
				{
					id: groupId,
					tabIds: tabs.map((t) => t.id),
					activeTabId: active || (tabs[0]?.id ?? ""),
				},
			],
			layout: { type: "leaf", groupId },
			activeGroupId: groupId,
		};
	} catch {
		return null;
	}
}

/**
 * 存布局。
 *
 * CLI 标签不存：它背后是一个真实的 pty 进程，下次启动早就没了，恢复出来只会是
 * 一个点不动的空壳。剔除后可能出现空组，一并从树里摘掉。
 */
function persistNow(): void {
	if (typeof window === "undefined") return;
	const state = store.getState();
	try {
		const keptTabs = Object.values(state.tabsById).filter(
			(t) => t.kind !== "cli",
		);
		const keptIds = new Set(keptTabs.map((t) => t.id));

		const groups = Object.values(state.groups)
			.map((g) => ({
				id: g.id,
				tabIds: g.tabIds.filter((id) => keptIds.has(id)),
				activeTabId: keptIds.has(g.activeTabId) ? g.activeTabId : "",
			}))
			.filter((g) => g.tabIds.length > 0);
		const liveGroupIds = new Set(groups.map((g) => g.id));
		const layout = pruneLayout(state.layout, liveGroupIds);

		const payload: PersistedLayout = {
			version: 2,
			tabs: keptTabs.map((t) => ({
				id: t.id,
				kind: t.kind,
				siteId: t.siteId,
			})),
			groups: groups.map((g) => ({
				...g,
				activeTabId: g.activeTabId || g.tabIds[0] || "",
			})),
			layout: layout ?? { type: "leaf", groupId: groups[0]?.id ?? "" },
			activeGroupId: liveGroupIds.has(state.activeGroupId)
				? state.activeGroupId
				: (groups[0]?.id ?? ""),
		};
		window.localStorage.setItem(OPEN_TABS_STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// 隐私模式下 localStorage 不可用，静默
	}
}

function readLastWebSiteId(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(LAST_WEB_SITE_STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeLastWebSiteId(siteId: string): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(LAST_WEB_SITE_STORAGE_KEY, siteId);
	} catch {
		// 静默
	}
}

// ============================================================
// Store
// ============================================================

const store = createStore<CenterTabsState>(initialState());

/** 取某个组；不存在时返回 null。 */
function getGroup(state: CenterTabsState, groupId: string): TabGroup | null {
	return state.groups[groupId] ?? null;
}

/** 找出某个标签属于哪个组。 */
export function groupIdOfTab(
	state: CenterTabsState,
	tabId: string,
): string | null {
	for (const group of Object.values(state.groups)) {
		if (group.tabIds.includes(tabId)) return group.id;
	}
	return null;
}

/** 活动组的激活标签 id（外部 store 镜像与快捷键都读它）。 */
export function activeTabIdOf(state: CenterTabsState): string {
	return getGroup(state, state.activeGroupId)?.activeTabId ?? "";
}

// ============================================================
// 激活
// ============================================================

/**
 * 重入锁：`syncExternalStores` 往外部 store 写的那一刻，外部 store 会同步 emit，
 * 下面两个订阅回调立刻被调用。锁住它们，避免"我改外部 → 外部回调改我"绕圈。
 */
let applying = false;

/** 把「活动组的激活标签」同步到外部 store。 */
function syncExternalStores(): void {
	const tabId = activeTabIdOf(store.getState());
	applying = true;
	try {
		if (tabId === "graph" || tabId === "preview") {
			managedModeStore.setCenterView(tabId);
		}
		const siteId = siteIdFromTabId(tabId);
		if (siteId) writeLastWebSiteId(siteId);
		// 空态也把主视图归到 editor：留着 "browser" 之类的陈旧值，会让之后
		// 「打开浏览器」的 setMainView("browser") 变成无变化、连订阅都不触发。
		layoutStore.setMainView(mainViewForTab(tabId));
	} finally {
		applying = false;
	}
	persistNow();
}

/** 激活某个组里的某个标签，并把该组设为活动组。 */
function activateTab(tabId: string, groupId?: string): void {
	store.setState((state) => {
		const gid = groupId ?? groupIdOfTab(state, tabId);
		if (!gid) return state;
		const group = state.groups[gid];
		if (!group || !group.tabIds.includes(tabId)) return state;
		if (state.activeGroupId === gid && group.activeTabId === tabId)
			return state;
		return {
			...state,
			activeGroupId: gid,
			groups: { ...state.groups, [gid]: { ...group, activeTabId: tabId } },
		};
	});
	syncExternalStores();
}

/** 把某个组设为活动组（不改它的激活标签）。 */
function focusGroup(groupId: string): void {
	store.setState((state) =>
		state.groups[groupId] && state.activeGroupId !== groupId
			? { ...state, activeGroupId: groupId }
			: state,
	);
	syncExternalStores();
}

/**
 * 确保标签存在于某个组里并激活它。
 *
 * 已经开在别的组里时**聚焦过去**而不是再开一个：同一个标签（尤其 Web AI 站点，
 * 一个站点只有一个原生视图）在两个分屏里同时存在是没有意义的，视图只能在一处。
 */
function openTab(tab: CenterTab, targetGroupId?: string): void {
	const existingGroup = groupIdOfTab(store.getState(), tab.id);
	if (existingGroup) {
		activateTab(tab.id, existingGroup);
		return;
	}

	store.setState((state) => {
		const gid =
			targetGroupId && state.groups[targetGroupId]
				? targetGroupId
				: state.activeGroupId;
		const group = state.groups[gid];
		if (!group) return state;
		return {
			...state,
			tabsById: { ...state.tabsById, [tab.id]: tab },
			groups: {
				...state.groups,
				[gid]: {
					...group,
					tabIds: [...group.tabIds, tab.id],
					activeTabId: tab.id,
				},
			},
			activeGroupId: gid,
		};
	});
	syncExternalStores();
}

/**
 * 打开（或激活）沙盒工作区的某个视图（运行图 / 预览）。
 *
 * 给「点击文件预览」这类**明确的用户动作**用：它们的
 * 意图是"我现在要看到它"，只写 `managedModeStore.setCenterView` 的话，用户
 * 若正停在别的标签上就会觉得点了没反应；标签被关掉之后更是连落脚点都没有，
 * 所以这里会把标签补开。
 *
 * 被动场景（执行期自动预览、图片自动落盘后选中）不要用这个——直接写
 * `managedModeStore`，让它安静地改沙盒内部状态，不抢走用户当前的标签。
 */
function openSandboxView(view: "graph" | "preview"): void {
	managedModeStore.setCenterView(view);
	openTab({ id: view, kind: view });
}

// ============================================================
// 打开各类标签
// ============================================================

function openBrowser(groupId?: string): void {
	openTab({ id: "browser", kind: "browser" }, groupId);
}

/** 打开「Agent 接力」主视图（跨入口时间线 + 拖拽接力 + 议会 + 共享白板）。 */
function openHub(groupId?: string): void {
	openTab({ id: "hub", kind: "hub" }, groupId);
}

let webSitesLoaded = false;

/** 拉取已启用的 Web AI 站点清单（标签标题 / 「+」菜单都要）。 */
async function ensureWebSites(forceRefresh = false): Promise<AiHubSiteRow[]> {
	if (webSitesLoaded && !forceRefresh) return store.getState().webSites;
	try {
		const rows = (await listAiHubSites()).filter((row) => row.enabled);
		webSitesLoaded = true;
		store.setState((state) => ({ ...state, webSites: rows }));
		return rows;
	} catch (error) {
		console.warn("[centerTabsStore] 读取 Web AI 站点清单失败:", error);
		return store.getState().webSites;
	}
}

/**
 * 打开（或聚焦）某个 Web AI 站点标签。
 *
 * 不传 siteId 时按「上次浏览的站点 → 第一个已启用站点」兜底；一个站点都没启用
 * 时返回 false，由调用方决定怎么提示（不凭空造一个空标签）。
 */
async function openWebSite(
	siteId?: string,
	groupId?: string,
): Promise<boolean> {
	const sites = await ensureWebSites();
	if (sites.length === 0) return false;
	const remembered = readLastWebSiteId();
	const target =
		(siteId && sites.find((s) => s.id === siteId)) ||
		(remembered && sites.find((s) => s.id === remembered)) ||
		sites[0];
	if (!target) return false;
	openTab({ id: webTabId(target.id), kind: "web", siteId: target.id }, groupId);
	return true;
}

let cliSeq = 0;

/** 探测本机 AI CLI（「+」菜单读它）。失败返回上一次的结果，不清空。 */
async function ensureClis(
	forceRefresh = false,
): Promise<HarnessDetectionRow[]> {
	const cached = store.getState().clis;
	if (cached.length > 0 && !forceRefresh) return cached;
	try {
		const rows = (await detectHarnesses()).filter((row) => row.can_inject);
		store.setState((state) => ({ ...state, clis: rows }));
		return rows;
	} catch (error) {
		console.warn("[centerTabsStore] 探测本机 AI CLI 失败:", error);
		return cached;
	}
}

/**
 * 给某个 CLI 标签起一个 pty 并把启动命令敲进去。
 *
 * 启动方式沿用 harnessHub/ptyLauncher 的做法：起一个**登录 shell**，再把命令
 * 敲进去。不直接 spawn CLI 可执行文件，因为 GUI 启动的 Electron 继承不到用户
 * shell 的 PATH / nvm / mise 等环境，直接 spawn 十有八九找不到或跑不起来。
 */
async function startCliTerminal(
	tabId: string,
	harness: HarnessDetectionRow,
): Promise<boolean> {
	const terminal = await terminalStore.createHostedTerminal({
		name: harness.label,
	});
	if (!terminal) return false;
	// 标签可能在 pty 创建期间被关掉了，这时要把刚起的进程收掉，别留孤儿
	if (!store.getState().tabsById[tabId]) {
		void terminalStore.destroyTerminal(terminal.id);
		return false;
	}
	store.setState((state) => {
		const tab = state.tabsById[tabId];
		if (!tab) return state;
		return {
			...state,
			tabsById: {
				...state.tabsById,
				[tabId]: { ...tab, terminalId: terminal.id },
			},
		};
	});
	// 用命令名而不是 bin_path 绝对路径：pty 起的是登录 shell（terminalService 在
	// 非 Windows 上带 -l），PATH / nvm / mise 都已就位，命令名一定能解析到；
	// 而绝对路径一旦含空格或引号，还要按各平台 shell 的规则分别转义，得不偿失。
	void terminalStore.write(terminal.id, `${harness.launch_command}\n`);
	return true;
}

/**
 * 在中栏开一个跑本机 coding agent 的标签页。
 *
 * 每次调用都新开一个标签（同一个 CLI 可以同时开好几个，各跑各的目录/任务）——
 * 这正是"标签页"相对"底部终端单例"的价值。
 */
async function openCli(
	harness: HarnessDetectionRow,
	groupId?: string,
): Promise<boolean> {
	const tabId = `${CLI_TAB_PREFIX}${++cliSeq}`;
	openTab(
		{ id: tabId, kind: "cli", harness: harness.harness, label: harness.label },
		groupId,
	);
	const ok = await startCliTerminal(tabId, harness);
	if (!ok) closeTab(tabId);
	return ok;
}

/** 进程退出后重开一个（标签、位置、激活态都不变）。 */
async function restartCli(tabId: string): Promise<boolean> {
	const tab = store.getState().tabsById[tabId];
	if (!tab || tab.kind !== "cli" || !tab.harness) return false;
	// 旧 pty 若还活着，先收掉再起新的
	if (tab.terminalId) {
		void terminalStore.destroyTerminal(tab.terminalId);
		store.setState((state) => {
			const current = state.tabsById[tabId];
			if (!current) return state;
			const { terminalId: _drop, ...rest } = current;
			return { ...state, tabsById: { ...state.tabsById, [tabId]: rest } };
		});
	}
	const list = await ensureClis();
	const harness = list.find((row) => row.harness === tab.harness);
	if (!harness) return false;
	return await startCliTerminal(tabId, harness);
}

// ============================================================
// 关闭
// ============================================================

/**
 * 关闭一个标签。
 *
 * 组内激活项落到**相邻标签**（右边优先，没有再取左边）；组被清空则把组也回收，
 * 布局树随之折叠。全部组都空了就进空态（保留一个空组作为落脚点）。
 */
function closeTab(tabId: string): void {
	const state = store.getState();
	const gid = groupIdOfTab(state, tabId);
	if (!gid) return;
	const tab = state.tabsById[tabId];
	const group = state.groups[gid];
	const index = group.tabIds.indexOf(tabId);
	const tabIds = group.tabIds.filter((id) => id !== tabId);

	// CLI 标签背后是真实进程：关标签就是结束它，否则会变成看不见的孤儿
	if (tab?.kind === "cli" && tab.terminalId) {
		void terminalStore.destroyTerminal(tab.terminalId);
	}

	store.setState((s) => {
		const { [tabId]: _removed, ...tabsById } = s.tabsById;

		// 组还有标签：只改组内激活项
		if (tabIds.length > 0) {
			const nextActive =
				s.groups[gid].activeTabId === tabId
					? (tabIds[index] ?? tabIds[index - 1] ?? tabIds[0])
					: s.groups[gid].activeTabId;
			return {
				...s,
				tabsById,
				groups: {
					...s.groups,
					[gid]: { ...s.groups[gid], tabIds, activeTabId: nextActive },
				},
			};
		}

		// 组空了：只剩这一个组时保留它（空态需要落脚点），否则回收
		const remaining = Object.keys(s.groups).filter((id) => id !== gid);
		if (remaining.length === 0) {
			return {
				...s,
				tabsById,
				groups: {
					...s.groups,
					[gid]: { ...s.groups[gid], tabIds: [], activeTabId: "" },
				},
			};
		}
		const { [gid]: _dropped, ...groups } = s.groups;
		const keep = new Set(Object.keys(groups));
		const layout = pruneLayout(s.layout, keep) ?? {
			type: "leaf" as const,
			groupId: remaining[0],
		};
		return {
			...s,
			tabsById,
			groups,
			layout,
			activeGroupId:
				s.activeGroupId === gid ? collectGroupIds(layout)[0] : s.activeGroupId,
		};
	});
	syncExternalStores();
}

/** 关闭当前活动组的激活标签。 */
function closeActiveTab(): void {
	const tabId = activeTabIdOf(store.getState());
	if (tabId) closeTab(tabId);
}

/** 关闭某组内除 keepId 之外的全部标签。 */
function closeOtherTabs(keepId: string): void {
	const state = store.getState();
	const gid = groupIdOfTab(state, keepId);
	if (!gid) return;
	for (const id of [...state.groups[gid].tabIds]) {
		if (id !== keepId) closeTab(id);
	}
}

/** 关闭全部标签，中栏进空态（同时把分屏合并回一个组）。 */
function closeAllTabs(): void {
	for (const id of Object.keys(store.getState().tabsById)) closeTab(id);
}

/**
 * 关闭整个分屏（连同它的全部标签）。
 *
 * 空组也要能关：`splitGroup` 会刻意造出空组（"这一屏想放什么"），
 * 用户改主意时必须有路把它收掉，否则就成了一块赶不走的空白。
 */
function closeGroup(groupId: string): void {
	const state = store.getState();
	const group = state.groups[groupId];
	if (!group) return;

	if (group.tabIds.length > 0) {
		for (const id of [...group.tabIds]) closeTab(id);
		return;
	}

	// 空组：最后一个组要留着当空态落脚点，其余直接从树上摘掉
	if (Object.keys(state.groups).length <= 1) return;
	store.setState((s) => {
		const { [groupId]: _dropped, ...groups } = s.groups;
		const keep = new Set(Object.keys(groups));
		const layout = pruneLayout(s.layout, keep);
		if (!layout) return s;
		return {
			...s,
			groups,
			layout,
			activeGroupId:
				s.activeGroupId === groupId
					? collectGroupIds(layout)[0]
					: s.activeGroupId,
		};
	});
	syncExternalStores();
}

// ============================================================
// 分屏
// ============================================================

/**
 * 把某个组按方向拆开。
 *
 * 两种落法，都**保证成功**——分屏是一个动作，不该有"条件不满足所以没反应"这种
 * 结果（第一次按 ⌘\ 的人多半正好只有一个标签，撞上拒绝就再也不会试第二次）：
 *
 * - 源组有多个标签 → 把指定标签（默认激活项）搬到新组；
 * - 源组只有一个标签 → 新组**留空**，由空态选择器告诉用户"这一屏可以放什么"。
 *   不搬走那唯一的标签，否则源组变空，等于什么也没分。
 */
function splitGroup(options: {
	groupId?: string;
	direction: SplitDirection;
	tabId?: string;
	/** 新组放在原组之前（左 / 上） */
	before?: boolean;
}): string | null {
	const state = store.getState();
	const sourceGroupId = options.groupId ?? state.activeGroupId;
	const source = state.groups[sourceGroupId];
	if (!source) return null;

	const requested = options.tabId ?? source.activeTabId;
	// 只有一个标签（或压根没有）时不搬运，开一屏空的
	const movingTabId =
		source.tabIds.length > 1 && requested && source.tabIds.includes(requested)
			? requested
			: null;

	const newId = newGroupId();
	store.setState((s) => {
		const src = s.groups[sourceGroupId];
		if (!src) return s;

		if (!movingTabId) {
			return {
				...s,
				groups: {
					...s.groups,
					[newId]: { id: newId, tabIds: [], activeTabId: "" },
				},
				layout: splitAt(
					s.layout,
					sourceGroupId,
					newId,
					options.direction,
					options.before === true,
				),
				activeGroupId: newId,
			};
		}

		const remaining = src.tabIds.filter((id) => id !== movingTabId);
		const index = src.tabIds.indexOf(movingTabId);
		return {
			...s,
			groups: {
				...s.groups,
				[sourceGroupId]: {
					...src,
					tabIds: remaining,
					activeTabId:
						src.activeTabId === movingTabId
							? (remaining[index] ?? remaining[index - 1] ?? remaining[0] ?? "")
							: src.activeTabId,
				},
				[newId]: {
					id: newId,
					tabIds: [movingTabId],
					activeTabId: movingTabId,
				},
			},
			layout: splitAt(
				s.layout,
				sourceGroupId,
				newId,
				options.direction,
				options.before === true,
			),
			activeGroupId: newId,
		};
	});
	syncExternalStores();
	return newId;
}

/**
 * 把标签移到另一个组。
 *
 * 目标组内可以指定落位索引（拖到某个标签上时用）。源组因此清空的话，
 * 组与布局节点一起回收。
 */
function moveTabToGroup(
	tabId: string,
	targetGroupId: string,
	index?: number,
): void {
	const state = store.getState();
	const sourceGroupId = groupIdOfTab(state, tabId);
	if (!sourceGroupId || !state.groups[targetGroupId]) return;
	if (sourceGroupId === targetGroupId) {
		// 同组内就是重排
		reorderInGroup(tabId, targetGroupId, index);
		return;
	}

	store.setState((s) => {
		const source = s.groups[sourceGroupId];
		const target = s.groups[targetGroupId];
		if (!source || !target) return s;

		const remaining = source.tabIds.filter((id) => id !== tabId);
		const at = index === undefined ? target.tabIds.length : index;
		const targetIds = [...target.tabIds];
		targetIds.splice(Math.max(0, Math.min(at, targetIds.length)), 0, tabId);

		const groups: Record<string, TabGroup> = {
			...s.groups,
			[targetGroupId]: {
				...target,
				tabIds: targetIds,
				activeTabId: tabId,
			},
		};

		let layout = s.layout;
		if (remaining.length > 0) {
			const srcIndex = source.tabIds.indexOf(tabId);
			groups[sourceGroupId] = {
				...source,
				tabIds: remaining,
				activeTabId:
					source.activeTabId === tabId
						? (remaining[srcIndex] ?? remaining[srcIndex - 1] ?? remaining[0])
						: source.activeTabId,
			};
		} else {
			delete groups[sourceGroupId];
			layout =
				pruneLayout(s.layout, new Set(Object.keys(groups))) ??
				({ type: "leaf", groupId: targetGroupId } as LayoutNode);
		}

		return { ...s, groups, layout, activeGroupId: targetGroupId };
	});
	syncExternalStores();
}

/** 组内重排：把 tabId 挪到 index 位置。 */
function reorderInGroup(tabId: string, groupId: string, index?: number): void {
	store.setState((s) => {
		const group = s.groups[groupId];
		if (!group) return s;
		const rest = group.tabIds.filter((id) => id !== tabId);
		const at = index === undefined ? rest.length : index;
		rest.splice(Math.max(0, Math.min(at, rest.length)), 0, tabId);
		return {
			...s,
			groups: { ...s.groups, [groupId]: { ...group, tabIds: rest } },
		};
	});
	persistNow();
}

/**
 * 拖拽重排的门面：把 fromId 放到 toId 现在的位置上。
 * 跨组拖时等价于「移到目标组的那个位置」。
 */
function moveTab(fromId: string, toId: string): void {
	if (fromId === toId) return;
	const state = store.getState();
	const targetGroupId = groupIdOfTab(state, toId);
	if (!targetGroupId) return;
	const index = state.groups[targetGroupId].tabIds.indexOf(toId);
	moveTabToGroup(fromId, targetGroupId, index < 0 ? undefined : index);
}

/** 把某个组的全部标签并回相邻组（取消这一处分屏）。 */
function mergeGroupInto(sourceGroupId: string, targetGroupId: string): void {
	const group = store.getState().groups[sourceGroupId];
	if (!group || sourceGroupId === targetGroupId) return;
	for (const id of [...group.tabIds]) moveTabToGroup(id, targetGroupId);
}

/**
 * 拖拽兜底监听的卸载函数（null = 当前没装）。
 *
 * HTML5 的 `dragend` 只派发给**源元素**。跨组落下时源标签已经被搬到别的组、
 * 从 DOM 上卸载了，它的 onDragEnd 永远不会来——只靠标签自己清状态，
 * `draggingTabId` 会一直挂着，各组的落点层跟着常驻并盖死整个中栏。
 */
let dragWatchdogCleanup: (() => void) | null = null;

/** 标签拖拽开始 —— 让各组的分屏落点显形。 */
function beginTabDrag(tabId: string): void {
	store.setState((s) => ({ ...s, draggingTabId: tabId }));
	installDragWatchdog();
}

/**
 * 在 window 捕获阶段兜底收尾。
 *
 * 捕获阶段早于落点自己的 `stopPropagation`，所以 drop 一定收得到；
 * `dragend` 覆盖 ESC / 拖到窗口外取消；`pointerdown` 是最后一道保险
 * （拖拽期间浏览器不派发 pointer 事件，所以只会在下一次点击时兜底自愈）。
 */
function installDragWatchdog(): void {
	if (dragWatchdogCleanup || typeof window === "undefined") return;
	const end = () => endTabDrag();
	window.addEventListener("drop", end, true);
	window.addEventListener("dragend", end, true);
	window.addEventListener("pointerdown", end, true);
	dragWatchdogCleanup = () => {
		window.removeEventListener("drop", end, true);
		window.removeEventListener("dragend", end, true);
		window.removeEventListener("pointerdown", end, true);
	};
}

/** 拖拽结束（无论是否成功落下）。 */
function endTabDrag(): void {
	dragWatchdogCleanup?.();
	dragWatchdogCleanup = null;
	store.setState((s) =>
		s.draggingTabId === null ? s : { ...s, draggingTabId: null },
	);
}

// ============================================================
// 遍历
// ============================================================

/** 在当前活动组内前后切换（循环）。 */
function cycleTab(delta: 1 | -1): void {
	const state = store.getState();
	const group = getGroup(state, state.activeGroupId);
	if (!group || group.tabIds.length === 0) return;
	const current = group.tabIds.indexOf(group.activeTabId);
	const base = current < 0 ? 0 : current;
	const next =
		group.tabIds[(base + delta + group.tabIds.length) % group.tabIds.length];
	if (next) activateTab(next, group.id);
}

/** 激活活动组内第 N 个标签（1 基，Alt+1..9 用）。 */
function activateTabByIndex(index1Based: number): void {
	const state = store.getState();
	const group = getGroup(state, state.activeGroupId);
	const tabId = group?.tabIds[index1Based - 1];
	if (tabId) activateTab(tabId, group?.id);
}

/** 在各分屏组之间循环切换焦点。 */
function cycleGroup(delta: 1 | -1): void {
	const state = store.getState();
	const ids = collectGroupIds(state.layout);
	if (ids.length <= 1) return;
	const current = ids.indexOf(state.activeGroupId);
	const base = current < 0 ? 0 : current;
	focusGroup(ids[(base + delta + ids.length) % ids.length]);
}

// ============================================================
// 反向镜像：兜底既有的 setMainView / setCenterView 调用点
// ============================================================

// 旧调用点（ResourceSidebar 的 setMainView("browser")、斜杠命令…）不知道标签
// 的存在，这里把它们的意图翻译成标签操作。`applying` 锁住 syncExternalStores
// 自己写外部时的回声。
layoutStore.subscribe(() => {
	if (applying) return;
	const view = layoutStore.getState().activeMainView;
	const state = store.getState();
	const activeTabId = activeTabIdOf(state);
	// 空态时不短路：中栏什么都没有，任何"切到某视图"的意图都该真的开出标签来
	if (activeTabId && mainViewForTab(activeTabId) === view) return;
	if (view === "editor") {
		openTab({ id: currentSandboxTabId(), kind: currentSandboxTabId() });
		return;
	}
	if (view === "browser") {
		openBrowser();
		return;
	}
	if (view === "aihub") {
		// 已经有 Web 标签就聚焦最近的一个，否则按偏好新开
		const existing = Object.values(state.tabsById).find(
			(t) => t.kind === "web",
		);
		if (existing) {
			activateTab(existing.id);
			return;
		}
		void openWebSite().then((ok) => {
			// 一个站点都没启用：退回工作区，避免中栏卡在空白的 aihub 视图
			if (!ok) layoutStore.setMainView("editor");
		});
	}
});

// 沙盒内部切换运行图/预览（点击产物、执行期自动预览…）时同步标签高亮。
// 只在活动组确实停在对应标签上时才跟随，否则会把用户从别的标签上拽走。
managedModeStore.subscribe(() => {
	if (applying) return;
	const state = store.getState();
	const activeTabId = activeTabIdOf(state);
	if (activeTabId !== "graph" && activeTabId !== "preview") return;
	const view = currentSandboxTabId();
	if (view === activeTabId) return;
	// 目标标签不在当前组里就不跟随（不擅自替他把标签开回来 / 也不跨组抢焦点）
	const group = getGroup(state, state.activeGroupId);
	if (!group?.tabIds.includes(view)) return;
	activateTab(view, group.id);
});

// ============================================================
// 启动恢复
// ============================================================

/**
 * 按偏好恢复上次的布局。
 *
 * 整体替换而不是往默认集合里追加，否则用户上次特意关掉的运行图每次启动都会
 * 自己长回来。只恢复"标签存在与排布"，不恢复内容状态。
 */
async function restorePersistedTabsIfEnabled(): Promise<void> {
	let enabled = false;
	try {
		enabled = (await getCenterUxPrefs()).restoreTabsOnStartup;
	} catch {
		return;
	}
	if (!enabled) return;

	const persisted = readPersisted();
	// 从未存过记录（首次启动）：保持默认的运行图 + 预览
	if (persisted === null) return;

	// Web 标签要先确认站点仍然启用，否则会留下点不开的死标签
	const needsSites = persisted.tabs.some((t) => t.kind === "web");
	const sites = needsSites ? await ensureWebSites() : [];
	const siteIds = new Set(sites.map((s) => s.id));

	const tabsById: Record<string, CenterTab> = {};
	for (const item of persisted.tabs) {
		if (tabsById[item.id]) continue;
		if (item.kind === "web") {
			if (!item.siteId || !siteIds.has(item.siteId)) continue;
			tabsById[item.id] = { id: item.id, kind: "web", siteId: item.siteId };
		} else if (
			item.kind === "graph" ||
			item.kind === "preview" ||
			item.kind === "browser" ||
			item.kind === "hub"
		) {
			tabsById[item.id] = { id: item.id, kind: item.kind };
		}
	}

	const groups: Record<string, TabGroup> = {};
	for (const g of persisted.groups) {
		const tabIds = g.tabIds.filter((id) => tabsById[id]);
		if (tabIds.length === 0) continue;
		groups[g.id] = {
			id: g.id,
			tabIds,
			activeTabId: tabIds.includes(g.activeTabId) ? g.activeTabId : tabIds[0],
		};
	}
	if (Object.keys(groups).length === 0) return;

	const layout =
		pruneLayout(persisted.layout, new Set(Object.keys(groups))) ??
		({ type: "leaf", groupId: Object.keys(groups)[0] } as LayoutNode);

	// 期间用户已经手动开过别的标签（比如启动脚本自动开了某个视图）：不覆盖他
	const current = store.getState();
	const untouched =
		Object.keys(current.tabsById).length === 2 &&
		Boolean(current.tabsById.graph) &&
		Boolean(current.tabsById.preview) &&
		Object.keys(current.groups).length === 1;
	if (!untouched) return;

	// 恢复的组 id 可能与自增序列撞车，把序列推到最大值之后
	for (const id of Object.keys(groups)) {
		const n = Number(id.replace(/^g/, ""));
		if (Number.isFinite(n) && n > groupSeq) groupSeq = n;
	}

	store.setState((s) => ({
		...s,
		tabsById,
		groups,
		layout,
		activeGroupId: groups[persisted.activeGroupId]
			? persisted.activeGroupId
			: collectGroupIds(layout)[0],
	}));
	syncExternalStores();
}

/**
 * 站点清单变更（设置里启用/禁用/删除站点）后调用：刷新清单并剔除已失效的
 * Web 标签，避免留下打不开的死标签。
 */
async function syncWebSites(): Promise<void> {
	const sites = await ensureWebSites(true);
	const validIds = new Set(sites.map((s) => s.id));
	const stale = Object.values(store.getState().tabsById).filter(
		(t) => t.kind === "web" && (!t.siteId || !validIds.has(t.siteId)),
	);
	for (const tab of stale) closeTab(tab.id);
}

export const centerTabsStore = {
	...store,
	activateTab,
	activateTabByIndex,
	beginTabDrag,
	endTabDrag,
	closeTab,
	closeActiveTab,
	closeOtherTabs,
	closeAllTabs,
	closeGroup,
	cycleTab,
	cycleGroup,
	focusGroup,
	mergeGroupInto,
	moveTab,
	moveTabToGroup,
	splitGroup,
	openBrowser,
	openCli,
	openHub,
	restartCli,
	openSandboxView,
	openWebSite,
	ensureClis,
	ensureWebSites,
	syncWebSites,
	restorePersistedTabsIfEnabled,
};

export { collectGroupIds };
export type { LayoutNode, SplitDirection };

export const useCenterTabsStore = createUseStore(store);
export const useCenterTabsStoreSelector = createUseStoreSelector(store);
