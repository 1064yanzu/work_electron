import { ArrowLeft } from "lucide-react";
import { designStore, useDesignStoreSelector } from "../../lib/stores";

/**
 * 5 个内置方向的卡片网格。OKLch swatches + display font 预览 + mood + posture 摘要。
 */
interface DirectionPickerProps {
	onBack: () => void;
	onConfirm: () => void;
}

export function DirectionPicker({ onBack, onConfirm }: DirectionPickerProps) {
	const directions = useDesignStoreSelector((s) => s.directions);
	const draft = useDesignStoreSelector((s) => s.draftAnswers);
	const selected = draft.direction_id || draft.answers.tone;

	const handlePick = (id: string) => {
		designStore.patchDraftAnswers({ direction_id: id });
	};

	return (
		<div className="h-full w-full overflow-y-auto bg-background">
			<div className="max-w-5xl mx-auto px-8 py-10">
				<header className="flex items-center justify-between mb-8">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={onBack}
							className="p-2 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded-lg transition-colors"
						>
							<ArrowLeft className="w-4 h-4" />
						</button>
						<div>
							<div className="text-xs uppercase tracking-wider text-text-muted">
								第 2 步 · 选方向
							</div>
							<h2 className="text-xl font-semibold text-text-primary mt-1">
								把哪种气质交给设计师
							</h2>
						</div>
					</div>
					<button
						type="button"
						disabled={!selected}
						onClick={onConfirm}
						className="px-5 py-2 rounded-full bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						开始生成 →
					</button>
				</header>

				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
					{directions.map((d) => {
						const isSelected = selected === d.id;
						return (
							<button
								type="button"
								key={d.id}
								onClick={() => handlePick(d.id)}
								className={[
									"flex flex-col text-left rounded-2xl border-2 transition-all overflow-hidden",
									isSelected
										? "border-primary ring-2 ring-primary/15"
										: "border-border hover:border-primary/40",
								].join(" ")}
							>
								<div
									className="h-32 flex items-center justify-center text-3xl font-semibold tracking-tight"
									style={{
										backgroundColor: d.palette.bg,
										color: d.palette.fg,
										fontFamily: d.display_font.split("/")[0]?.trim() ||
											"system-ui, sans-serif",
									}}
								>
									{d.label.split(" ")[0]}
								</div>

								<div className="flex h-2">
									<div
										className="flex-1"
										style={{ background: d.palette.bg }}
									/>
									<div
										className="flex-1"
										style={{ background: d.palette.fg }}
									/>
									<div
										className="flex-1"
										style={{ background: d.palette.accent }}
									/>
									<div
										className="flex-1"
										style={{ background: d.palette.muted }}
									/>
								</div>

								<div className="p-4 flex flex-col gap-2 bg-bg-surface">
									<div className="flex items-center justify-between gap-2">
										<span className="text-sm font-semibold text-text-primary">
											{d.label}
										</span>
									</div>
									<p className="text-xs text-text-muted leading-relaxed">
										{d.mood}
									</p>
									<div className="flex flex-wrap gap-1 mt-1">
										{d.posture.slice(0, 4).map((p) => (
											<span
												key={p}
												className="px-2 py-0.5 text-[10px] rounded-full bg-warm-200 text-text-muted"
											>
												{p}
											</span>
										))}
									</div>
									<div className="text-[10px] text-text-muted mt-2 truncate">
										字: {d.display_font}
									</div>
								</div>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
