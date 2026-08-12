/**
 * CenterCliTabs —— 中间栏「本地 coding agent」标签页的内容层。
 *
 * ## 为什么要单独一层、而且常挂不卸载
 *
 * 中栏其它标签都是"切走就卸载、切回来重建"。CLI 标签不行：xterm 的滚动缓冲在
 * 渲染进程里，组件一卸载，整段对话记录就没了（pty 还活着，但你看不到它说过
 * 什么）。所以这些面板全部常驻挂载，靠 `display:none` 切换可见性——与底部
 * TerminalPanel 同时渲染所有终端是同一个道理。
 *
 * 每个面板绝对定位铺满内容区：非 CLI 标签激活时它们整体 hidden，让下面的
 * ViewTransition 正常显示。
 *
 * ## 分屏后的取舍
 *
 * 常挂范围收敛到**本组内**的 CLI 标签（由调用方传入）。把一个 CLI 标签拖到
 * 另一个分屏会重建它的 xterm 视图，滚动缓冲要重新累积——pty 进程不受影响。
 * 换成"全局常挂 + 绝对定位到各组矩形"能保住缓冲，但要持续测量每个组的位置，
 * 代价与收益不成比例（跨组拖 CLI 标签是低频动作）。
 */

import { RotateCw, SquareTerminal, X } from "lucide-react";

import { useIpcListen } from "../../hooks/useIpcListen";
import { TerminalInstance } from "../Terminal/TerminalInstance";
import {
	centerTabsStore,
	type CenterTab,
} from "../../lib/stores/centerTabsStore";
import {
	terminalStore,
	useTerminalStoreSelector,
} from "../../lib/stores/terminalStore";
import { cn } from "../../lib/utils";
import { Tooltip } from "../ui/Tooltip";

export function CenterCliTabs({
	tabs,
	activeTabId,
}: {
	/** 本组内的 CLI 标签 */
	tabs: CenterTab[];
	activeTabId: string;
}) {
	// 托管终端的退出事件得有人接：底部 TerminalPanel 是按 isVisible 条件渲染的，
	// 它没挂载时那边的监听不存在，CLI 标签会一直显示"运行中"其实进程早没了。
	// 只处理 hostedInCenter 的，避免与 TerminalPanel 的监听重复处理同一个终端。
	useIpcListen<{ id: string }>("terminal-exit", (payload) => {
		const hosted = terminalStore
			.getState()
			.terminals.find((t) => t.id === payload.id && t.hostedInCenter);
		if (hosted) terminalStore.handleTerminalExit(payload.id);
	});

	if (tabs.length === 0) return null;

	return (
		<>
			{tabs.map((tab) => (
				<CliTabPanel key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
			))}
		</>
	);
}

function CliTabPanel({ tab, isActive }: { tab: CenterTab; isActive: boolean }) {
	// pty 退出后 terminalStore 会把实例摘掉，但标签留着——直接把标签也关了太粗暴，
	// 用户往往还要回看 CLI 最后吐了什么。这里改成显式的"已退出 + 重新启动"。
	const terminal = useTerminalStoreSelector((s) =>
		tab.terminalId
			? (s.terminals.find((t) => t.id === tab.terminalId) ?? null)
			: null,
	);
	const exited = Boolean(tab.terminalId) && !terminal;

	return (
		<div
			className={cn(
				"absolute inset-0 flex flex-col bg-surface",
				!isActive && "hidden",
			)}
		>
			<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
				<SquareTerminal
					className="h-3.5 w-3.5 shrink-0 text-text-muted"
					strokeWidth={1.5}
				/>
				<span className="shrink-0 text-xs font-medium text-text-primary">
					{tab.label ?? tab.harness ?? "CLI"}
				</span>
				{terminal ? (
					<span
						className="truncate text-[11px] text-text-muted"
						title={terminal.cwd}
					>
						{terminal.cwd}
					</span>
				) : null}
				{exited ? (
					<span className="shrink-0 rounded-full bg-warm-200 px-2 py-0.5 text-[10px] text-text-muted">
						进程已退出
					</span>
				) : null}

				<div className="ml-auto flex shrink-0 items-center gap-1">
					<Tooltip content="重新启动" placement="bottom">
						<button
							type="button"
							onClick={() => void centerTabsStore.restartCli(tab.id)}
							aria-label="重新启动"
							className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-warm-200 hover:text-text-primary"
						>
							<RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					</Tooltip>
					<Tooltip content="关闭标签页" placement="bottom">
						<button
							type="button"
							onClick={() => centerTabsStore.closeTab(tab.id)}
							aria-label="关闭标签页"
							className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-warm-200 hover:text-text-primary"
						>
							<X className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					</Tooltip>
				</div>
			</div>

			<div className="min-h-0 flex-1 px-2 py-1.5">
				{tab.terminalId ? (
					// key 用 terminalId：重启换了 pty 必须换 xterm 实例，
					// 否则新进程的输出会接在旧进程的缓冲后面
					<TerminalInstance
						key={tab.terminalId}
						terminalId={tab.terminalId}
						isActive={isActive}
					/>
				) : (
					<div className="flex h-full items-center justify-center text-xs text-text-muted">
						正在启动 {tab.label ?? tab.harness}…
					</div>
				)}
			</div>
		</div>
	);
}
