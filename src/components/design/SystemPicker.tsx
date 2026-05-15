import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { designListSystems } from "../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../lib/stores";
import { Button } from "../ui/Button";
import { Tabs } from "../ui/Tabs";

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
					<Button
						type="button"
						variant="action"
						size="md"
						disabled={!selected}
						onClick={onConfirm}
						icon={<ArrowRight className="w-4 h-4" strokeWidth={1.8} />}
						iconPosition="right"
					>
						开始生成
					</Button>
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
						className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-cream-300 bg-cream-100/60 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-cream-500 focus:shadow-[0_0_0_3px_var(--t-primary-muted)] dark:border-cream-500/60 dark:bg-cream-800/40"
					/>
				</div>

				<Tabs
					value={tab}
					onChange={setTab}
					variant="segmented"
					size="sm"
					aria-label="系统分组"
					className="mb-4"
					items={(Object.keys(TAB_LABEL) as GroupTab[]).map((t) => ({
						value: t,
						label: `${TAB_LABEL[t]} ${counts[t]}`,
					}))}
				/>

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
										"flex flex-col text-left rounded-2xl border-2 transition-all overflow-hidden",
										isSelected
											? "border-text-primary bg-cream-100 shadow-bai-card dark:bg-cream-800"
											: "border-cream-300 bg-cream-50 hover:border-cream-400 hover:bg-cream-100/60 dark:border-cream-500/60 dark:bg-cream-900 dark:hover:bg-cream-800/40",
									].join(" ")}
								>
									<div className="flex h-3">
										{(s.swatches.length
											? s.swatches
											: ["#ccc", "#999", "#666", "#333"]
										).map((c, i) => (
											<div
												key={`${s.id}-${i}`}
												className="flex-1"
												style={{ backgroundColor: c }}
											/>
										))}
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
