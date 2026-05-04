/**
 * AskUserQuestionCard - Agent 向用户提问的浮动弹窗
 *
 * 以底部弹窗形式展示，一次只显示一个问题。
 * 单选：用户点选后自动跳转下一题；多选：需手动点下一步。
 * 所有问题回答完后统一提交。
 */

import {
	Check,
	ChevronRight,
	MessageCircleQuestion,
	Send,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AskUserQuestionRequest } from "../../lib/agent/askUserQuestionStore";
import { cn } from "../../lib/utils";
import "./AskUserQuestionCard.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AnswerState = { selected: string[]; other: string };

/* ------------------------------------------------------------------ */
/*  CountdownBar – 顶部线性进度条倒计时                                 */
/* ------------------------------------------------------------------ */

function CountdownBar({
	remaining,
	total,
}: {
	remaining: number;
	total: number;
}) {
	const progress = total > 0 ? (remaining / total) * 100 : 0;
	const isUrgent = remaining <= 10;
	return (
		<div className="auq-countdown-bar">
			<div
				className={cn("auq-countdown-fill", isUrgent && "auq-countdown-urgent")}
				style={{ width: `${progress}%`, transition: "width 1s linear" }}
			/>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  OptionButton – 选项按钮                                            */
/* ------------------------------------------------------------------ */

function OptionButton({
	label,
	description,
	checked,
	onClick,
	index,
}: {
	label: string;
	description: string;
	checked: boolean;
	onClick: () => void;
	index: number;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn("auq-option", checked && "auq-option-selected")}
			style={{ animationDelay: `${index * 50}ms` }}
		>
			<div
				className={cn("auq-option-check", checked && "auq-option-check-active")}
			>
				{checked && <Check className="w-3 h-3" />}
			</div>
			<div className="auq-option-content">
				<div className="auq-option-label">{label}</div>
				{description && <div className="auq-option-desc">{description}</div>}
			</div>
		</button>
	);
}

/* ------------------------------------------------------------------ */
/*  AskUserQuestionPopup – 单个 request 的弹窗                         */
/* ------------------------------------------------------------------ */

function AskUserQuestionPopup({
	request,
	onAllow,
	onDeny,
	queuePosition,
}: {
	request: AskUserQuestionRequest;
	onAllow: (requestId: string, updatedInput: Record<string, unknown>) => void;
	onDeny: (requestId: string, message?: string) => void;
	queuePosition: number; // 0-based, 0 = active
}) {
	const [currentStep, setCurrentStep] = useState(0);
	const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
	const [remaining, setRemaining] = useState(0);
	const [slideDir, setSlideDir] = useState<"forward" | "backward">("forward");
	const totalDurationRef = useRef(0);
	const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	const totalQuestions = request.questions.length;

	// 初始化总时长
	useEffect(() => {
		totalDurationRef.current = Math.max(
			1,
			Math.ceil((request.expiresAt - Date.now()) / 1000),
		);
	}, [request.expiresAt]);

	// 倒计时
	useEffect(() => {
		const tick = () =>
			setRemaining(
				Math.max(0, Math.ceil((request.expiresAt - Date.now()) / 1000)),
			);
		tick();
		const timer = setInterval(tick, 1000);
		return () => clearInterval(timer);
	}, [request.expiresAt]);

	// 清理 auto-advance timer
	useEffect(() => {
		return () => {
			if (autoAdvanceTimerRef.current)
				clearTimeout(autoAdvanceTimerRef.current);
		};
	}, []);

	// 已完成步骤
	const completedSteps = useMemo(() => {
		const s = new Set<number>();
		for (const [idx, state] of Object.entries(answers)) {
			if (state.selected.length > 0 || state.other.trim().length > 0)
				s.add(Number(idx));
		}
		return s;
	}, [answers]);

	// 全部可提交
	const canSubmit = useMemo(() => {
		return request.questions.every((_, i) => {
			const s = answers[i];
			return s && (s.selected.length > 0 || s.other.trim().length > 0);
		});
	}, [answers, request.questions]);

	// 选择选项
	const handleSelect = useCallback(
		(label: string) => {
			const question = request.questions[currentStep];
			if (!question) return;
			const multiSelect = question.multiSelect === true;

			setAnswers((prev) => {
				const cur = prev[currentStep] ?? { selected: [], other: "" };
				const selected = cur.selected.includes(label)
					? cur.selected.filter((l) => l !== label)
					: multiSelect
						? [...cur.selected, label]
						: [label];
				return { ...prev, [currentStep]: { ...cur, selected } };
			});

			// 单选模式：自动跳转
			if (!multiSelect) {
				if (autoAdvanceTimerRef.current)
					clearTimeout(autoAdvanceTimerRef.current);
				autoAdvanceTimerRef.current = setTimeout(() => {
					if (currentStep < totalQuestions - 1) {
						setSlideDir("forward");
						setCurrentStep((p) => p + 1);
					}
				}, 500);
			}
		},
		[currentStep, request.questions, totalQuestions],
	);

	const updateOther = useCallback(
		(value: string) => {
			setAnswers((prev) => ({
				...prev,
				[currentStep]: {
					selected: prev[currentStep]?.selected ?? [],
					other: value,
				},
			}));
		},
		[currentStep],
	);

	const submit = useCallback(() => {
		const responseAnswers = request.questions.map((q, i) => {
			const s = answers[i] ?? { selected: [], other: "" };
			return {
				header: q.header,
				question: q.question,
				selections: s.selected,
				other: s.other.trim() || undefined,
			};
		});
		onAllow(request.requestId, {
			questions: request.questions,
			answers: responseAnswers,
		});
	}, [answers, onAllow, request]);

	const goNext = useCallback(() => {
		setSlideDir("forward");
		setCurrentStep((p) => Math.min(totalQuestions - 1, p + 1));
	}, [totalQuestions]);

	const goPrev = useCallback(() => {
		setSlideDir("backward");
		setCurrentStep((p) => Math.max(0, p - 1));
	}, []);

	// 只渲染当前激活的 (queuePosition === 0)
	if (queuePosition !== 0) return null;

	const question = request.questions[currentStep];
	if (!question) return null;

	const currentState = answers[currentStep] ?? { selected: [], other: "" };
	const isLastStep = currentStep === totalQuestions - 1;
	const currentStepAnswered =
		currentState.selected.length > 0 || currentState.other.trim().length > 0;

	return (
		<div className="auq-popup-overlay">
			{/* 半透明遮罩 */}
			<div className="auq-popup-backdrop" />

			{/* 弹窗卡片 */}
			<div className="auq-popup-card">
				{/* 顶部倒计时条 */}
				<CountdownBar remaining={remaining} total={totalDurationRef.current} />

				{/* 头部 */}
				<div className="auq-popup-header">
					<div className="auq-popup-header-left">
						<div className="auq-popup-icon">
							<MessageCircleQuestion className="w-3.5 h-3.5" />
						</div>
						<span className="auq-popup-title">
							{totalQuestions > 1 ? "确认细节" : "需要确认"}
							{totalQuestions > 1 && (
								<span className="auq-popup-title-count">
									{` ${currentStep + 1} / ${totalQuestions}`}
								</span>
							)}
						</span>
					</div>
					<button
						type="button"
						onClick={() => onDeny(request.requestId, "User dismissed")}
						className="auq-popup-close"
						aria-label="关闭"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				</div>

				{/* 步骤点 (多题时) */}
				{totalQuestions > 1 && (
					<div className="auq-popup-dots">
						{Array.from({ length: totalQuestions }, (_, i) => (
							<span
								key={i}
								className={cn(
									"auq-popup-dot",
									i === currentStep && "auq-popup-dot-active",
									completedSteps.has(i) &&
										i !== currentStep &&
										"auq-popup-dot-done",
								)}
							/>
						))}
					</div>
				)}

				{/* 问题内容 - 带方向动画 */}
				<div
					className="auq-popup-body"
					key={`${request.requestId}-${currentStep}`}
					data-dir={slideDir}
				>
					{question.header && (
						<div className="auq-popup-q-badge">{question.header}</div>
					)}
					<div className="auq-popup-q-text">{question.question}</div>

					<div className="auq-popup-options">
						{question.options.map((opt, idx) => (
							<OptionButton
								key={opt.label}
								label={opt.label}
								description={opt.description}
								checked={currentState.selected.includes(opt.label)}
								onClick={() => handleSelect(opt.label)}
								index={idx}
							/>
						))}
					</div>

					{/* 补充输入 - 折叠式 */}
					<input
						type="text"
						placeholder="补充说明（可选）"
						value={currentState.other}
						onChange={(e) => updateOther(e.target.value)}
						className="auq-popup-other"
					/>
				</div>

				{/* 底部操作 */}
				<div className="auq-popup-footer">
					{/* 左侧: 上一步 (多题时) */}
					{totalQuestions > 1 && currentStep > 0 ? (
						<button
							type="button"
							onClick={goPrev}
							className="auq-popup-btn-ghost"
						>
							<span aria-hidden>←</span>
							<span>上一步</span>
						</button>
					) : (
						<div /> /* spacer */
					)}

					{/* 右侧 */}
					<div className="auq-popup-footer-right">
						{isLastStep || totalQuestions === 1 ? (
							<button
								type="button"
								onClick={submit}
								disabled={!canSubmit}
								className={cn(
									"auq-popup-btn-primary",
									canSubmit && "auq-popup-btn-ready",
								)}
							>
								<Send className="w-3.5 h-3.5" />
								提交
							</button>
						) : (
							<button
								type="button"
								onClick={goNext}
								disabled={!currentStepAnswered}
								className="auq-popup-btn-next"
							>
								下一步
								<ChevronRight className="w-3.5 h-3.5" />
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  AskUserQuestionList – 对外接口 (处理多 request 队列)               */
/* ------------------------------------------------------------------ */

export function AskUserQuestionList(props: {
	requests: AskUserQuestionRequest[];
	onAllow: (requestId: string, updatedInput: Record<string, unknown>) => void;
	onDeny: (requestId: string, message?: string) => void;
}) {
	if (props.requests.length === 0) return null;

	// 一次只渲染第一个 request 的弹窗
	const activeRequest = props.requests[0];
	return (
		<AskUserQuestionPopup
			key={activeRequest.requestId}
			request={activeRequest}
			onAllow={props.onAllow}
			onDeny={props.onDeny}
			queuePosition={0}
		/>
	);
}
