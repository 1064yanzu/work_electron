/**
 * AskUserQuestion 交互卡片
 * 渲染 Claude Code 的 AskUserQuestion 工具调用为交互式 UI
 * 支持单选/多选，选择后回传答案
 */
import { HelpCircle, CheckCircle2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { SessionToolCall } from '../../../lib/stores/codingSessionTypes';

interface AskUserQuestionOption {
	label: string;
	description?: string;
	preview?: string;
}

interface AskUserQuestionInput {
	questions?: Array<{
		question: string;
		header?: string;
		options: AskUserQuestionOption[];
		multiSelect?: boolean;
	}>;
}

interface AskUserQuestionCardProps {
	toolCall: SessionToolCall;
	onAnswer?: (requestId: string, answers: Record<string, string>) => void;
}

export function AskUserQuestionCard({ toolCall, onAnswer }: AskUserQuestionCardProps) {
	const input = toolCall.input as unknown as AskUserQuestionInput;
	const questions = input?.questions ?? [];
	const [selections, setSelections] = useState<Record<number, Set<number>>>({}); // questionIdx -> Set<optionIdx>
	const [answered, setAnswered] = useState(false);
	const isCompleted = toolCall.status === 'completed' || answered;

	const handleToggle = useCallback(
		(questionIdx: number, optionIdx: number, multiSelect: boolean) => {
			if (isCompleted) return;
			setSelections((prev) => {
				const current = prev[questionIdx] ?? new Set<number>();
				const next = new Set(current);
				if (multiSelect) {
					if (next.has(optionIdx)) {
						next.delete(optionIdx);
					} else {
						next.add(optionIdx);
					}
				} else {
					next.clear();
					next.add(optionIdx);
				}
				return { ...prev, [questionIdx]: next };
			});
		},
		[isCompleted],
	);

	const handleSubmit = useCallback(() => {
		if (isCompleted || !onAnswer) return;

		const answers: Record<string, string> = {};
		for (const [qIdx, selectedSet] of Object.entries(selections)) {
			const question = questions[Number(qIdx)];
			if (!question) continue;
			const selectedLabels = Array.from(selectedSet)
				.map((optIdx) => question.options[optIdx]?.label)
				.filter(Boolean);
			answers[question.question] = selectedLabels.join(', ');
		}

		onAnswer(toolCall.id, answers);
		setAnswered(true);
	}, [isCompleted, onAnswer, selections, questions, toolCall.id]);

	if (questions.length === 0) {
		return null;
	}

	return (
		<div className={`rounded-xl border overflow-hidden transition-all ${
			isCompleted
				? 'border-emerald-200 dark:border-emerald-800/30 bg-emerald-50/50 dark:bg-emerald-900/10'
				: 'border-blue-200 dark:border-blue-800/30 bg-blue-50/50 dark:bg-blue-900/10'
		}`}>
			{/* 头部 */}
			<div className={`flex items-center gap-2 px-4 py-2.5 border-b ${
				isCompleted
					? 'border-emerald-200/50 dark:border-emerald-700/30'
					: 'border-blue-200/50 dark:border-blue-700/30'
			}`}>
				{isCompleted ? (
					<CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
				) : (
					<HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
				)}
				<span className={`text-sm font-medium ${
					isCompleted
						? 'text-emerald-800 dark:text-emerald-300'
						: 'text-blue-800 dark:text-blue-300'
				}`}>
					{isCompleted ? '已回答' : '需要你的选择'}
				</span>
			</div>

			{/* 问题列表 */}
			<div className="px-4 py-3 space-y-4">
				{questions.map((q, qIdx) => (
					<div key={qIdx}>
						{/* 问题文本 */}
						<p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium mb-2.5">
							{q.header && (
								<span className="text-[10px] font-bold uppercase text-zinc-400 mr-2">
									{q.header}
								</span>
							)}
							{q.question}
						</p>

						{/* 选项 */}
						<div className="space-y-1.5">
							{q.options.map((opt, optIdx) => {
								const isSelected = selections[qIdx]?.has(optIdx) ?? false;
								return (
									<button
										key={optIdx}
										onClick={() => handleToggle(qIdx, optIdx, q.multiSelect ?? false)}
										disabled={isCompleted}
										className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
											isCompleted
												? isSelected
													? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30'
													: 'border-zinc-200 dark:border-zinc-700/50 opacity-50'
												: isSelected
													? 'border-[#D96C46]/40 bg-[#D96C46]/5 ring-1 ring-[#D96C46]/20'
													: 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-800'
										}`}
									>
										{/* 选择指示 */}
										<div className={`shrink-0 w-4 h-4 mt-0.5 rounded-${q.multiSelect ? 'sm' : 'full'} border-2 flex items-center justify-center transition-all ${
											isSelected
												? isCompleted
													? 'border-emerald-500 bg-emerald-500'
													: 'border-[#D96C46] bg-[#D96C46]'
												: 'border-zinc-300 dark:border-zinc-600'
										}`}>
											{isSelected && (
												<svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
													<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
												</svg>
											)}
										</div>

										<div className="flex-1 min-w-0">
											<div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
												{opt.label}
											</div>
											{opt.description && (
												<div className="text-xs text-zinc-500 mt-0.5">
													{opt.description}
												</div>
											)}
										</div>
									</button>
								);
							})}
						</div>
					</div>
				))}
			</div>

			{/* 提交按钮 */}
			{!isCompleted && (
				<div className="px-4 py-3 border-t border-blue-200/50 dark:border-blue-700/30">
					<button
						onClick={handleSubmit}
						disabled={Object.keys(selections).length === 0 || Object.values(selections).every((s) => s.size === 0)}
						className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#D96C46] hover:bg-[#c05e3b] active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
					>
						确认选择
					</button>
				</div>
			)}
		</div>
	);
}
