import { HelpCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AskUserQuestionRequest } from "../../lib/agent/askUserQuestionStore";
import { cn } from "../../lib/utils";

type AskUserQuestionCardProps = {
	request: AskUserQuestionRequest;
	onAllow: (requestId: string, updatedInput: Record<string, unknown>) => void;
	onDeny: (requestId: string, message?: string) => void;
};

type AnswerState = {
	selected: string[];
	other: string;
};

export function AskUserQuestionCard({
	request,
	onAllow,
	onDeny,
}: AskUserQuestionCardProps) {
	const [remaining, setRemaining] = useState(0);
	const [answers, setAnswers] = useState<Record<number, AnswerState>>({});

	useEffect(() => {
		const tick = () => {
			setRemaining(
				Math.max(0, Math.ceil((request.expiresAt - Date.now()) / 1000)),
			);
		};
		tick();
		const timer = setInterval(tick, 1000);
		return () => clearInterval(timer);
	}, [request.expiresAt]);

	const canSubmit = useMemo(() => {
		return request.questions.every((_question, index) => {
			const state = answers[index];
			if (!state) return false;
			return state.selected.length > 0 || state.other.trim().length > 0;
		});
	}, [answers, request.questions]);

	const updateSelected = (
		questionIndex: number,
		label: string,
		multiSelect: boolean,
	) => {
		setAnswers((prev) => {
			const current = prev[questionIndex] ?? { selected: [], other: "" };
			const selected = current.selected.includes(label)
				? current.selected.filter((item) => item !== label)
				: multiSelect
					? [...current.selected, label]
					: [label];
			return {
				...prev,
				[questionIndex]: { ...current, selected },
			};
		});
	};

	const updateOther = (questionIndex: number, value: string) => {
		setAnswers((prev) => ({
			...prev,
			[questionIndex]: {
				selected: prev[questionIndex]?.selected ?? [],
				other: value,
			},
		}));
	};

	const submit = () => {
		const responseAnswers = request.questions.map((question, index) => {
			const state = answers[index] ?? { selected: [], other: "" };
			return {
				header: question.header,
				question: question.question,
				selections: state.selected,
				other: state.other.trim() || undefined,
			};
		});
		onAllow(request.requestId, {
			questions: request.questions,
			answers: responseAnswers,
		});
	};

	return (
		<div className="rounded-xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-900/10 p-3 space-y-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-300" />
					<span className="text-sm font-medium text-blue-700 dark:text-blue-300">
						需要你确认细节
					</span>
				</div>
				<span className="text-xs text-blue-500 dark:text-blue-400">
					{remaining}s
				</span>
			</div>

			<div className="space-y-3">
				{request.questions.map((question, questionIndex) => {
					const state = answers[questionIndex] ?? { selected: [], other: "" };
					const multiSelect = question.multiSelect === true;
					return (
						<div
							key={`${request.requestId}-${questionIndex}`}
							className="space-y-2"
						>
							<div>
								<div className="text-xs text-blue-500 dark:text-blue-400">
									{question.header}
								</div>
								<div className="text-sm text-zinc-700 dark:text-zinc-200">
									{question.question}
								</div>
							</div>
							<div className="grid gap-2">
								{question.options.map((option) => {
									const checked = state.selected.includes(option.label);
									return (
										<button
											key={option.label}
											type="button"
											onClick={() =>
												updateSelected(questionIndex, option.label, multiSelect)
											}
											className={cn(
												"w-full text-left rounded-lg border px-3 py-2 transition-colors",
												checked
													? "border-blue-400 bg-blue-100/70 dark:bg-blue-900/30"
													: "border-zinc-200 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/40",
											)}
										>
											<div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
												{option.label}
											</div>
											<div className="text-xs text-zinc-500 dark:text-zinc-400">
												{option.description}
											</div>
										</button>
									);
								})}
							</div>
							<input
								type="text"
								placeholder="其他（可选）"
								value={state.other}
								onChange={(event) =>
									updateOther(questionIndex, event.target.value)
								}
								className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
							/>
						</div>
					);
				})}
			</div>

			<div className="flex gap-2">
				<button
					type="button"
					onClick={() => onDeny(request.requestId, "User denied")}
					className="flex-1 rounded-lg px-3 py-2 text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
				>
					拒绝
				</button>
				<button
					type="button"
					onClick={submit}
					disabled={!canSubmit}
					className="flex-1 rounded-lg px-3 py-2 text-sm bg-blue-600 text-white disabled:opacity-50"
				>
					提交答案
				</button>
			</div>
		</div>
	);
}

export function AskUserQuestionList(props: {
	requests: AskUserQuestionRequest[];
	onAllow: (requestId: string, updatedInput: Record<string, unknown>) => void;
	onDeny: (requestId: string, message?: string) => void;
}) {
	if (props.requests.length === 0) return null;
	return (
		<div className="space-y-3">
			{props.requests.map((request) => (
				<AskUserQuestionCard
					key={request.requestId}
					request={request}
					onAllow={props.onAllow}
					onDeny={props.onDeny}
				/>
			))}
		</div>
	);
}
