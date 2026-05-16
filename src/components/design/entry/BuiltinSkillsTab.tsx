import { ExternalLink, Search, Sparkles, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { designListBuiltinSkills } from "../../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../../lib/stores";
import type {
	DesignProjectKind,
	DesignSkillMode,
	DesignSkillSummary,
} from "../../../../electron/shared/types";
import { cn } from "../../../lib/utils";
import { toast } from "../../ui/Toast";

// SDK skill mode → 创建项目 tab/kind 映射（仅给我们自己的 ipo-* 系列用）
const SKILL_MODE_TO_KIND: Record<string, DesignProjectKind> = {
	prototype: "prototype",
	deck: "deck",
	template: "template",
	image: "image",
	video: "video",
	audio: "audio",
};

type ModeFilter = "all" | "featured" | DesignSkillMode | "uncategorized";

const MODE_LABELS: Record<DesignSkillMode | "uncategorized", string> = {
	prototype: "原型",
	deck: "幻灯片",
	template: "模板",
	"design-system": "设计系统",
	image: "图像",
	video: "视频",
	audio: "音频",
	utility: "工具",
	uncategorized: "其他",
};

const MODE_ORDER: (DesignSkillMode | "uncategorized")[] = [
	"prototype",
	"deck",
	"template",
	"design-system",
	"image",
	"video",
	"audio",
	"utility",
	"uncategorized",
];

const MODE_GRADIENT: Record<
	DesignSkillMode | "uncategorized",
	{ from: string; to: string }
> = {
	prototype: { from: "#F4E5DA", to: "#E0BFA1" },
	deck: { from: "#F6E7E2", to: "#E5B3A4" },
	template: { from: "#F2E9DC", to: "#D7B998" },
	"design-system": { from: "#E8E1F1", to: "#BBA9D6" },
	image: { from: "#E9F1E8", to: "#A5C7A0" },
	video: { from: "#DDE7F0", to: "#9FB7CE" },
	audio: { from: "#F1E5E5", to: "#D29B9B" },
	utility: { from: "#ECECE7", to: "#B5B5AC" },
	uncategorized: { from: "#F1ECE4", to: "#C8BBA4" },
};

function resolveMode(s: DesignSkillSummary): DesignSkillMode | "uncategorized" {
	if (s.mode) return s.mode;
	const g = s.group;
	if (g === "web") return "prototype";
	if (g === "mobile") return "prototype";
	if (g === "presentation") return "deck";
	if (g === "poster") return "image";
	if (g === "review") return "utility";
	return "uncategorized";
}

function gradientFor(mode: DesignSkillMode | "uncategorized") {
	return MODE_GRADIENT[mode] ?? MODE_GRADIENT.uncategorized;
}

export function BuiltinSkillsTab() {
	const isStarting = useDesignStoreSelector((s) => s.isStarting);
	const [skills, setSkills] = useState<DesignSkillSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<ModeFilter>("all");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const list = await designListBuiltinSkills();
				if (cancelled) return;
				setSkills(list);
			} catch (err) {
				console.warn("[BuiltinSkillsTab] failed", err);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handlePickSkill = (skill: DesignSkillSummary) => {
		// 预填 NewProjectPanel：根据 skill.mode 决定打开哪个 tab
		const kind = skill.mode ? SKILL_MODE_TO_KIND[skill.mode] : undefined;
		designStore.setNewProjectSeed({
			kind: kind ?? "prototype",
			titleHint: `基于 Skill: ${skill.name}`,
		});
		toast.success(
			`已选定「${skill.name}」，请在左栏填写简介后点击「创建并生成」`,
		);
	};

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const out = skills.filter((s) => {
			if (q) {
				const hay = [
					s.name,
					s.description,
					s.category ?? "",
					s.group ?? "",
					(s.triggers ?? []).join(" "),
				]
					.join(" ")
					.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			if (filter === "all") return true;
			if (filter === "featured") return (s.featured ?? 0) > 0;
			return resolveMode(s) === filter;
		});
		// 排序：featured desc → name asc；review 类 skill 永远沉底
		return out.sort((a, b) => {
			const ar = a.name.includes("review") ? 1 : 0;
			const br = b.name.includes("review") ? 1 : 0;
			if (ar !== br) return ar - br;
			const af = a.featured ?? 0;
			const bf = b.featured ?? 0;
			if (af !== bf) return bf - af;
			return a.name.localeCompare(b.name);
		});
	}, [skills, query, filter]);

	const grouped = useMemo(() => {
		const map = new Map<
			DesignSkillMode | "uncategorized",
			DesignSkillSummary[]
		>();
		for (const s of filtered) {
			const m = resolveMode(s);
			if (!map.has(m)) map.set(m, []);
			map.get(m)?.push(s);
		}
		return MODE_ORDER.filter((m) => map.has(m)).map((m) => ({
			mode: m,
			items: map.get(m) ?? [],
		}));
	}, [filtered]);

	const featured = useMemo(
		() =>
			skills
				.filter((s) => (s.featured ?? 0) > 0)
				.sort((a, b) => (b.featured ?? 0) - (a.featured ?? 0)),
		[skills],
	);

	const counts = useMemo(() => {
		const map = new Map<ModeFilter, number>();
		map.set("all", skills.length);
		map.set("featured", featured.length);
		for (const m of MODE_ORDER) map.set(m, 0);
		for (const s of skills) {
			const m = resolveMode(s);
			map.set(m, (map.get(m) ?? 0) + 1);
		}
		return map;
	}, [skills, featured]);

	if (loading) {
		return (
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton
						key={i}
						className="h-44 rounded-2xl bg-warm-200/40 animate-pulse"
					/>
				))}
			</div>
		);
	}

	if (skills.length === 0) {
		return (
			<div className="py-12 text-center text-sm text-text-muted">
				尚未发现内置 Skill。请确认 builtin-skills 资源已 bootstrap。
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-3 sticky top-0 z-10 bg-bg-base/85 backdrop-blur-md pt-1 pb-2">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/70" />
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={`搜索 ${skills.length} 个 Skill — 名称、描述、触发词、分类…`}
						className="w-full pl-9 pr-3 py-2 text-[12.5px] rounded-xl bg-white/70 dark:bg-cream-900/40 border border-cream-200 dark:border-cream-600/60 text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-4 focus:ring-[#D96C46]/10 focus:border-[#D96C46]/40 transition"
					/>
				</div>
				<div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
					<FilterChip
						active={filter === "all"}
						onClick={() => setFilter("all")}
						count={counts.get("all") ?? 0}
					>
						全部
					</FilterChip>
					{featured.length > 0 && (
						<FilterChip
							active={filter === "featured"}
							onClick={() => setFilter("featured")}
							count={counts.get("featured") ?? 0}
							icon={<Star className="w-3 h-3" strokeWidth={2} />}
						>
							精选
						</FilterChip>
					)}
					{MODE_ORDER.map((m) => {
						const c = counts.get(m) ?? 0;
						if (c === 0) return null;
						return (
							<FilterChip
								key={m}
								active={filter === m}
								onClick={() => setFilter(m)}
								count={c}
							>
								{MODE_LABELS[m]}
							</FilterChip>
						);
					})}
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="py-10 text-center text-[13px] text-text-muted">
					没有匹配的 Skill。试试别的关键词或切换分类。
				</div>
			) : (
				grouped.map(({ mode, items }) => (
					<section key={mode} className="flex flex-col gap-2.5">
						<header className="flex items-baseline gap-2 px-0.5">
							<h3 className="text-[12px] font-semibold text-text-secondary tracking-wide">
								{MODE_LABELS[mode]}
							</h3>
							<span className="text-[10.5px] text-text-muted/70">
								{items.length}
							</span>
						</header>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{items.map((s) => (
								<SkillCard
									key={s.name}
									skill={s}
									disabled={isStarting}
									onPick={() => handlePickSkill(s)}
								/>
							))}
						</div>
					</section>
				))
			)}
		</div>
	);
}

function FilterChip({
	active,
	onClick,
	count,
	icon,
	children,
}: {
	active: boolean;
	onClick: () => void;
	count: number;
	icon?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-all border",
				active
					? "bg-[#D96C46] text-white border-[#D96C46] shadow-sm"
					: "bg-white/60 dark:bg-cream-900/40 text-text-secondary border-cream-200 dark:border-cream-600/40 hover:bg-white hover:border-cream-300",
			)}
		>
			{icon}
			{children}
			<span
				className={cn(
					"text-[10px] font-normal tabular-nums",
					active ? "text-white/80" : "text-text-muted/70",
				)}
			>
				{count}
			</span>
		</button>
	);
}

function SkillCard({
	skill,
	disabled,
	onPick,
}: {
	skill: DesignSkillSummary;
	disabled: boolean;
	onPick: () => void;
}) {
	const mode = resolveMode(skill);
	const g = gradientFor(mode);
	const isFeatured = (skill.featured ?? 0) > 0;

	const handleUpstream = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (skill.upstream) {
			window.open(skill.upstream, "_blank", "noopener,noreferrer");
		}
	};

	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onPick}
			className="group text-left flex flex-col rounded-2xl border border-border bg-bg-surface overflow-hidden hover:border-primary/40 hover:shadow-md transition-all duration-150 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
		>
			<div
				className="aspect-[16/10] w-full relative flex items-end p-4 border-b border-border/60"
				style={{
					backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})`,
				}}
			>
				<div className="absolute top-3 right-3 flex items-center gap-1.5">
					{isFeatured && (
						<span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#D96C46]/90 text-white backdrop-blur-sm">
							<Star className="w-2.5 h-2.5" strokeWidth={2.4} />
							精选
						</span>
					)}
					<span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/70 text-text-primary backdrop-blur-sm">
						<Sparkles className="w-2.5 h-2.5" strokeWidth={2} />
						{MODE_LABELS[mode]}
					</span>
				</div>
				<div className="flex flex-col gap-1 max-w-full pr-2">
					<div className="text-base font-semibold text-text-primary leading-tight line-clamp-2">
						{skill.name}
					</div>
					{(skill.category || skill.surface || skill.platform) && (
						<div className="text-[11px] text-text-primary/70 truncate">
							{[skill.category, skill.surface, skill.platform]
								.filter(Boolean)
								.join(" · ")}
						</div>
					)}
				</div>
			</div>
			<div className="px-4 py-3 flex flex-col gap-1.5 flex-1">
				<p className="text-[12.5px] text-text-muted leading-relaxed line-clamp-3">
					{skill.description}
				</p>
				<div className="flex flex-wrap items-center gap-1 pt-1 mt-auto">
					{skill.triggers?.slice(0, 3).map((t) => (
						<span
							key={t}
							className="text-[10px] px-2 py-0.5 rounded-full bg-warm-200/60 text-text-muted"
						>
							{t}
						</span>
					))}
					{skill.upstream && (
						<button
							type="button"
							onClick={handleUpstream}
							title={skill.upstream}
							className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-muted/80 hover:text-[#D96C46] transition-colors"
						>
							<ExternalLink className="w-2.5 h-2.5" strokeWidth={2} />
							upstream
						</button>
					)}
				</div>
			</div>
		</button>
	);
}
