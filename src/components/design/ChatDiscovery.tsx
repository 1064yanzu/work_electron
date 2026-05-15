/**
 * 对话式 Discovery 视图。
 * 把 DiscoveryForm 的 fields 渲染为「AI 提问气泡 + 用户回答控件」的消息流,
 * 让首轮收集像 ChatGPT/Claude 在工程模式里的引导问答,而不是堆叠的表单。
 *
 * 行为:
 * - 一次只激活一个字段 (currentIndex);用户填写后点「下一步」推进
 * - 已填字段折叠为已回答气泡 (可点击回到该字段编辑)
 * - 必填字段未填会禁用「下一步」
 * - 父组件控制 onSubmit / onCancel,本组件只管推进
 */
import {
	ArrowRight,
	Check,
	Loader2,
	RefreshCw,
	Sparkles,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiscoveryField } from "../../../electron/shared/types";
import {
	designGetDiscoveryForm,
	designListDirections,
} from "../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../lib/stores";
import { Button } from "../ui/Button";
import { RadioCardGroup } from "../ui/RadioCard";
import { BrandExtractInput } from "./BrandExtractInput";

interface ChatDiscoveryProps {
	onCancel: () => void;
	onSubmit: () => void;
	onSwitchClassic?: () => void;
}

function fieldHasValue(_field: DiscoveryField, value: unknown): boolean {
	if (value == null) return false;
	if (Array.isArray(value)) return value.length > 0;
	return String(value).trim() !== "";
}

export function ChatDiscovery({
	onCancel,
	onSubmit,
	onSwitchClassic,
}: ChatDiscoveryProps) {
	const form = useDesignStoreSelector((s) => s.discoveryForm);
	const draft = useDesignStoreSelector((s) => s.draftAnswers);
	const currentSession = useDesignStoreSelector((s) => s.currentSession);
	const fields = useMemo(() => form?.fields ?? [], [form]);

	const [activeIndex, setActiveIndex] = useState(0);
	const [formLoading, setFormLoading] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const formLoadingRef = useRef(false);

	const loadForm = useCallback(async () => {
		if (formLoadingRef.current) return;
		formLoadingRef.current = true;
		setFormLoading(true);
		setFormError(null);
		try {
			const [nextForm, dirs] = await Promise.all([
				designGetDiscoveryForm(),
				designListDirections(),
			]);
			designStore.setDiscoveryForm(nextForm);
			designStore.setDirections(dirs);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[ChatDiscovery] form init failed", err);
			setFormError(message);
			designStore.setError(message);
		} finally {
			formLoadingRef.current = false;
			setFormLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!form) {
			void loadForm();
		}
	}, [form, loadForm]);

	useEffect(() => {
		// 切到新激活字段时滚动到底部
		const el = scrollRef.current;
		if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
	}, [activeIndex]);

	if (!form) {
		return (
			<div className="h-full flex items-center justify-center bg-background px-6">
				<div className="max-w-sm rounded-2xl border border-cream-300 bg-cream-50 px-5 py-4 shadow-bai-card flex flex-col gap-3 dark:border-cream-500/60 dark:bg-cream-900">
					<div className="flex items-center gap-2.5">
						{formLoading ? (
							<Loader2
								className="w-4 h-4 text-primary animate-spin"
								strokeWidth={1.8}
							/>
						) : (
							<Sparkles className="w-4 h-4 text-primary" strokeWidth={1.6} />
						)}
						<div className="text-sm font-medium text-text-primary">
							{formLoading ? "正在加载表单…" : "表单暂时没加载出来"}
						</div>
					</div>
					{formError ? (
						<div className="text-xs text-text-muted leading-relaxed break-words">
							{formError}
						</div>
					) : (
						<div className="text-xs text-text-muted leading-relaxed">
							正在从主进程读取设计发现表单。
						</div>
					)}
					<div className="flex items-center justify-end gap-2 pt-1">
						<Button variant="ghost" size="sm" onClick={onCancel}>
							取消
						</Button>
						<Button
							variant="action"
							size="sm"
							onClick={() => void loadForm()}
							disabled={formLoading}
							icon={<RefreshCw className="w-3.5 h-3.5" strokeWidth={1.8} />}
						>
							重试
						</Button>
					</div>
				</div>
			</div>
		);
	}

	const allRequiredFilled = fields
		.filter((f) => f.required)
		.every((f) => fieldHasValue(f, draft.answers[f.id]));

	const visibleFields = fields.slice(0, activeIndex + 1);
	const reachedEnd = activeIndex >= fields.length - 1;
	const activeField = fields[activeIndex];
	const activeFilled = activeField
		? !activeField.required ||
			fieldHasValue(activeField, draft.answers[activeField.id])
		: true;

	const handleAdvance = () => {
		if (!activeFilled) return;
		if (reachedEnd) {
			if (allRequiredFilled) onSubmit();
			return;
		}
		setActiveIndex((i) => Math.min(i + 1, fields.length - 1));
	};

	return (
		<div className="h-full w-full flex flex-col bg-background">
			<header className="px-6 py-4 border-b border-cream-300 bg-cream-50/95 backdrop-blur flex items-center gap-3 dark:border-cream-500/60 dark:bg-cream-900/95">
				<div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
					<Sparkles className="w-4 h-4 text-primary" strokeWidth={1.5} />
				</div>
				<div className="flex flex-col">
					<span className="text-[11px] uppercase tracking-wider text-text-muted">
						Discovery · 第 1 轮
					</span>
					<span className="text-sm font-medium text-text-primary">
						告诉我一些细节
					</span>
				</div>
				<div className="flex-1" />
				{onSwitchClassic ? (
					<button
						type="button"
						onClick={onSwitchClassic}
						className="text-[11px] text-text-muted hover:text-text-primary transition-colors"
					>
						切换为表单模式
					</button>
				) : null}
				<button
					type="button"
					onClick={onCancel}
					className="p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-warm-200/60 transition-colors"
					title="取消"
				>
					<X className="w-3.5 h-3.5" />
				</button>
			</header>

			<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
				<div className="max-w-2xl mx-auto flex flex-col gap-5">
					<IntroBubble />
					{visibleFields.map((field, idx) => {
						const value = draft.answers[field.id];
						const isActive = idx === activeIndex;
						const filled = fieldHasValue(field, value);
						return (
							<div key={field.id} className="flex flex-col gap-2.5">
								<QuestionBubble field={field} index={idx} />
								{isActive ? (
									<AnswerControl field={field} value={value} />
								) : (
									<AnsweredSummary
										field={field}
										value={value}
										filled={filled}
										onEdit={() => setActiveIndex(idx)}
									/>
								)}
							</div>
						);
					})}

					{draft.answers.brand === "brand-spec" && currentSession ? (
						<BrandExtractInput sessionId={currentSession.id} />
					) : null}
				</div>
			</div>

			<footer className="px-6 py-3.5 border-t border-cream-300 bg-cream-50/95 backdrop-blur flex items-center justify-between dark:border-cream-500/60 dark:bg-cream-900/95">
				<div className="text-[11px] text-text-muted">
					{activeIndex + 1} / {fields.length}
					{!allRequiredFilled ? " · 有必填项未完成" : ""}
				</div>
				<div className="flex items-center gap-2">
					<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
						取消
					</Button>
					<Button
						type="button"
						variant="action"
						size="sm"
						disabled={!activeFilled || (reachedEnd && !allRequiredFilled)}
						onClick={handleAdvance}
						icon={<ArrowRight className="w-3.5 h-3.5" strokeWidth={1.8} />}
						iconPosition="right"
					>
						{reachedEnd
							? draft.answers.brand === "brand-spec"
								? "选择品牌系统"
								: "选方向"
							: "下一步"}
					</Button>
				</div>
			</footer>
		</div>
	);
}

function IntroBubble() {
	return (
		<div className="flex items-start gap-2.5">
			<div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
				<Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
			</div>
			<div className="flex-1 min-w-0">
				<div className="rounded-2xl rounded-tl-sm bg-cream-50 border border-cream-300 px-4 py-3 text-sm text-text-primary leading-relaxed shadow-bai-card dark:border-cream-500/60 dark:bg-cream-900">
					我会根据你接下来的回答拼装 system prompt,你不用一次填完——
					<span className="text-text-muted">每一项都可以粗一点。</span>
				</div>
			</div>
		</div>
	);
}

function QuestionBubble({
	field,
	index,
}: {
	field: DiscoveryField;
	index: number;
}) {
	return (
		<div className="flex items-start gap-2.5 animate-thumbnail-fade-in">
			<div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
				<span className="text-[10px] font-medium text-primary">
					{(index + 1).toString().padStart(2, "0")}
				</span>
			</div>
			<div className="flex-1 min-w-0">
				<div className="rounded-2xl rounded-tl-sm bg-cream-50 border border-cream-300 px-4 py-3 shadow-bai-card dark:border-cream-500/60 dark:bg-cream-900">
					<div className="text-sm font-medium text-text-primary flex items-center gap-1">
						{field.label}
						{field.required ? <span className="text-primary">*</span> : null}
					</div>
					{field.help ? (
						<div className="text-xs text-text-muted mt-1 leading-relaxed">
							{field.help}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

function AnswerControl({
	field,
	value,
}: {
	field: DiscoveryField;
	value: unknown;
}) {
	if (field.type === "textarea") {
		return (
			<div className="ml-9.5 pl-0">
				<textarea
					value={typeof value === "string" ? value : ""}
					placeholder={field.placeholder}
					onChange={(e) => designStore.setAnswerField(field.id, e.target.value)}
					rows={3}
					className={`${chatInputClass} resize-vertical leading-relaxed`}
				/>
			</div>
		);
	}
	if (field.type === "text") {
		return (
			<div>
				<input
					type="text"
					value={typeof value === "string" ? value : ""}
					placeholder={field.placeholder}
					onChange={(e) => designStore.setAnswerField(field.id, e.target.value)}
					className={chatInputClass}
				/>
			</div>
		);
	}
	if (field.type === "select" || field.type === "multiselect") {
		const options = field.options || [];
		const current =
			field.type === "multiselect"
				? Array.isArray(value)
					? (value as string[])
					: []
				: typeof value === "string"
					? value
					: (field.default_value as string | undefined);
		return (
			<RadioCardGroup
				{...(field.type === "multiselect"
					? {
							multi: true as const,
							value: current as string[],
							onChange: (next: string[]) =>
								designStore.setAnswerField(field.id, next),
						}
					: {
							value: (current as string | undefined) ?? "",
							onChange: (next: string) =>
								designStore.setAnswerField(field.id, next),
						})}
				items={options}
				size="sm"
				layout="horizontal"
				accent="primary"
				aria-label={field.label}
			/>
		);
	}
	return null;
}

const chatInputClass =
	"w-full px-3.5 py-2.5 rounded-2xl rounded-tr-sm border border-cream-300 bg-cream-100/60 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-cream-500 focus:shadow-[0_0_0_3px_var(--t-primary-muted)] dark:border-cream-500/60 dark:bg-cream-800/40";

function AnsweredSummary({
	field,
	value,
	filled,
	onEdit,
}: {
	field: DiscoveryField;
	value: unknown;
	filled: boolean;
	onEdit: () => void;
}) {
	const display = (() => {
		if (!filled) return "(未回答)";
		if (Array.isArray(value)) {
			const labels = value
				.map((v) => {
					const opt = field.options?.find((o) => o.value === v);
					return opt?.label ?? String(v);
				})
				.join("、");
			return labels || String(value);
		}
		if (field.options) {
			const opt = field.options.find((o) => o.value === value);
			if (opt) return opt.label;
		}
		return String(value);
	})();
	return (
		<button
			type="button"
			onClick={onEdit}
			className={`self-start max-w-[80%] inline-flex items-start gap-1.5 px-3.5 py-2 rounded-2xl rounded-tr-sm text-xs leading-relaxed text-left transition-colors ${
				filled
					? "bg-primary/10 text-text-primary hover:bg-primary/15"
					: "bg-warm-200/60 text-text-muted hover:bg-warm-200"
			}`}
			title="点击重新回答"
		>
			{filled ? (
				<Check
					className="w-3 h-3 mt-0.5 text-primary shrink-0"
					strokeWidth={2.4}
				/>
			) : null}
			<span className="break-words">{display}</span>
		</button>
	);
}
