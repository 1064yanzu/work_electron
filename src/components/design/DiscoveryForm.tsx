import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import {
	designGetDiscoveryForm,
	designListDirections,
} from "../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../lib/stores";
import { Button } from "../ui/Button";
import { RadioCardGroup } from "../ui/RadioCard";
import { BrandExtractInput } from "./BrandExtractInput";

/**
 * Turn-1 Discovery 表单。
 * - schema 由后端注入；本组件只负责按字段渲染对应的 React 控件
 * - 用户「下一步」后会调用外部 onSubmit；内部不直接发请求
 */
interface DiscoveryFormProps {
	onCancel: () => void;
	onSubmit: () => void;
}

export function DiscoveryForm({ onCancel, onSubmit }: DiscoveryFormProps) {
	const form = useDesignStoreSelector((s) => s.discoveryForm);
	const draft = useDesignStoreSelector((s) => s.draftAnswers);
	const currentSession = useDesignStoreSelector((s) => s.currentSession);

	useEffect(() => {
		// 兜底：如果父组件没拿到 form，自己拉一份
		if (!form) {
			void (async () => {
				try {
					const [f, dirs] = await Promise.all([
						designGetDiscoveryForm(),
						designListDirections(),
					]);
					designStore.setDiscoveryForm(f);
					designStore.setDirections(dirs);
				} catch (err) {
					console.error("[DiscoveryForm] init failed", err);
				}
			})();
		}
	}, [form]);

	if (!form) {
		return (
			<div className="h-full flex items-center justify-center text-sm text-text-muted">
				正在加载表单…
			</div>
		);
	}

	const isValid = form.fields
		.filter((f) => f.required)
		.every((f) => {
			const v = draft.answers[f.id];
			return (
				v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== "")
			);
		});

	return (
		<div className="h-full w-full overflow-y-auto bg-background">
			<div className="max-w-3xl mx-auto px-8 py-12 flex flex-col gap-7">
				<header className="flex flex-col gap-2">
					<span className="text-xs uppercase tracking-wider text-text-muted">
						Discovery · 第 1 轮
					</span>
					<h2 className="text-2xl font-semibold text-text-primary">
						告诉我一些细节
					</h2>
					<p className="text-sm text-text-muted leading-relaxed">
						这些信息会拼装到 Agent 的 system
						prompt，决定生成方向。可以粗一点，每个字段都不阻塞。
					</p>
				</header>

				<div className="flex flex-col gap-5">
					{form.fields.map((field) => {
						const value = draft.answers[field.id];
						if (field.type === "textarea") {
							return (
								<FieldShell key={field.id} field={field}>
									<textarea
										value={typeof value === "string" ? value : ""}
										placeholder={field.placeholder}
										onChange={(e) =>
											designStore.setAnswerField(field.id, e.target.value)
										}
										rows={4}
										className={discoveryTextareaClass}
									/>
								</FieldShell>
							);
						}
						if (field.type === "text") {
							return (
								<FieldShell key={field.id} field={field}>
									<input
										type="text"
										value={typeof value === "string" ? value : ""}
										placeholder={field.placeholder}
										onChange={(e) =>
											designStore.setAnswerField(field.id, e.target.value)
										}
										className={discoveryInputClass}
									/>
								</FieldShell>
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
								<FieldShell key={field.id} field={field}>
									{field.type === "multiselect" ? (
										<RadioCardGroup
											multi
											value={current as string[]}
											onChange={(next) =>
												designStore.setAnswerField(field.id, next)
											}
											items={options}
											size="md"
											layout="vertical"
											columns={2}
											accent="primary"
											aria-label={field.label}
											className="max-sm:grid-cols-1"
										/>
									) : (
										<RadioCardGroup
											value={(current as string | undefined) ?? ""}
											onChange={(next) =>
												designStore.setAnswerField(field.id, next)
											}
											items={options}
											size="md"
											layout="vertical"
											columns={2}
											accent="primary"
											aria-label={field.label}
											className="max-sm:grid-cols-1"
										/>
									)}
								</FieldShell>
							);
						}
						return null;
					})}

					{draft.answers.brand === "brand-spec" && currentSession ? (
						<BrandExtractInput sessionId={currentSession.id} />
					) : null}
				</div>

				<footer className="flex items-center justify-end gap-3 pt-2 sticky bottom-0 bg-background/95 backdrop-blur py-4">
					<Button type="button" variant="ghost" size="md" onClick={onCancel}>
						取消
					</Button>
					<Button
						type="button"
						variant="action"
						size="md"
						disabled={!isValid}
						onClick={onSubmit}
						icon={<ArrowRight className="w-4 h-4" strokeWidth={1.8} />}
						iconPosition="right"
					>
						{draft.answers.brand === "brand-spec" ? "选择品牌系统" : "选方向"}
					</Button>
				</footer>
			</div>
		</div>
	);
}

const discoveryInputClass =
	"w-full px-3.5 py-2.5 rounded-2xl border border-cream-300 bg-cream-100/60 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-cream-500 focus:shadow-[0_0_0_3px_var(--t-primary-muted)] dark:border-cream-500/60 dark:bg-cream-800/40";

const discoveryTextareaClass = `${discoveryInputClass} resize-vertical leading-relaxed`;

function FieldShell({
	field,
	children,
}: {
	field: import("../../../electron/shared/types").DiscoveryField;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label className="text-sm font-medium text-text-primary flex items-center gap-1">
				{field.label}
				{field.required ? <span className="text-primary">*</span> : null}
			</label>
			{field.help ? (
				<div className="text-xs text-text-muted leading-relaxed">
					{field.help}
				</div>
			) : null}
			{children}
		</div>
	);
}
