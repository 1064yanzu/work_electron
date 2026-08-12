/**
 * 终端标签栏
 * 管理多个终端标签的切换、创建和关闭
 */

import {
	Plus,
	Radio,
	Terminal as TerminalIcon,
	Waypoints,
	X,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import {
	terminalStore,
	useTerminalStoreSelector,
} from "../../lib/stores/terminalStore";
import { Tooltip } from "../ui/Tooltip";

const CHANNEL_LABELS: Record<string, string> = {
	feishu: "飞书",
	telegram: "Telegram",
	slack: "Slack",
	discord: "Discord",
	qqbot: "QQ",
	wechat: "微信",
	generic_webhook: "Webhook",
};

export function TerminalTabBar() {
	const allTerminals = useTerminalStoreSelector((s) => s.terminals);
	const activeId = useTerminalStoreSelector((s) => s.activeTerminalId);
	// 中栏 CLI 标签页托管的终端不在底部面板露面（见 TerminalPanel 注释）
	const terminals = useMemo(
		() => allTerminals.filter((t) => !t.hostedInCenter),
		[allTerminals],
	);

	const handleNewTerminal = useCallback(() => {
		terminalStore.createTerminal();
	}, []);

	const handleClose = useCallback((e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		terminalStore.destroyTerminal(id);
	}, []);

	const handleSelect = useCallback((id: string) => {
		terminalStore.setActiveTerminal(id);
	}, []);

	return (
		<div className="flex items-center h-9 bg-warm-50/80 border-b border-border px-1 gap-0.5 overflow-x-auto">
			{terminals.map((t) => {
				const isActive = t.id === activeId;
				const channel = t.remoteMeta?.channelId;
				const channelLabel = channel
					? (CHANNEL_LABELS[channel] ?? channel)
					: null;
				return (
					<button
						key={t.id}
						type="button"
						onClick={() => handleSelect(t.id)}
						className={`group flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
							isActive
								? "bg-surface text-text-primary shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
								: "text-text-muted hover:bg-surface/60"
						} ${t.isRemote ? "ring-1 ring-accent/30" : ""}${
							t.isHarness ? " ring-1 ring-terracotta/30" : ""
						}`}
					>
						{t.isRemote ? (
							<Radio className="w-3 h-3 text-accent" />
						) : t.isHarness ? (
							<Waypoints className="w-3 h-3 text-terracotta" />
						) : (
							<TerminalIcon className="w-3 h-3" />
						)}
						<span className="max-w-[140px] truncate">{t.name}</span>
						{t.isRemote && channelLabel && (
							<span className="px-1 py-px text-[9px] font-semibold rounded bg-accent/10 text-accent uppercase tracking-wide">
								{channelLabel}
							</span>
						)}
						{t.isHarness && (
							<span className="px-1 py-px text-[9px] font-semibold rounded bg-terracotta/10 text-terracotta uppercase tracking-wide">
								迁移
							</span>
						)}
						<Tooltip
							content={
								t.isRemote
									? "从桌面端移除"
									: t.isHarness
										? "结束该 CLI 会话"
										: "关闭终端"
							}
							placement="top"
						>
							<button
								type="button"
								onClick={(e) => handleClose(e, t.id)}
								className="opacity-0 group-hover:opacity-100 hover:bg-warm-300 dark:hover:bg-cream-700 rounded p-0.5 transition-[color,background-color,border-color,opacity,box-shadow,transform] cursor-pointer"
							>
								<X className="w-2.5 h-2.5" />
							</button>
						</Tooltip>
					</button>
				);
			})}

			{/* 新建终端按钮 */}
			<Tooltip content="新建终端" placement="top">
				<button
					type="button"
					onClick={handleNewTerminal}
					className="flex items-center justify-center w-6 h-6 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded transition-colors cursor-pointer shrink-0"
				>
					<Plus className="w-3.5 h-3.5" />
				</button>
			</Tooltip>
		</div>
	);
}
