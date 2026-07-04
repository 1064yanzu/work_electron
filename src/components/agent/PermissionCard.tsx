// 工具权限确认卡片
// 显示待处理的权限请求，让用户确认或拒绝

import {
	AlertTriangle,
	BookOpen,
	Camera,
	ChevronDown,
	ChevronUp,
	Clock,
	ExternalLink,
	FilePlus,
	FileText,
	FolderOpen,
	Globe,
	type LucideIcon,
	MessageSquare,
	PenLine,
	Plug,
	Search,
	Shield,
	ShieldAlert,
	ShieldCheck,
	Terminal,
	Wrench,
	Zap,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import {
	type PermissionRequest,
	type PermissionResponse,
	TOOL_NAMES,
	type ToolRiskLevel,
	type ToolType,
} from "../../lib/agent/types";

// 工具类型到图标的映射
const TOOL_ICON_MAP: Record<ToolType, LucideIcon> = {
	web_search: Search,
	kb_search_chunks: BookOpen,
	fetch_url: Globe,
	doc_create: FilePlus,
	doc_update: FileText,
	doc_patch: PenLine,
	mcp_call: Plug,
	file_read: FileText,
	file_write: FilePlus,
	file_list: FileText,
	code_execute: Terminal,
	browser_open: ExternalLink,
	browser_screenshot: Camera,
	llm_call: MessageSquare,
	skill_call: PenLine,
	skill_invoke: Zap,
	custom: Wrench,
};

interface PermissionCardProps {
	request: PermissionRequest;
	onRespond: (response: PermissionResponse) => void;
	/** 是否绑定全局键盘快捷键（默认 true） */
	isFocused?: boolean;
}

// 风险等级配置
const RISK_CONFIG: Record<
	ToolRiskLevel,
	{
		icon: React.ElementType;
		color: string;
		bgColor: string;
		label: string;
	}
> = {
	L0: {
		icon: ShieldCheck,
		color: "text-success",
		bgColor: "bg-success/8 dark:bg-emerald-900/20",
		label: "低风险",
	},
	L1: {
		icon: Shield,
		color: "text-peach-500",
		bgColor: "bg-peach-100 dark:bg-amber-900/20",
		label: "中风险",
	},
	L2: {
		icon: ShieldAlert,
		color: "text-error",
		bgColor: "bg-[rgba(181,51,51,0.08)] dark:bg-red-900/20",
		label: "高风险",
	},
};

export function PermissionCard({
	request,
	onRespond,
	isFocused = true,
}: PermissionCardProps) {
	const [expanded, setExpanded] = useState(false);
	const [rememberForSession, setRememberForSession] = useState(false);
	const [rememberForTool, setRememberForTool] = useState(false);
	const [remainingTime, setRemainingTime] = useState(0);

	const riskConfig = RISK_CONFIG[request.riskLevel];
	const RiskIcon = riskConfig.icon;
	const toolName = TOOL_NAMES[request.toolType] || request.toolName;
	const ToolIcon = TOOL_ICON_MAP[request.toolType] || Wrench;

	// 倒计时
	useEffect(() => {
		const updateRemaining = () => {
			const remaining = Math.max(
				0,
				Math.ceil((request.expiresAt - Date.now()) / 1000),
			);
			setRemainingTime(remaining);
		};

		updateRemaining();
		const interval = setInterval(updateRemaining, 1000);
		return () => clearInterval(interval);
	}, [request.expiresAt]);

	const handleAllow = () => {
		onRespond({
			requestId: request.id,
			decision: "allowed",
			decidedBy: "user",
			rememberForSession,
			rememberForTool,
		});
	};

	const handleDeny = () => {
		onRespond({
			requestId: request.id,
			decision: "denied",
			decidedBy: "user",
			reason: "User denied",
			rememberForSession,
			rememberForTool,
		});
	};

	const handleAllowAlways = () => {
		onRespond({
			requestId: request.id,
			decision: "allowed",
			decidedBy: "user",
			rememberForSession: true,
			rememberForTool: true,
		});
	};

	// 键盘快捷键：Y/Enter = allow, N/Esc = deny, A = allow + remember
	useEffect(() => {
		if (!isFocused) return;
		const handler = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (target) {
				const tag = target.tagName?.toUpperCase();
				if (
					tag === "INPUT" ||
					tag === "TEXTAREA" ||
					tag === "SELECT" ||
					target.isContentEditable
				)
					return;
			}
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const key = e.key;
			if (key === "y" || key === "Y" || key === "Enter") {
				e.preventDefault();
				handleAllow();
				return;
			}
			if (key === "n" || key === "N" || key === "Escape") {
				e.preventDefault();
				handleDeny();
				return;
			}
			if (key === "a" || key === "A") {
				e.preventDefault();
				handleAllowAlways();
				return;
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
		// 依赖收缩：handleAllow / handleDeny 都是 inline，但引用 onRespond + request.id
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isFocused, onRespond, request.id, rememberForSession, rememberForTool]);

	return (
		<div
			className={`rounded-xl border ${riskConfig.bgColor} border-black/5 dark:border-white/10 overflow-hidden border-l-[3px] ${
				request.riskLevel === "L2"
					? "border-l-error/60"
					: request.riskLevel === "L1"
						? "border-l-peach-500/70"
						: "border-l-success/50"
			}`}
		>
			{/* 头部 */}
			<div className="p-4">
				<div className="flex items-start gap-3">
					{/* 工具图标 */}
					<div className={`p-2 rounded-lg ${riskConfig.bgColor}`}>
						<ToolIcon className={`w-5 h-5 ${riskConfig.color}`} />
					</div>

					{/* 信息 */}
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-1">
							<span className="font-medium text-text-primary dark:text-zinc-200">
								{toolName}
							</span>
							<span
								className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${riskConfig.bgColor} ${riskConfig.color}`}
							>
								<RiskIcon className="w-3 h-3" />
								{riskConfig.label}
							</span>
						</div>
						<p className="text-sm text-text-muted">
							请求执行此工具，需要您的确认
						</p>
					</div>

					{/* 倒计时 */}
					<div className="flex items-center gap-1 text-sm text-text-light">
						<Clock className="w-4 h-4" />
						<span>{remainingTime}s</span>
					</div>
				</div>

				{/* 参数预览（可展开） */}
				<div className="mt-3">
					<button
						onClick={() => setExpanded(!expanded)}
						className="flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary dark:hover:text-text-light transition-colors"
					>
						{expanded ? (
							<ChevronUp className="w-4 h-4" />
						) : (
							<ChevronDown className="w-4 h-4" />
						)}
						查看参数
					</button>
					{expanded && (
						<pre className="mt-2 p-3 rounded-lg bg-black/5 text-xs text-text-secondary overflow-x-auto max-h-40 overflow-y-auto">
							{request.inputPreview}
						</pre>
					)}
				</div>

				{/* 沙盒外操作警告 */}
				{request.scope && !request.scope.insideSandbox && (
					<div
						className={`mx-4 mb-3 px-3 py-2 rounded-lg flex items-start gap-2 text-xs ${
							request.scope.destructiveLevel === "dangerous"
								? "bg-[rgba(181,51,51,0.08)]/80 dark:bg-red-950/30 text-error dark:text-error"
								: "bg-peach-100/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
						}`}
					>
						<FolderOpen className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
						<div className="min-w-0">
							<div className="font-medium mb-0.5 flex items-center gap-1">
								{request.scope.destructiveLevel === "dangerous" && (
									<AlertTriangle className="w-3 h-3" />
								)}
								{request.scope.destructiveLevel === "dangerous"
									? "危险操作 — 此命令可能造成不可逆的修改"
									: "此操作将修改沙盒外的文件"}
							</div>
							{request.scope.targetPath && (
								<div className="text-[11px] opacity-80 break-all font-mono">
									{request.scope.targetPath}
								</div>
							)}
							{request.scope.reason && (
								<div className="text-[11px] opacity-70 mt-0.5">
									{request.scope.reason}
								</div>
							)}
						</div>
					</div>
				)}
			</div>

			{/* 记住选择 */}
			<div className="px-4 pb-3 flex flex-wrap gap-4 text-sm">
				<label className="flex items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						checked={rememberForSession}
						onChange={(e) => setRememberForSession(e.target.checked)}
						className="rounded border-cream-400 dark:border-cream-500"
					/>
					<span className="text-text-secondary">本次会话记住</span>
				</label>
				<label className="flex items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						checked={rememberForTool}
						onChange={(e) => setRememberForTool(e.target.checked)}
						className="rounded border-cream-400 dark:border-cream-500"
					/>
					<span className="text-text-secondary">对此工具记住</span>
				</label>
			</div>

			{/* 操作按钮 */}
			<div className="flex border-t border-black/5 dark:border-white/10">
				<button
					onClick={handleDeny}
					className="flex-1 py-3 text-sm font-medium text-text-secondary hover:bg-black/5 dark:hover:bg-surface/5 transition-colors"
					title="N / Esc"
				>
					拒绝 (N)
				</button>
				<div className="w-px bg-black/10 dark:bg-white/10" />
				<button
					onClick={handleAllowAlways}
					className="px-4 py-3 text-sm font-medium text-text-secondary hover:bg-black/5 dark:hover:bg-surface/5 transition-colors"
					title="A — 本会话内所有同类工具自动允许"
				>
					全允 (A)
				</button>
				<div className="w-px bg-black/10 dark:bg-white/10" />
				<button
					onClick={handleAllow}
					className="flex-1 py-3 text-sm font-medium text-success hover:bg-success/8 dark:hover:bg-emerald-900/20 transition-colors"
					title="Y / Enter"
				>
					允许 (Y)
				</button>
			</div>
		</div>
	);
}

// 权限请求列表组件
interface PermissionListProps {
	requests: PermissionRequest[];
	onRespond: (response: PermissionResponse) => void;
}

export function PermissionList({ requests, onRespond }: PermissionListProps) {
	if (requests.length === 0) return null;

	return (
		<div className="space-y-3">
			{requests.map((request, idx) => (
				<PermissionCard
					key={request.id}
					request={request}
					onRespond={onRespond}
					isFocused={idx === 0}
				/>
			))}
		</div>
	);
}
