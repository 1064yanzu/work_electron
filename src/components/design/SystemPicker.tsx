import { ArrowLeft, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { designListSystems } from "../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../lib/stores";

interface DesignSystemItem {
	id: string;
	title: string;
	category: string;
	group?: "product" | "style";
	summary: string;
	swatches: string[];
}

interface SystemPickerProps {
	onBack: () => void;
	onConfirm: () => void;
}

type GroupTab = "all" | "product" | "style";

const TAB_LABEL: Record<GroupTab, string> = {
	all: "全部",
	product: "产品系统",
	style: "风格系统",
};

/**
 * Phase 2 — 内置系统库选择器（10 个）。
 *
 * brand=brand-spec 分支进来；选完写入 draftAnswers.system_id 后进入 running 阶段。
 */
export function SystemPicker({ onBack, onConfirm }: SystemPickerProps) {
	const draft = useDesignStoreSelector((s) => s.draftAnswers);
	const [systems, setSystems] = useState<DesignSystemItem[]>([]);
	const [query, setQuery] = useState("");
	const [tab, setTab] = useState<GroupTab>("all");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const list = await designListSystems();
				if (cancelled) return;
				setSystems(list);
			} catch (err) {
				console.warn("[SystemPicker] failed", err);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return systems.filter((s) => {
			if (tab !== "all" && (s.group ?? "product") !== tab) return false;
			if (!q) return true;
			return (
				s.title.toLowerCase().includes(q) ||
				s.id.toLowerCase().includes(q) ||
				s.category.toLowerCase().includes(q) ||
				s.summary.toLowerCase().includes(q)
			);
		});
	}, [systems, query, tab]);

	const counts = useMemo(() => {
		let product = 0;
		let style = 0;
		for (const s of systems) {
			if ((s.group ?? "product") === "style") style += 1;
			else product += 1;
		}
		return { all: systems.length, product, style };
	}, [systems]);

	const selected = draft.system_id;

	return (
		<div className="h-full w-full overflow-y-auto bg-background">
			<div className="max-w-5xl mx-auto px-8 py-10">
				<header className="flex items-center justify-between mb-6">
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
								选品牌系统
							</div>
							<h2 className="text-xl font-semibold text-text-primary mt-1">
								挑一个 DESIGN.md 灌进 system prompt
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

				<div className="mb-5 relative">
					<Search
						className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
						strokeWidth={1.5}
					/>
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="搜索 Linear / Vercel / Claude…"
						className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50"
					/>
				</div>

				<div className="mb-4 flex items-center gap-2 text-xs">
					{(Object.keys(TAB_LABEL) as GroupTab[]).map((t) => {
						const active = tab === t;
						const c = counts[t];
						return (
							<button
								key={t}
								type="button"
								onClick={() => setTab(t)}
								className={[
									"px-3 py-1.5 rounded-full border transition-colors",
									active
										? "bg-primary text-white border-primary"
										: "border-border text-text-muted hover:text-text-primary hover:bg-warm-200/60",
								].join(" ")}
							>
								{TAB_LABEL[t]}
								<span className="ml-1.5 opacity-70">{c}</span>
							</button>
						);
					})}
				</div>

				{loading ? (
					<div className="text-sm text-text-muted">加载中…</div>
				) : filtered.length === 0 ? (
					<div className="text-sm text-text-muted">
						没找到匹配的系统。可以从内置方向重新挑。
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
						{filtered.map((s) => {
							const isSelected = selected === s.id;
							return (
								<button
									type="button"
									key={s.id}
									onClick={() =>
										designStore.patchDraftAnswers({ system_id: s.id })
									}
									className={[
										"flex flex-col text-left rounded-2xl border-2 transition-all overflow-hidden bg-bg-surface",
										isSelected
											? "border-primary ring-2 ring-primary/15"
											: "border-border hover:border-primary/40",
									].join(" ")}
								>
									<div className="flex h-3">
										{(s.swatches.length ? s.swatches : ["#ccc", "#999", "#666", "#333"]).map(
											(c, i) => (
												<div
													key={`${s.id}-${i}`}
													className="flex-1"
													style={{ backgroundColor: c }}
												/>
											),
										)}
									</div>
									<div className="p-4 flex flex-col gap-1.5">
										<div className="flex items-center justify-between">
											<span className="text-sm font-semibold text-text-primary">
												{s.title}
											</span>
											<span className="text-[10px] text-text-muted uppercase tracking-wider">
												{s.category}
											</span>
										</div>
										<p className="text-xs text-text-muted leading-relaxed">
											{s.summary}
										</p>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
