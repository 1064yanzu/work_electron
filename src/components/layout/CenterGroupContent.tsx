/**
 * CenterGroupContent —— 一个编辑器组的内容区。
 *
 * 从 App.tsx 里抽出来的：中栏支持分屏之后，「当前该渲染什么」不再是全局唯一的
 * 一个判断，而是**每个组各判断一次**。
 *
 * CLI 标签在这里同样常挂不卸载（xterm 的滚动缓冲在渲染进程里，卸载即丢失），
 * 但只覆盖**本组内**的 CLI 标签——把某个 CLI 标签拖到另一组会重建它的 xterm
 * 视图（pty 进程不受影响，仍然活着，只是滚动缓冲要重新累积）。
 */
import { Suspense, lazy } from "react";

import { CenterCliTabs } from "./CenterCliTabs";
import { CenterEmptyState } from "./CenterEmptyState";
import { PanelLoadingFallback } from "./PanelLoadingFallback";
import { ViewTransition } from "../ui/ViewTransition";
import {
	isCliTabId,
	siteIdFromTabId,
	useCenterTabsStoreSelector,
	type CenterTab,
} from "../../lib/stores/centerTabsStore";

const BrowserPanel = lazy(() => import("../BrowserPanel"));
const SandboxWorkspace = lazy(() => import("../sandbox/SandboxWorkspace"));
const WikiGraphFullscreen = lazy(() =>
	import("../wiki/WikiGraphFullscreen").then((m) => ({
		default: m.WikiGraphFullscreen,
	})),
);
const AiHubPanel = lazy(() =>
	import("../aihub/AiHubPanel").then((m) => ({ default: m.AiHubPanel })),
);
const HubView = lazy(() =>
	import("../hub/HubView").then((m) => ({ default: m.HubView })),
);

export function CenterGroupContent({ groupId }: { groupId: string }) {
	const activeTabId = useCenterTabsStoreSelector(
		(s) => s.groups[groupId]?.activeTabId ?? "",
	);
	const groupTabIds = useCenterTabsStoreSelector(
		(s) => s.groups[groupId]?.tabIds,
	);
	const tabsById = useCenterTabsStoreSelector((s) => s.tabsById);

	const activeWebSiteId = siteIdFromTabId(activeTabId);
	const isCliTab = isCliTabId(activeTabId);

	// 过渡 key 取「组件族」而非标签 id：运行图 ↔ 预览是同一个 SandboxWorkspace 的
	// 内部切换（它自己有过渡动画），用 tab id 当 key 会让整个工作区重新挂载。
	const viewKey = activeWebSiteId
		? activeTabId
		: activeTabId === "browser" ||
				activeTabId === "wiki-graph" ||
				activeTabId === "hub" ||
				activeTabId === ""
			? activeTabId || "empty"
			: "sandbox";

	const cliTabs: CenterTab[] = (groupTabIds ?? [])
		.map((id) => tabsById[id])
		.filter((tab): tab is CenterTab => Boolean(tab) && tab.kind === "cli");

	// 承载 Electron 原生视图（WebContentsView）的标签不做任何入场变换：原生视图
	// 由合成器按窗口坐标直接贴在 DOM 之上，祖先上的 transform 会让它与 DOM 占位
	// 错位一整段动画时长。见 lib/stores/nativeViewRectStore.ts 顶部注释。
	const viewVariant =
		activeWebSiteId || activeTabId === "browser" ? "none" : "expressive";

	return (
		<div className="relative min-h-0 flex-1">
			{isCliTab ? null : (
				<ViewTransition viewKey={viewKey} variant={viewVariant}>
					{activeTabId === "" ? (
						<CenterEmptyState groupId={groupId} />
					) : activeTabId === "hub" ? (
						<Suspense fallback={<PanelLoadingFallback />}>
							<HubView />
						</Suspense>
					) : activeTabId === "wiki-graph" ? (
						<Suspense fallback={<PanelLoadingFallback />}>
							<WikiGraphFullscreen />
						</Suspense>
					) : activeTabId === "browser" ? (
						<Suspense fallback={<PanelLoadingFallback />}>
							<BrowserPanel />
						</Suspense>
					) : activeWebSiteId ? (
						<Suspense fallback={<PanelLoadingFallback />}>
							{/* key：切站点必须换实例，否则原生视图的
							    attach/detach 生命周期会跨站点纠缠 */}
							<AiHubPanel key={activeWebSiteId} siteId={activeWebSiteId} />
						</Suspense>
					) : (
						<Suspense fallback={<PanelLoadingFallback />}>
							{/* 显式传 view：分屏时运行图与预览可能同时在两个组里，
							    跟随全局 centerView 会让两块渲染成同一个视图 */}
							<SandboxWorkspace
								view={activeTabId === "preview" ? "preview" : "graph"}
							/>
						</Suspense>
					)}
				</ViewTransition>
			)}
			{/* CLI 标签常挂不卸载：xterm 的滚动缓冲在渲染进程里，
			    卸载一次整段对话记录就没了 */}
			<CenterCliTabs tabs={cliTabs} activeTabId={activeTabId} />
		</div>
	);
}
