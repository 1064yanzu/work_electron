/**
 * 沙盒底部终端面板
 * 包含三个 Tab：Bolt（dev server 日志）/ Output（构建日志）/ Terminal（交互式 shell）
 */

import { ChevronDown, Minus, Terminal as TerminalIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../../lib/utils";

// ==================== 常量 ====================

type DockTab = "bolt" | "output" | "terminal";

const MAX_LOG_LINES = 5000;

const DOCK_TABS: Array<{ id: DockTab; label: string; icon?: boolean }> = [
	{ id: "bolt", label: "Bolt" },
	{ id: "output", label: "Output" },
	{ id: "terminal", label: "Terminal", icon: true },
];

// ==================== ANSI 处理 ====================

/** 简单的 ANSI 转义序列处理：移除控制码，保留纯文本 */
function stripAnsi(text: string): string {
	// biome-ignore lint: ANSI escape removal regex
	return text.replace(
		/[][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~]/g,
		"",
	);
}

// ==================== 日志显示组件 ====================

interface LogViewProps {
	lines: string[];
	scrollRef: React.RefObject<HTMLDivElement | null>;
}

const LogView = memo(function LogView({ lines, scrollRef }: LogViewProps) {
	// 限制最大行数
	const visibleLines = useMemo(
		() => (lines.length > MAX_LOG_LINES ? lines.slice(-MAX_LOG_LINES) : lines),
		[lines],
	);

	if (visibleLines.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center text-text-light text-xs bg-[#1a1b26]">
				暂无日志输出
			</div>
		);
	}

	return (
		<div
			ref={scrollRef as React.RefObject<HTMLDivElement>}
			className="flex-1 overflow-y-auto bg-[#1a1b26] p-3 font-mono text-xs leading-5"
		>
			{visibleLines.map((line, index) => (
				<div
					key={index}
					className="text-[#a9b1d6] whitespace-pre-wrap break-all"
				>
					{stripAnsi(line)}
				</div>
			))}
		</div>
	);
});

// ==================== 终端占位组件 ====================

interface TerminalPlaceholderProps {
	sandboxDir: string;
}

const TerminalPlaceholder = memo(function TerminalPlaceholder({
	sandboxDir,
}: TerminalPlaceholderProps) {
	return (
		<div className="flex-1 flex flex-col items-center justify-center bg-[#1a1b26] text-text-light gap-3">
			<TerminalIcon className="w-8 h-8 opacity-40" />
			<div className="text-center">
				<p className="text-xs text-text-muted">沙盒终端</p>
				<p className="text-[11px] text-text-light mt-1 max-w-[280px] truncate">
					{sandboxDir}
				</p>
			</div>
		</div>
	);
});

// ==================== SandboxTerminalDock ====================

interface SandboxTerminalDockProps {
	/** 任务 ID（保留给后续接入交互式 shell 使用） */
	taskId: string;
	/** 沙盒目录路径 */
	sandboxDir: string;
	/** dev server 日志 */
	logs: string[];
	/** 清空日志回调 */
	onClearLogs?: () => void;
	/** 折叠回调（外部 Panel 控制实际折叠效果） */
	onCollapse?: () => void;
}

export function SandboxTerminalDock({
	taskId: _taskId,
	sandboxDir,
	logs,
	onClearLogs,
	onCollapse,
}: SandboxTerminalDockProps) {
	const [activeTab, setActiveTab] = useState<DockTab>("bolt");

	const boltScrollRef = useRef<HTMLDivElement>(null);
	const outputScrollRef = useRef<HTMLDivElement>(null);

	// 新日志到来时自动滚动到底部
	useEffect(() => {
		if (activeTab === "bolt" && boltScrollRef.current) {
			const el = boltScrollRef.current;
			// 仅在用户已在底部附近时自动滚动
			const isNearBottom =
				el.scrollHeight - el.scrollTop - el.clientHeight < 80;
			if (isNearBottom) {
				el.scrollTop = el.scrollHeight;
			}
		}
	}, [logs, activeTab]);

	// 切换 tab 时滚动到底部
	useEffect(() => {
		const ref = activeTab === "bolt" ? boltScrollRef : outputScrollRef;
		if (ref.current) {
			ref.current.scrollTop = ref.current.scrollHeight;
		}
	}, [activeTab]);

	const handleClear = useCallback(() => {
		onClearLogs?.();
	}, [onClearLogs]);

	const handleScrollToBottom = useCallback(() => {
		const ref = activeTab === "bolt" ? boltScrollRef : outputScrollRef;
		if (ref.current) {
			ref.current.scrollTop = ref.current.scrollHeight;
		}
	}, [activeTab]);

	// Output tab 使用相同的 logs 数据（由外部决定传入什么）
	const outputLines = useMemo(() => logs, [logs]);

	return (
		<div className="flex flex-col h-full">
			{/* Tab 栏 + 工具按钮 */}
			<div className="flex items-center h-9 bg-warm-50/80 dark:bg-cream-900/80 border-b border-border px-1 shrink-0">
				{/* Tab 列表 */}
				<div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
					{DOCK_TABS.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={cn(
								"flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer shrink-0",
								activeTab === tab.id
									? "bg-surface text-text-primary shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
									: "text-text-muted hover:bg-surface/60 hover:text-text-secondary",
							)}
						>
							{tab.icon ? <TerminalIcon className="w-3 h-3" /> : null}
							{tab.label}
						</button>
					))}
				</div>

				{/* 工具按钮 */}
				<div className="flex items-center gap-0.5 shrink-0">
					<button
						type="button"
						onClick={handleClear}
						className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-light hover:text-text-secondary rounded transition-colors cursor-pointer"
						title="清空日志"
					>
						<Minus className="w-3 h-3" />
						清空
					</button>
					<button
						type="button"
						onClick={handleScrollToBottom}
						className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-light hover:text-text-secondary rounded transition-colors cursor-pointer"
						title="跳到底部"
					>
						<ChevronDown className="w-3 h-3" />
					</button>
					{onCollapse ? (
						<button
							type="button"
							onClick={onCollapse}
							className="flex items-center px-1.5 py-1 text-text-light hover:text-text-secondary rounded transition-colors cursor-pointer"
							title="折叠面板"
						>
							<ChevronDown className="w-3.5 h-3.5" />
						</button>
					) : null}
				</div>
			</div>

			{/* 内容区域 */}
			<div className="flex-1 min-h-0">
				{activeTab === "bolt" ? (
					<LogView lines={logs} scrollRef={boltScrollRef} />
				) : activeTab === "output" ? (
					<LogView lines={outputLines} scrollRef={outputScrollRef} />
				) : (
					<TerminalPlaceholder sandboxDir={sandboxDir} />
				)}
			</div>
		</div>
	);
}
