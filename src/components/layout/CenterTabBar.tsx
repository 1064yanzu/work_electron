/**
 * CenterTabBar —— 单个编辑器组的标签条（仿 VSCode，但按本应用的定位做了取舍）。
 *
 * 中栏支持分屏后，每个组各有一条标签条。本组件只认自己那一组。
 *
 * 交互清单：
 * - 单击切换、中键关闭、悬停/激活时出现 × 关闭
 * - 组内拖拽重排；**跨组拖拽**直接把标签搬到目标组
 * - 拖到内容区的四条边 → 按方向拆出新分屏（落点提示见 CenterGroupDropZones）
 * - 右键菜单：关闭 / 关闭其他 / 关闭全部 / 向右拆分 / 向下拆分
 * - `+` 菜单：工作区（运行图 / 预览）/ Agent 接力 / 浏览器 / 知识图谱 / 本机 CLI / Web AI
 * - `Alt+1..9` 直达组内第 N 个标签，`⌘⌥←/→` 前后切换，`⌘⌥W` 关闭当前标签
 * - `⌘\` 向右拆分，`⌘⇧\` 向下拆分，`⌘K ←/→` 在分屏之间移动焦点（见下方注册）
 */

import {
	Columns2,
	Eye,
	Globe,
	Network,
	Plus,
	Rows2,
	SquareTerminal,
	Waypoints,
	Workflow,
	X,
	type LucideIcon,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { EVENTS, events } from "../../lib/events";
import { EASE, Flip, gsap, isReducedMotion, mDur } from "../../lib/motion";
import { formatKeys, useRegisterShortcuts } from "../../lib/shortcuts";
import { useAgentStoreSelector } from "../../lib/agent/store";
import {
	centerTabsStore,
	useCenterTabsStoreSelector,
	type CenterTab,
} from "../../lib/stores/centerTabsStore";
import { cn } from "../../lib/utils";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { toast } from "../ui/Toast";

/** Web AI 站点设置页（无可用站点时引导过去）。 */
const HARNESS_HUB_SETTINGS_TAB = "integrations.harnessHub";

/** 拖拽标签时写进 DataTransfer 的 MIME（跨组拖拽要靠它识别）。 */
export const TAB_DRAG_MIME = "application/x-center-tab";

const STATIC_TAB_META: Record<string, { title: string; icon: LucideIcon }> = {
	graph: { title: "运行图", icon: Workflow },
	preview: { title: "预览", icon: Eye },
	browser: { title: "浏览器", icon: Globe },
	"wiki-graph": { title: "知识图谱", icon: Waypoints },
	hub: { title: "Agent 接力", icon: Network },
};

interface MenuState {
	x: number;
	y: number;
	items: ContextMenuItem[];
}

export function CenterTabBar({ groupId }: { groupId: string }) {
	const tabIds = useCenterTabsStoreSelector(
		(s) => s.groups[groupId]?.tabIds ?? EMPTY_IDS,
	);
	const activeTabId = useCenterTabsStoreSelector(
		(s) => s.groups[groupId]?.activeTabId ?? "",
	);
	const tabsById = useCenterTabsStoreSelector((s) => s.tabsById);
	const isActiveGroup = useCenterTabsStoreSelector(
		(s) => s.activeGroupId === groupId,
	);
	const hasSplit = useCenterTabsStoreSelector(
		(s) => Object.keys(s.groups).length > 1,
	);
	const webSites = useCenterTabsStoreSelector((s) => s.webSites);
	const clis = useCenterTabsStoreSelector((s) => s.clis);
	// 任务在跑、而用户人不在运行图上时，给运行图标签一个安静的活动点。
	// 中栏成了自由标签页之后，"切走就看不见任务跑到哪了"是最容易丢的信息。
	const isAgentExecuting = useAgentStoreSelector((s) => s.isExecuting);

	const [menu, setMenu] = useState<MenuState | null>(null);
	const [dragTabId, setDragTabId] = useState<string | null>(null);
	const [dropTabId, setDropTabId] = useState<string | null>(null);
	const [barIsDropTarget, setBarIsDropTarget] = useState(false);
	const addButtonRef = useRef<HTMLButtonElement | null>(null);
	const activeTabRef = useRef<HTMLButtonElement | null>(null);
	const tabListRef = useRef<HTMLDivElement | null>(null);
	const indicatorRef = useRef<HTMLSpanElement | null>(null);

	const tabs = useMemo(
		() =>
			tabIds
				.map((id) => tabsById[id])
				.filter((tab): tab is CenterTab => Boolean(tab)),
		[tabIds, tabsById],
	);

	// ---------------------------------------------------------------
	// 标签重排 / 关闭的补位动画
	//
	// 改造前重排是纯 setState：标签"瞬移"到新位置，拖了半天松手看不到结果落位。
	// 这里用 Flip：**每次提交结束都存一份当前布局快照**，下次提交发现顺序变了，
	// 就从上一份快照补间到新位置。之所以能这么写，是因为 useLayoutEffect 跑在
	// DOM 更新之后——此刻 ref 里存的正是"变化前"的那份。
	// ---------------------------------------------------------------
	const flipStateRef = useRef<Flip.FlipState | null>(null);
	const prevTabSignatureRef = useRef<string | null>(null);

	useLayoutEffect(() => {
		const list = tabListRef.current;
		if (!list) return;
		const signature = tabs.map((tab) => tab.id).join("|");
		const previous = prevTabSignatureRef.current;
		const state = flipStateRef.current;

		if (
			previous !== null &&
			previous !== signature &&
			state &&
			!isReducedMotion()
		) {
			Flip.from(state, {
				duration: mDur(0.36),
				ease: EASE.outExpo,
				absolute: true,
				// 新开的标签自己弹出来，不参与位移补间
				onEnter: (elements) =>
					gsap.fromTo(
						elements,
						{ opacity: 0, scale: 0.82 },
						{
							opacity: 1,
							scale: 1,
							duration: mDur(0.34),
							ease: EASE.spring,
							clearProps: "transform,opacity",
						},
					),
			});
		}

		prevTabSignatureRef.current = signature;
		// 只收集真正的标签按钮：指示条是绝对定位的装饰元素，且由 quickTo 单独驱动，
		// 混进 Flip 会两套动画抢同一个 transform。
		flipStateRef.current = Flip.getState(list.querySelectorAll('[role="tab"]'));
	}, [tabs]);

	// ---------------------------------------------------------------
	// 激活指示条：一条跟着当前标签滑动的赤陶色下划线。
	// 用 quickTo 直写 DOM，切标签时不产生任何额外重渲染。
	// ---------------------------------------------------------------
	useLayoutEffect(() => {
		const indicator = indicatorRef.current;
		const activeTab = activeTabRef.current;
		if (!indicator) return;
		if (!activeTab) {
			gsap.set(indicator, { opacity: 0 });
			return;
		}
		const left = activeTab.offsetLeft;
		const width = activeTab.offsetWidth;
		const first = !indicator.dataset.placed;
		indicator.dataset.placed = "1";
		if (first || isReducedMotion()) {
			gsap.set(indicator, { x: left, width, opacity: 1 });
			return;
		}
		gsap.to(indicator, {
			x: left,
			width,
			opacity: 1,
			duration: mDur(0.34),
			ease: EASE.outExpo,
		});
	}, [activeTabId, tabs]);

	// 启动时恢复上次的布局 + 预取站点/CLI 清单（「+」菜单要立刻能列出来）。
	// 只由活动组负责，避免分屏时每个组各跑一遍。
	useEffect(() => {
		if (!isActiveGroup) return;
		void centerTabsStore.restorePersistedTabsIfEnabled();
		void centerTabsStore.ensureWebSites();
		void centerTabsStore.ensureClis();
	}, [isActiveGroup]);

	// 设置面板里增删/启停 Web AI 站点后，同步清单并剔除失效标签
	useEffect(() => {
		if (!isActiveGroup) return;
		return events.on(EVENTS.AIHUB_SITES_CHANGED, () => {
			void centerTabsStore.syncWebSites();
		});
	}, [isActiveGroup]);

	// 标签变多时把激活项滚进可视区（快捷键切换尤其需要）
	useEffect(() => {
		activeTabRef.current?.scrollIntoView({
			block: "nearest",
			inline: "nearest",
		});
	}, [activeTabId]);

	const siteLabelById = useMemo(() => {
		const map = new Map<string, string>();
		for (const site of webSites) map.set(site.id, site.label);
		return map;
	}, [webSites]);

	const siteUrlById = useMemo(() => {
		const map = new Map<string, string>();
		for (const site of webSites) map.set(site.id, site.url);
		return map;
	}, [webSites]);

	const openWebSite = useCallback(
		async (siteId?: string) => {
			const ok = await centerTabsStore.openWebSite(siteId, groupId);
			if (!ok) {
				toast.info("尚未启用任何 Web AI 站点，请先在设置中启用");
				events.emit(EVENTS.OPEN_SETTINGS, { tab: HARNESS_HUB_SETTINGS_TAB });
			}
		},
		[groupId],
	);

	// ============================================================
	// 菜单
	// ============================================================

	const openAddMenu = useCallback(() => {
		centerTabsStore.focusGroup(groupId);
		const rect = addButtonRef.current?.getBoundingClientRect();
		const items: ContextMenuItem[] = [
			{ label: "工作区", heading: true, onClick: () => {} },
			{
				label: "运行图",
				icon: <Workflow className="h-4 w-4" strokeWidth={1.5} />,
				onClick: () => centerTabsStore.openSandboxView("graph"),
			},
			{
				label: "预览",
				icon: <Eye className="h-4 w-4" strokeWidth={1.5} />,
				onClick: () => centerTabsStore.openSandboxView("preview"),
			},
			{ label: "", separator: true, onClick: () => {} },
			{ label: "视图", heading: true, onClick: () => {} },
			{
				label: "Agent 接力",
				icon: <Network className="h-4 w-4" strokeWidth={1.5} />,
				onClick: () => centerTabsStore.openHub(groupId),
			},
			{
				label: "浏览器",
				icon: <Globe className="h-4 w-4" strokeWidth={1.5} />,
				onClick: () => centerTabsStore.openBrowser(groupId),
			},
			{
				label: "知识图谱",
				icon: <Waypoints className="h-4 w-4" strokeWidth={1.5} />,
				onClick: () => centerTabsStore.openWikiGraph(groupId),
			},
		];

		items.push({ label: "", separator: true, onClick: () => {} });
		items.push({ label: "本机 CLI", heading: true, onClick: () => {} });
		if (clis.length > 0) {
			for (const cli of clis) {
				items.push({
					label: cli.label,
					icon: <SquareTerminal className="h-4 w-4" strokeWidth={1.5} />,
					onClick: () => void centerTabsStore.openCli(cli, groupId),
				});
			}
		} else {
			items.push({
				label: "未探测到可启动的 CLI",
				icon: <SquareTerminal className="h-4 w-4" strokeWidth={1.5} />,
				disabled: true,
				onClick: () => {},
			});
		}

		items.push({ label: "", separator: true, onClick: () => {} });
		items.push({ label: "Web AI", heading: true, onClick: () => {} });
		if (webSites.length > 0) {
			for (const site of webSites) {
				items.push({
					label: site.label,
					icon: <SiteFavicon url={site.url} className="h-4 w-4" />,
					onClick: () => void openWebSite(site.id),
				});
			}
		} else {
			items.push({
				label: "启用 Web AI 站点…",
				icon: <Globe className="h-4 w-4" strokeWidth={1.5} />,
				onClick: () =>
					events.emit(EVENTS.OPEN_SETTINGS, { tab: HARNESS_HUB_SETTINGS_TAB }),
			});
		}

		items.push({ label: "", separator: true, onClick: () => {} });
		items.push({ label: "分屏", heading: true, onClick: () => {} });
		items.push({
			label: "向右拆分",
			icon: <Columns2 className="h-4 w-4" strokeWidth={1.5} />,
			onClick: () =>
				centerTabsStore.splitGroup({ groupId, direction: "horizontal" }),
		});
		items.push({
			label: "向下拆分",
			icon: <Rows2 className="h-4 w-4" strokeWidth={1.5} />,
			onClick: () =>
				centerTabsStore.splitGroup({ groupId, direction: "vertical" }),
		});

		setMenu({
			x: rect ? rect.left : 0,
			y: rect ? rect.bottom + 4 : 0,
			items,
		});
	}, [webSites, clis, openWebSite, groupId]);

	const openTabContextMenu = useCallback(
		(event: React.MouseEvent, tab: CenterTab) => {
			event.preventDefault();
			centerTabsStore.focusGroup(groupId);
			const hasOthers = tabs.length > 1;
			setMenu({
				x: event.clientX,
				y: event.clientY,
				items: [
					{
						label: "移到右边分屏",
						icon: <Columns2 className="h-4 w-4" strokeWidth={1.5} />,
						onClick: () =>
							centerTabsStore.splitGroup({
								groupId,
								direction: "horizontal",
								tabId: tab.id,
							}),
					},
					{
						label: "移到下方分屏",
						icon: <Rows2 className="h-4 w-4" strokeWidth={1.5} />,
						onClick: () =>
							centerTabsStore.splitGroup({
								groupId,
								direction: "vertical",
								tabId: tab.id,
							}),
					},
					{ label: "", separator: true, onClick: () => {} },
					{
						label: "关闭标签页",
						shortcut: formatKeys("mod+alt+w").join(" "),
						onClick: () => centerTabsStore.closeTab(tab.id),
					},
					{
						label: "关闭其他标签页",
						disabled: !hasOthers,
						onClick: () => centerTabsStore.closeOtherTabs(tab.id),
					},
					{
						label: "关闭本组全部",
						onClick: () => centerTabsStore.closeGroup(groupId),
					},
				],
			});
		},
		[tabs.length, groupId],
	);

	// ============================================================
	// 快捷键（只由活动组注册，避免分屏时重复绑定）
	// ============================================================

	useRegisterShortcuts(
		() =>
			isActiveGroup
				? [
						// Alt+1..9 直达组内第 N 个标签。历史上 Alt+1/2 是「运行图 / 预览」，
						// 默认标签顺序沿用这个语义（但用户可以拖走或关掉，不再是硬绑定）。
						// 批量注册但 hidden，由下面一条 displayOnly 条目统一代言。
						...Array.from({ length: 9 }, (_, index) => ({
							id: `center-tabs.activate-${index + 1}`,
							keys: `alt+${index + 1}`,
							label: `切换到第 ${index + 1} 个标签页`,
							group: "工作区" as const,
							hidden: true,
							handler: () => centerTabsStore.activateTabByIndex(index + 1),
						})),
						{
							id: "center-tabs.activate-nth",
							keys: "alt+1",
							keysDisplay: ["Alt", "1", "…", "9"],
							label: "切换到第 N 个标签页",
							description:
								"按当前分屏的标签顺序，默认 Alt+1 运行图、Alt+2 预览",
							group: "工作区" as const,
							displayOnly: true,
						},
						{
							id: "center-tabs.next",
							keys: "mod+alt+arrowright",
							label: "下一个标签页",
							group: "工作区" as const,
							handler: () => centerTabsStore.cycleTab(1),
						},
						{
							id: "center-tabs.prev",
							keys: "mod+alt+arrowleft",
							label: "上一个标签页",
							group: "工作区" as const,
							handler: () => centerTabsStore.cycleTab(-1),
						},
						{
							id: "center-tabs.close",
							keys: "mod+alt+w",
							label: "关闭当前标签页",
							description: "关光了中栏进空态，用标签条的「+」重新打开",
							group: "工作区" as const,
							handler: () => centerTabsStore.closeActiveTab(),
						},
						{
							id: "center-tabs.split-right",
							keys: "mod+\\",
							label: "分屏",
							description:
								"把当前标签拆到右边的新分屏（组内只有一个标签时不拆）",
							group: "工作区" as const,
							handler: () => {
								if (!centerTabsStore.splitGroup({ direction: "horizontal" })) {
									toast.info("组内只有一个标签，再拆就空了");
								}
							},
						},
						{
							id: "center-tabs.split-down",
							keys: "mod+shift+\\",
							label: "向下分屏",
							group: "工作区" as const,
							// 速查表里只留「分屏」一条：方向是次要细节，
							// 一口气摆出四五条分屏快捷键只会让人觉得这功能很复杂
							hidden: true,
							handler: () =>
								centerTabsStore.splitGroup({ direction: "vertical" }),
						},
						{
							id: "center-tabs.focus-next-group",
							keys: "mod+alt+arrowdown",
							label: "焦点移到下一个分屏",
							description: "分屏之间循环，新标签会开在带高亮边框的那一屏",
							group: "工作区" as const,
							hidden: true,
							handler: () => centerTabsStore.cycleGroup(1),
						},
						{
							id: "center-tabs.focus-prev-group",
							keys: "mod+alt+arrowup",
							label: "焦点移到上一个分屏",
							group: "工作区" as const,
							hidden: true,
							handler: () => centerTabsStore.cycleGroup(-1),
						},
					]
				: [],
		[isActiveGroup],
	);

	// ============================================================
	// 拖拽
	// ============================================================

	const handleDropOnTab = useCallback(
		(targetId: string, event: React.DragEvent) => {
			const draggedId =
				event.dataTransfer.getData(TAB_DRAG_MIME) || dragTabId || "";
			if (draggedId) centerTabsStore.moveTab(draggedId, targetId);
			setDragTabId(null);
			setDropTabId(null);
			setBarIsDropTarget(false);
			centerTabsStore.endTabDrag();
		},
		[dragTabId],
	);

	/** 拖到标签条空白处：追加到本组末尾。 */
	const handleDropOnBar = useCallback(
		(event: React.DragEvent) => {
			const draggedId = event.dataTransfer.getData(TAB_DRAG_MIME);
			if (draggedId) centerTabsStore.moveTabToGroup(draggedId, groupId);
			setDragTabId(null);
			setDropTabId(null);
			setBarIsDropTarget(false);
			centerTabsStore.endTabDrag();
		},
		[groupId],
	);

	return (
		<div
			className={cn(
				"flex h-10 shrink-0 items-center gap-1 border-b border-border/80 bg-surface/92 px-2 backdrop-blur-sm",
				barIsDropTarget && "bg-terracotta/[0.06]",
			)}
			onDragOver={(event) => {
				if (!event.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				setBarIsDropTarget(true);
			}}
			onDragLeave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node)) {
					setBarIsDropTarget(false);
				}
			}}
			onDrop={(event) => {
				event.preventDefault();
				handleDropOnBar(event);
			}}
		>
			<div
				ref={tabListRef}
				role="tablist"
				aria-label="中间栏标签页"
				className="scrollbar-hide relative flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
			>
				{/* 激活指示条：绝对定位在滚动内容里，随标签一起横向滚动 */}
				<span
					ref={indicatorRef}
					aria-hidden="true"
					className="pointer-events-none absolute bottom-0 left-0 h-[2px] rounded-full bg-terracotta opacity-0"
				/>
				{tabs.map((tab) => {
					const meta = STATIC_TAB_META[tab.id];
					const title =
						tab.kind === "web"
							? (siteLabelById.get(tab.siteId ?? "") ?? "Web AI")
							: tab.kind === "cli"
								? (tab.label ?? tab.harness ?? "CLI")
								: (meta?.title ?? tab.id);
					const Icon = tab.kind === "cli" ? SquareTerminal : meta?.icon;
					const active = tab.id === activeTabId;
					const isDropTarget = dropTabId === tab.id && dragTabId !== tab.id;
					const showActivity =
						tab.id === "graph" && isAgentExecuting && !active;

					return (
						<button
							key={tab.id}
							ref={active ? activeTabRef : undefined}
							type="button"
							role="tab"
							aria-selected={active}
							title={showActivity ? `${title}（任务执行中）` : title}
							draggable
							onDragStart={(e) => {
								setDragTabId(tab.id);
								centerTabsStore.beginTabDrag(tab.id);
								e.dataTransfer.effectAllowed = "move";
								// 跨组拖拽靠 DataTransfer 传递，组件本地 state 跨不过去
								e.dataTransfer.setData(TAB_DRAG_MIME, tab.id);
								e.dataTransfer.setData("text/plain", title);
							}}
							onDragEnd={() => {
								setDragTabId(null);
								setDropTabId(null);
								setBarIsDropTarget(false);
								centerTabsStore.endTabDrag();
							}}
							onDragOver={(e) => {
								if (!e.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
								e.preventDefault();
								e.stopPropagation();
								setDropTabId(tab.id);
							}}
							onDragLeave={() => {
								setDropTabId((prev) => (prev === tab.id ? null : prev));
							}}
							onDrop={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleDropOnTab(tab.id, e);
							}}
							onClick={() => centerTabsStore.activateTab(tab.id, groupId)}
							onAuxClick={(e) => {
								// 中键关闭，与 VSCode / 浏览器一致
								if (e.button === 1) {
									e.preventDefault();
									centerTabsStore.closeTab(tab.id);
								}
							}}
							onContextMenu={(e) => openTabContextMenu(e, tab)}
							className={cn(
								"group inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg pl-2.5 pr-1 text-xs",
								"transition-[background-color,color,opacity] duration-150 focus-ring cursor-pointer",
								active
									? "bg-warm-200 font-medium text-text-primary"
									: "text-text-muted hover:bg-warm-200/60 hover:text-text-primary",
								dragTabId === tab.id && "opacity-40",
								isDropTarget && "ring-1 ring-inset ring-terracotta/60",
							)}
						>
							{tab.kind === "web" ? (
								<SiteFavicon
									url={siteUrlById.get(tab.siteId ?? "") ?? ""}
									className="h-3.5 w-3.5"
								/>
							) : Icon ? (
								<Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
							) : null}
							<span className="max-w-[10rem] truncate">{title}</span>
							{showActivity ? (
								<span
									aria-hidden="true"
									className="ml-0.5 inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-terracotta"
								/>
							) : null}
							<span
								role="button"
								tabIndex={-1}
								aria-label={`关闭 ${title}`}
								onClick={(e) => {
									e.stopPropagation();
									centerTabsStore.closeTab(tab.id);
								}}
								onKeyDown={(e) => {
									if (e.key !== "Enter" && e.key !== " ") return;
									e.stopPropagation();
									e.preventDefault();
									centerTabsStore.closeTab(tab.id);
								}}
								className={cn(
									"ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded",
									"opacity-0 transition-[opacity,background-color] duration-150",
									"hover:bg-warm-300/70 group-hover:opacity-100 focus-visible:opacity-100",
									active && "opacity-70",
								)}
							>
								<X className="h-3 w-3" strokeWidth={2} />
							</span>
						</button>
					);
				})}
			</div>

			{/*
			 * 分屏按钮**常驻**。
			 *
			 * 拖标签到边缘是更快的手势，但它完全不可见——不点一次这个按钮，用户
			 * 根本不会知道中栏能分屏。所以这里是这个能力唯一的"看得见的入口"，
			 * 不按标签数量隐藏（只有一个标签时会开出一屏空的，让人自己挑内容）。
			 */}
			<button
				type="button"
				onClick={() =>
					centerTabsStore.splitGroup({ groupId, direction: "horizontal" })
				}
				aria-label="分屏"
				title={`分屏 ${formatKeys("mod+\\").join(" ")}　·　也可以直接把标签拖到内容区边缘`}
				className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-warm-200 hover:text-text-primary focus-ring cursor-pointer"
			>
				<Columns2 className="h-3.5 w-3.5" strokeWidth={1.5} />
			</button>

			{/* 关闭本屏：空屏必须有路收掉，否则就是一块赶不走的空白 */}
			{hasSplit && tabs.length === 0 && (
				<button
					type="button"
					onClick={() => centerTabsStore.closeGroup(groupId)}
					aria-label="关闭这一屏"
					title="关闭这一屏"
					className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-warm-200 hover:text-text-primary focus-ring cursor-pointer"
				>
					<X className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
			)}

			<button
				ref={addButtonRef}
				type="button"
				onClick={openAddMenu}
				aria-label="打开新标签页"
				title="打开新标签页"
				className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-warm-200 hover:text-text-primary focus-ring cursor-pointer"
			>
				<Plus className="h-4 w-4" strokeWidth={1.5} />
			</button>

			{menu ? (
				<ContextMenu
					x={menu.x}
					y={menu.y}
					items={menu.items}
					onClose={() => setMenu(null)}
				/>
			) : null}
		</div>
	);
}

/** 稳定的空数组引用，避免 selector 每次返回新数组触发重渲染。 */
const EMPTY_IDS: string[] = [];

/** 站点图标：取站点自身的 favicon，失败回落到通用图标。 */
function SiteFavicon({ url, className }: { url: string; className?: string }) {
	const [failed, setFailed] = useState(false);
	const host = useMemo(() => {
		try {
			return new URL(url).host;
		} catch {
			return null;
		}
	}, [url]);

	if (!host || failed) {
		return (
			<Globe
				className={cn("shrink-0 opacity-70", className)}
				strokeWidth={1.5}
			/>
		);
	}

	return (
		<img
			src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
			alt=""
			className={cn("shrink-0 rounded-sm object-contain", className)}
			onError={() => setFailed(true)}
		/>
	);
}
