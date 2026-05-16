import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { designListSystems } from "../../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../../lib/stores";
import { toast } from "../../ui/Toast";
import { SystemThumbnail } from "./SystemThumbnail";

interface SystemItem {
	id: string;
	title: string;
	category: string;
	group: "product" | "style";
	summary: string;
	swatches: string[];
}

type GroupTab = "all" | "product" | "style";

const TAB_LABEL: Record<GroupTab, string> = {
	all: "全部",
	product: "产品系统",
	style: "风格系统",
};

export function SystemsLibraryTab() {
	const isStarting = useDesignStoreSelector((s) => s.isStarting);
	const [systems, setSystems] = useState<SystemItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [tab, setTab] = useState<GroupTab>("all");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const list = await designListSystems();
				if (cancelled) return;
				setSystems(list);
			} catch (err) {
				console.warn("[SystemsLibraryTab] failed", err);
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

	const handlePickSystem = (system: SystemItem) => {
		// 预填 NewProjectPanel（左栏 420px 已常驻），不再 startSession + 跳 discovery
		designStore.setNewProjectSeed({
			kind: "prototype",
			systemId: system.id,
			titleHint: `基于 ${system.title}`,
		});
		toast.success(
			`已选定「${system.title}」，请在左栏填写简介后点击「创建并生成」`,
		);
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-3 flex-wrap">
				<div className="relative flex-1 min-w-[16rem]">
					<Search
						className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted"
						strokeWidth={1.5}
					/>
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="搜索设计系统 (Linear / Vercel / Claude…)"
						className="w-full pl-9 pr-3 py-2 rounded-full border border-border bg-bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50"
					/>
				</div>
				<div className="flex items-center gap-1.5">
					{(Object.keys(TAB_LABEL) as GroupTab[]).map((t) => {
						const active = tab === t;
						return (
							<button
								key={t}
								type="button"
								onClick={() => setTab(t)}
								className={[
									"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all",
									active
										? "bg-bg-subtle text-text-primary border-border shadow-sm"
										: "text-text-muted hover:text-text-primary hover:bg-warm-200/50 border-transparent",
								].join(" ")}
							>
								{TAB_LABEL[t]}
								<span className="opacity-60 text-[11px]">{counts[t]}</span>
							</button>
						);
					})}
				</div>
			</div>

			{loading ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{Array.from({ length: 9 }).map((_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: skeleton
							key={i}
							className="aspect-[16/10] rounded-2xl bg-warm-200/40 animate-pulse"
						/>
					))}
				</div>
			) : filtered.length === 0 ? (
				<div className="text-sm text-text-muted py-10 text-center">
					没有匹配的设计系统。
				</div>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{filtered.map((s) => (
						<button
							key={s.id}
							type="button"
							disabled={isStarting}
							onClick={() => handlePickSystem(s)}
							className="group text-left flex flex-col rounded-2xl border border-border bg-bg-surface overflow-hidden hover:border-primary/40 hover:shadow-md transition-all duration-150 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
						>
							<div className="aspect-[16/10] w-full border-b border-border/60">
								<SystemThumbnail
									systemId={s.id}
									swatches={s.swatches}
									title={s.title}
									className="h-full"
								/>
							</div>
							<div className="px-4 py-3 flex flex-col gap-1.5">
								<div className="flex items-center justify-between gap-2">
									<span className="text-sm font-semibold text-text-primary truncate">
										{s.title}
									</span>
									<span className="text-[10px] uppercase tracking-wider text-text-muted shrink-0">
										{s.category}
									</span>
								</div>
								<p className="text-[11.5px] text-text-muted leading-relaxed line-clamp-2">
									{s.summary}
								</p>
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
