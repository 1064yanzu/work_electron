/**
 * CodingStatusBar — 底部状态栏
 * 显示后端标识 + 审批模式 + 编码模式 + Git 分支 + Token 用量
 */
import { useMemo } from 'react';
import {
	GitBranch,
	Shield,
	Cpu,
	Code2,
	Coins,
} from 'lucide-react';
import { useCodingThreadSelector } from '../../lib/stores/codingThreadStore';
import { useCodingWorkspaceSelector } from '../../lib/stores/codingWorkspaceStore';
import { useCodingSessionSelector } from '../../lib/stores/codingSessionStore';

/** 审批模式的中文标签映射 */
const APPROVAL_LABELS: Record<string, string> = {
	default: '默认权限',
	acceptEdits: '接受编辑',
	bypassPermissions: '完全访问',
	dontAsk: '自动批准',
	plan: '仅规划',
	untrusted: '不受信任',
	'on-request': '按需审批',
	'on-failure': '失败时审批',
	never: '完全访问',
};

const MODE_LABELS: Record<string, string> = {
	code: 'Code',
	plan: 'Plan',
	ask: 'Ask',
};

const BACKEND_LABELS: Record<string, string> = {
	'claude-code': 'Claude Code',
	codex: 'Codex',
};

function formatTokenCount(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
	return String(count);
}

export function CodingStatusBar() {
	const activeThread = useCodingThreadSelector((s) =>
		s.activeThreadId ? s.threads.find((t) => t.id === s.activeThreadId) : null
	);
	const gitStatus = useCodingWorkspaceSelector((s) => s.gitStatus);
	const usage = useCodingSessionSelector((s) => s.usage);

	const approvalLabel = useMemo(() => {
		if (!activeThread) return '默认权限';
		return APPROVAL_LABELS[activeThread.approvalMode] || activeThread.approvalMode;
	}, [activeThread]);

	// 修复：gitStatus.branch 是顶层属性，不嵌套在 .status 下
	const branch = gitStatus?.branch ?? null;
	const backendLabel = activeThread ? (BACKEND_LABELS[activeThread.backend] || activeThread.backend) : null;
	const modeLabel = activeThread ? (MODE_LABELS[activeThread.codingMode] || activeThread.codingMode) : null;
	const hasUsage = usage.inputTokens > 0 || usage.outputTokens > 0;

	return (
		<div className="flex items-center justify-between px-3 py-1 bg-[#f0f0ef] dark:bg-[#111111] border-t border-black/[0.06] dark:border-white/[0.06] text-[11px] text-zinc-500 dark:text-zinc-400">
			<div className="flex items-center gap-3">
				{/* 后端标识 */}
				{backendLabel && (
					<span className="flex items-center gap-1">
						<Cpu className="h-3 w-3" />
						{backendLabel}
					</span>
				)}

				{/* 编码模式 */}
				{modeLabel && (
					<span className="flex items-center gap-1">
						<Code2 className="h-3 w-3" />
						{modeLabel}
					</span>
				)}

				{/* 审批模式 */}
				<span className="flex items-center gap-1">
					<Shield className="h-3 w-3" />
					{approvalLabel}
				</span>
			</div>

			<div className="flex items-center gap-3">
				{/* Token 用量 */}
				{hasUsage && (
					<span className="flex items-center gap-1 font-mono">
						<Coins className="h-3 w-3" />
						{formatTokenCount(usage.inputTokens + usage.outputTokens)}
						{usage.costUsd > 0 && (
							<span className="text-zinc-400 dark:text-zinc-500">
								(${usage.costUsd.toFixed(3)})
							</span>
						)}
					</span>
				)}

				{/* Git 分支 */}
				{branch && (
					<span className="flex items-center gap-1">
						<GitBranch className="h-3 w-3" />
						{branch}
					</span>
				)}
			</div>
		</div>
	);
}
