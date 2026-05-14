import { useEffect } from "react";
import {
	designGetDiscoveryForm,
	designListDirections,
} from "../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../lib/stores";
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
			return v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== "");
		});

	return (
		<div className="h-full w-full overflow-y-auto bg-background">
			<div className="max-w-2xl mx-auto px-8 py-12 flex flex-col gap-6">
				<header className="flex flex-col gap-2">
					<span className="text-xs uppercase tracking-wider text-text-muted">
						Discovery · 第 1 轮
					</span>
					<h2 className="text-2xl font-semibold text-text-primary">
						告诉我一些细节
					</h2>
					<p className="text-sm text-text-muted leading-relaxed">
						这些信息会拼装到 Agent 的 system prompt，决定生成方向。可以粗一点，每个字段都不阻塞。
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
										className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 resize-vertical leading-relaxed"
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
										className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50"
									/>
								</FieldShell>
							);
						}
						if (field.type === "select" || field.type === "multiselect") {
							const options = field.options || [];
							const current = field.type === "multiselect"
								? Array.isArray(value)
									? (value as string[])
									: []
								: typeof value === "string"
									? value
									: (field.default_value as string | undefined);
							return (
								<FieldShell key={field.id} field={field}>
									<div className="flex flex-col gap-1.5">
										{options.map((opt) => {
											const isSelected = field.type === "multiselect"
												? (current as string[]).includes(opt.value)
												: current === opt.value;
											return (
												<button
													type="button"
													key={opt.value}
													onClick={() => {
														if (field.type === "multiselect") {
															const arr = Array.isArray(current)
																? (current as string[])
																: [];
															const next = isSelected
																? arr.filter((v) => v !== opt.value)
																: [...arr, opt.value];
															designStore.setAnswerField(field.id, next);
														} else {
															designStore.setAnswerField(field.id, opt.value);
														}
													}}
													className={[
														"w-full text-left px-3 py-2.5 rounded-lg border transition-colors",
														isSelected
															? "border-primary bg-primary/5 text-text-primary"
															: "border-border bg-bg-surface text-text-muted hover:border-primary/30",
													].join(" ")}
												>
													<div className="text-sm font-medium text-text-primary">
														{opt.label}
													</div>
													{opt.description ? (
														<div className="text-xs text-text-muted mt-0.5 leading-relaxed">
															{opt.description}
														</div>
													) : null}
												</button>
											);
										})}
									</div>
								</FieldShell>
							);
						}
						return null;
					})}

					{draft.answers.brand === "brand-spec" && currentSession ? (
						<BrandExtractInput sessionId={currentSession.id} />
					) : null}
				</div>

				<footer className="flex items-center justify-end gap-3 pt-2 sticky bottom-0 bg-background py-4">
					<button
						type="button"
						onClick={onCancel}
						className="px-4 py-2 text-sm text-text-muted hover:text-text-primary rounded-lg hover:bg-warm-200/60 transition-colors"
					>
						取消
					</button>
					<button
						type="button"
						disabled={!isValid}
						onClick={onSubmit}
						className="px-5 py-2 rounded-full bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{draft.answers.brand === "brand-spec" ? "选择品牌系统 →" : "选方向 →"}
					</button>
				</footer>
			</div>
		</div>
	);
}

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
				<div className="text-xs text-text-muted leading-relaxed">{field.help}</div>
			) : null}
			{children}
		</div>
	);
}
