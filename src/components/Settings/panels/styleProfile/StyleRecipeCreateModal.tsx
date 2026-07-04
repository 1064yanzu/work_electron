/**
 * StyleRecipeCreateModal — 创建混搭配方弹窗
 *
 * 用户选择各层级的来源风格包，组合成一个自定义配方。
 */
import { Blend, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
	StyleProfile,
	StyleIntensity,
} from "../../../../../electron/shared/ipc-schema";
import {
	listStyleProfiles,
	createStyleRecipe,
} from "../../../../lib/api/styleProfile";

interface Props {
	onClose: () => void;
	onCreated: (recipeId: string) => void;
}

const LAYER_LABELS = [
	{ key: "soul", label: "灵魂层", desc: "世界观与根本姿态" },
	{ key: "thinking", label: "思维运作", desc: "这个脑子怎么动" },
	{ key: "articulation", label: "篇章外化", desc: "思维如何落到篇章上" },
	{ key: "texture", label: "血肉层", desc: "语言质感与指纹" },
	{
		key: "relational",
		label: "关系性维度",
		desc: "气韵 / 全息 / 经变 + 横切话题",
	},
] as const;

const INTENSITY_OPTIONS: { value: StyleIntensity; label: string }[] = [
	{ value: "low", label: "弱" },
	{ value: "medium", label: "中" },
	{ value: "high", label: "强" },
];

export function StyleRecipeCreateModal({ onClose, onCreated }: Props) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [profiles, setProfiles] = useState<StyleProfile[]>([]);
	const [selections, setSelections] = useState<Record<string, string | null>>({
		soul: null,
		thinking: null,
		articulation: null,
		texture: null,
		relational: null,
	});
	const [intensity, setIntensity] = useState<StyleIntensity>("medium");
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		const load = async () => {
			try {
				const ps = await listStyleProfiles();
				setProfiles(ps.filter((p) => p.status === "active"));
			} catch {
				// ignore
			}
		};
		void load();
	}, []);

	const handleSelect = useCallback(
		(layer: string, profileId: string | null) => {
			setSelections((prev) => ({ ...prev, [layer]: profileId }));
		},
		[],
	);

	const hasAnySelection = Object.values(selections).some((v) => v !== null);
	const canSubmit = name.trim().length > 0 && hasAnySelection && !submitting;

	const handleSubmit = useCallback(async () => {
		if (!canSubmit) return;
		setSubmitting(true);
		try {
			const recipe = await createStyleRecipe({
				name: name.trim(),
				description: description.trim() || undefined,
				soul_profile_id: selections.soul,
				thinking_profile_id: selections.thinking,
				articulation_profile_id: selections.articulation,
				texture_profile_id: selections.texture,
				relational_profile_id: selections.relational,
				intensity,
			});
			onCreated(recipe.id);
		} catch (e) {
			console.error("[StyleRecipeCreateModal] create failed:", e);
		} finally {
			setSubmitting(false);
		}
	}, [canSubmit, name, description, selections, intensity, onCreated]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
			<div className="w-full max-w-lg bg-cream-50 dark:bg-cream-900 rounded-2xl shadow-2xl border border-cream-300/50 dark:border-cream-600/30 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-cream-200/60 dark:border-cream-700/40">
					<div className="flex items-center gap-2.5">
						<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400/20 to-orange-400/20 dark:from-amber-400/10 dark:to-orange-400/10 flex items-center justify-center">
							<Blend
								className="w-4 h-4 text-amber-600 dark:text-amber-400"
								strokeWidth={1.5}
							/>
						</div>
						<div>
							<div className="text-sm font-semibold text-text-primary">
								新建混搭配方
							</div>
							<div className="text-[10px] text-text-muted mt-0.5">
								从多个风格包中挑选不同层级进行组合
							</div>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-cream-200/80 dark:hover:bg-cream-700/50 transition-colors"
					>
						<X className="w-4 h-4" strokeWidth={1.5} />
					</button>
				</div>

				{/* Body */}
				<div className="px-6 py-4 space-y-4 max-h-[65vh] overflow-y-auto scrollbar-hide">
					{/* 名称 */}
					<div>
						<label className="block text-xs font-medium text-text-secondary mb-1.5">
							配方名称
						</label>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="例：专业评论 + 温暖叙事"
							className="w-full px-3 py-2 text-sm bg-cream-100/80 dark:bg-cream-800/50 border border-cream-300/50 dark:border-cream-600/30 rounded-xl text-text-primary placeholder-text-muted/50 outline-none focus:border-cream-400 dark:focus:border-cream-500 transition-colors"
						/>
					</div>

					{/* 描述 */}
					<div>
						<label className="block text-xs font-medium text-text-secondary mb-1.5">
							简要描述{" "}
							<span className="text-text-muted font-normal">（可选）</span>
						</label>
						<input
							type="text"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="描述这个配方的使用场景"
							className="w-full px-3 py-2 text-sm bg-cream-100/80 dark:bg-cream-800/50 border border-cream-300/50 dark:border-cream-600/30 rounded-xl text-text-primary placeholder-text-muted/50 outline-none focus:border-cream-400 dark:focus:border-cream-500 transition-colors"
						/>
					</div>

					{/* 层级选择器 */}
					<div>
						<label className="block text-xs font-medium text-text-secondary mb-2">
							选择各层级来源
						</label>
						<div className="space-y-2">
							{LAYER_LABELS.map((layer) => (
								<LayerSelector
									key={layer.key}
									label={layer.label}
									description={layer.desc}
									profiles={profiles}
									selectedId={selections[layer.key]}
									onSelect={(id) => handleSelect(layer.key, id)}
								/>
							))}
						</div>
					</div>

					{/* 强度 */}
					<div>
						<label className="block text-xs font-medium text-text-secondary mb-1.5">
							注入强度
						</label>
						<div className="flex gap-2">
							{INTENSITY_OPTIONS.map((opt) => (
								<button
									key={opt.value}
									type="button"
									onClick={() => setIntensity(opt.value)}
									className={`px-3 py-1.5 text-xs rounded-lg border transition-all duration-150 ${
										intensity === opt.value
											? "bg-cream-200/80 dark:bg-cream-700/60 border-cream-400/60 dark:border-cream-500/50 text-text-primary font-medium"
											: "bg-transparent border-cream-300/40 dark:border-cream-600/30 text-text-muted hover:text-text-secondary hover:border-cream-400/50"
									}`}
								>
									{opt.label}
								</button>
							))}
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-cream-200/60 dark:border-cream-700/40 bg-cream-100/30 dark:bg-cream-800/20">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
					>
						取消
					</button>
					<button
						type="button"
						onClick={() => void handleSubmit()}
						disabled={!canSubmit}
						className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ${
							canSubmit
								? "bg-cream-800 dark:bg-cream-200 text-cream-50 dark:text-cream-900 hover:bg-cream-900 dark:hover:bg-cream-100 shadow-sm"
								: "bg-cream-300 dark:bg-cream-700 text-cream-500 dark:text-cream-500 cursor-not-allowed"
						}`}
					>
						{submitting ? "创建中…" : "创建"}
					</button>
				</div>
			</div>
		</div>
	);
}

// ── 层级选择行 ──────────────────────────────────────────────────────────────

interface LayerSelectorProps {
	label: string;
	description: string;
	profiles: StyleProfile[];
	selectedId: string | null;
	onSelect: (id: string | null) => void;
}

function LayerSelector({
	label,
	description,
	profiles,
	selectedId,
	onSelect,
}: LayerSelectorProps) {
	return (
		<div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-cream-200/50 dark:border-cream-600/25 bg-cream-50/60 dark:bg-cream-800/30">
			<div className="flex-1 min-w-0">
				<div className="text-xs font-medium text-text-primary">{label}</div>
				<div className="text-[10px] text-text-muted mt-0.5 leading-snug">
					{description}
				</div>
			</div>
			<select
				value={selectedId ?? ""}
				onChange={(e) => onSelect(e.target.value || null)}
				className="w-[140px] shrink-0 text-xs px-2 py-1.5 rounded-lg bg-cream-100/80 dark:bg-cream-800/60 border border-cream-300/50 dark:border-cream-600/30 text-text-primary outline-none focus:border-cream-400 dark:focus:border-cream-500 transition-colors cursor-pointer appearance-none"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
					backgroundRepeat: "no-repeat",
					backgroundPosition: "right 6px center",
					paddingRight: "22px",
				}}
			>
				<option value="">不使用</option>
				{profiles.map((p) => (
					<option key={p.id} value={p.id}>
						{p.name}
					</option>
				))}
			</select>
		</div>
	);
}
