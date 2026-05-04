// 错误恢复提示组件
// 展示错误信息并提供恢复选项

import {
	AlertTriangle,
	ChevronDown,
	ChevronUp,
	Clock,
	Code,
	FileQuestion,
	Gauge,
	HelpCircle,
	Lock,
	RefreshCw,
	Server,
	SkipForward,
	Wifi,
	Wrench,
	XCircle,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useAgentStore } from "../../lib/agent/store";
import {
	ERROR_CATEGORY_CONFIG,
	type ErrorRecoveryStrategy,
	type RecoverySuggestion,
} from "../../lib/agent/types";
import { cn } from "../../lib/utils";

// 图标映射
const IconMap: Record<string, React.ElementType> = {
	Wifi,
	Clock,
	Lock,
	AlertTriangle,
	FileQuestion,
	Gauge,
	Server,
	Code,
	HelpCircle,
};

// 操作图标
const ActionIcons: Record<RecoverySuggestion["action"], React.ElementType> = {
	retry: RefreshCw,
	skip: SkipForward,
	alternative: Wrench,
	manual: Wrench,
	abort: XCircle,
};

// 获取类别图标
function getCategoryIcon(iconName: string): React.ElementType {
	return IconMap[iconName] || HelpCircle;
}

// 恢复建议按钮
function SuggestionButton({
	suggestion,
	onSelect,
	isLoading,
}: {
	suggestion: RecoverySuggestion;
	onSelect: (suggestion: RecoverySuggestion) => void;
	isLoading: boolean;
}) {
	const Icon = ActionIcons[suggestion.action];

	const colorClasses: Record<RecoverySuggestion["action"], string> = {
		retry: "bg-blue-500 hover:bg-blue-600 text-white",
		skip: "bg-warm-200 hover:bg-warm-300 dark:hover:bg-cream-700 text-text-secondary",
		alternative: "bg-purple-500 hover:bg-purple-600 text-white",
		manual: "bg-amber-500 hover:bg-amber-600 text-white",
		abort:
			"bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400",
	};

	return (
		<button
			onClick={() => onSelect(suggestion)}
			disabled={isLoading}
			className={cn(
				"flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
				"disabled:opacity-50 disabled:cursor-not-allowed",
				suggestion.isRecommended
					? "ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-zinc-900"
					: "",
				colorClasses[suggestion.action],
			)}
		>
			{isLoading ? (
				<RefreshCw className="w-4 h-4 animate-spin" />
			) : (
				<Icon className="w-4 h-4" />
			)}
			<span>{suggestion.label}</span>
			{suggestion.isRecommended && (
				<span className="text-xs opacity-75">推荐</span>
			)}
		</button>
	);
}

// 错误详情面板
function ErrorDetails({
	strategy,
	isExpanded,
	onToggle,
}: {
	strategy: ErrorRecoveryStrategy;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const config = ERROR_CATEGORY_CONFIG[strategy.category];
	const Icon = getCategoryIcon(config.icon);

	return (
		<div className="space-y-3">
			{/* 错误头部 */}
			<div className="flex items-start gap-3">
				<div
					className={cn(
						"p-2 rounded-lg",
						strategy.category === "unknown"
							? "bg-warm-200"
							: "bg-red-50 dark:bg-red-900/20",
					)}
				>
					<Icon className={cn("w-5 h-5", config.color)} />
				</div>
				<div className="flex-1 min-w-0">
					<h4 className="text-sm font-semibold text-text-primary">
						{strategy.title}
					</h4>
					<p className={cn("text-xs mt-0.5", config.color)}>{config.label}</p>
				</div>
			</div>

			{/* 错误描述 */}
			<div className="text-sm text-text-secondary leading-relaxed">
				{strategy.description.split("\n").map((line, idx) => (
					<p key={idx} className={idx > 0 ? "mt-2" : ""}>
						{line}
					</p>
				))}
			</div>

			{/* 展开/收起详情 */}
			<button
				onClick={onToggle}
				className="flex items-center gap-1 text-xs text-text-light hover:text-text-secondary dark:hover:text-text-light transition-colors"
			>
				{isExpanded ? (
					<>
						<ChevronUp className="w-3.5 h-3.5" />
						收起详情
					</>
				) : (
					<>
						<ChevronDown className="w-3.5 h-3.5" />
						查看详情
					</>
				)}
			</button>

			{/* 详细信息 */}
			{isExpanded && (
				<div className="p-3 bg-warm-50/50 rounded-lg text-xs text-text-muted space-y-2 animate-in fade-in slide-in-from-top-2">
					<div className="flex items-center gap-2">
						<span className="font-medium">错误类型:</span>
						<span className={config.color}>{config.label}</span>
					</div>
					{strategy.canAutoRetry && (
						<div className="flex items-center gap-2">
							<span className="font-medium">自动重试:</span>
							<span className="text-green-500">支持</span>
							{strategy.retryDelay && (
								<span className="text-text-light">
									(延迟 {strategy.retryDelay / 1000}s)
								</span>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// 主组件
export default function ErrorRecovery({
	onAction,
}: {
	onAction?: (
		action: RecoverySuggestion["action"],
		suggestion: RecoverySuggestion,
	) => void;
}) {
	const { pendingErrorRecovery, clearPendingErrorRecovery } = useAgentStore();
	const [isExpanded, setIsExpanded] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedAction, setSelectedAction] = useState<string | null>(null);

	// 没有待处理的错误时不显示
	if (!pendingErrorRecovery) {
		return null;
	}

	const { strategy } = pendingErrorRecovery;

	const handleSelect = async (suggestion: RecoverySuggestion) => {
		setIsLoading(true);
		setSelectedAction(suggestion.id);

		try {
			// 调用外部处理函数
			if (onAction) {
				onAction(suggestion.action, suggestion);
			}

			// 清除待处理的错误
			setTimeout(() => {
				clearPendingErrorRecovery();
				setIsLoading(false);
				setSelectedAction(null);
			}, 500);
		} catch (error) {
			setIsLoading(false);
			setSelectedAction(null);
		}
	};

	return (
		<div className="rounded-xl overflow-hidden bg-surface ring-1 ring-red-200 dark:ring-red-800/50 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
			{/* 警告条 */}
			<div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 flex items-center gap-2">
				<AlertTriangle className="w-4 h-4 text-red-500" />
				<span className="text-sm font-medium text-red-600 dark:text-red-400">
					任务执行遇到问题
				</span>
			</div>

			{/* 内容区 */}
			<div className="p-4 space-y-4">
				{/* 错误详情 */}
				<ErrorDetails
					strategy={strategy}
					isExpanded={isExpanded}
					onToggle={() => setIsExpanded(!isExpanded)}
				/>

				{/* 恢复选项 */}
				<div className="space-y-2">
					<p className="text-xs font-medium text-text-muted">请选择操作:</p>
					<div className="flex flex-wrap gap-2">
						{strategy.suggestions.map((suggestion) => (
							<SuggestionButton
								key={suggestion.id}
								suggestion={suggestion}
								onSelect={handleSelect}
								isLoading={isLoading && selectedAction === suggestion.id}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

// 内联版本（用于工具调用卡片内）
export function ErrorRecoveryInline({
	strategy,
	onAction,
}: {
	strategy: ErrorRecoveryStrategy;
	onAction: (
		action: RecoverySuggestion["action"],
		suggestion: RecoverySuggestion,
	) => void;
}) {
	const config = ERROR_CATEGORY_CONFIG[strategy.category];
	const Icon = getCategoryIcon(config.icon);

	return (
		<div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg space-y-3">
			<div className="flex items-center gap-2">
				<Icon className={cn("w-4 h-4", config.color)} />
				<span className="text-sm font-medium text-red-600 dark:text-red-400">
					{config.label}
				</span>
			</div>

			<p className="text-xs text-text-secondary">
				{strategy.description.split("\n")[0]}
			</p>

			<div className="flex flex-wrap gap-2">
				{strategy.suggestions.slice(0, 3).map((suggestion) => (
					<button
						key={suggestion.id}
						onClick={() => onAction(suggestion.action, suggestion)}
						className={cn(
							"px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
							suggestion.isRecommended
								? "bg-blue-500 text-white hover:bg-blue-600"
								: "bg-warm-200 text-text-secondary hover:bg-warm-300 dark:hover:bg-cream-700",
						)}
					>
						{suggestion.label}
					</button>
				))}
			</div>
		</div>
	);
}

export { ErrorRecovery };
