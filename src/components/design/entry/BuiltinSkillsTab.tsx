import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
	designListBuiltinSkills,
	designListSessions,
	designStartSession,
} from "../../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../../lib/stores";
import { toast } from "../../ui/Toast";

interface SkillSummary {
	name: string;
	description: string;
	version: string;
	triggers: string[];
	group?: string;
	default_frame?: string;
}

// 把 SDK skill name 映射到 mode（用于 system prompt 拼装时 inferMode 兜底）
const SKILL_NAME_TO_MODE: Record<string, string> = {
	"ipo-web-prototype": "web-prototype",
	"ipo-mobile-mockup": "mobile-mockup",
	"ipo-pitch-deck": "pitch-deck",
	"ipo-poster": "poster",
};

function gradientFor(group?: string): { from: string; to: string } {
	switch (group) {
		case "web":
			return { from: "#F4E5DA", to: "#E0BFA1" };
		case "mobile":
			return { from: "#E8E1F1", to: "#BBA9D6" };
		case "presentation":
			return { from: "#F6E7E2", to: "#E5B3A4" };
		case "poster":
			return { from: "#E9F1E8", to: "#A5C7A0" };
		default:
			return { from: "#F2E9DC", to: "#D7B998" };
	}
}

export function BuiltinSkillsTab() {
	const isStarting = useDesignStoreSelector((s) => s.isStarting);
	const [skills, setSkills] = useState<SkillSummary[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const list = await designListBuiltinSkills();
				if (cancelled) return;
				// review skill 单独放后面或隐藏（它是辅助）
				setSkills(
					list.sort((a, b) => {
						const aReview = a.name.includes("review") ? 1 : 0;
						const bReview = b.name.includes("review") ? 1 : 0;
						return aReview - bReview;
					}),
				);
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

	const handlePickSkill = async (skill: SkillSummary) => {
		try {
			designStore.setStarting(true);
			const result = await designStartSession({ title: `基于 Skill: ${skill.name}` });
			designStore.setDiscoveryForm(result.discovery_form);
			designStore.setCurrentSession({
				id: result.session_id,
				title: `基于 Skill: ${skill.name}`,
				status: "draft",
				work_dir: result.work_dir,
				created_at: Date.now(),
				updated_at: Date.now(),
			});
			designStore.resetDraft();
			// 用 skill name 推导 mode；direction_id 留空让 discovery 阶段决定
			const mode = SKILL_NAME_TO_MODE[skill.name];
			if (mode) {
				designStore.patchDraftAnswers({
					mode,
					answers: mode ? { mode } : {},
				});
			}
			designStore.setStage("discovery");
			const list = await designListSessions({ limit: 50 });
			designStore.setSessionsList(list);
		} catch (err) {
			toast.error(
				`新建失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			designStore.setStarting(false);
		}
	};

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
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			{skills.map((s) => {
				const g = gradientFor(s.group);
				return (
					<button
						key={s.name}
						type="button"
						disabled={isStarting}
						onClick={() => void handlePickSkill(s)}
						className="group text-left flex flex-col rounded-2xl border border-border bg-bg-surface overflow-hidden hover:border-primary/40 hover:shadow-md transition-all duration-150 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
					>
						<div
							className="aspect-[16/10] w-full relative flex items-end p-4 border-b border-border/60"
							style={{
								backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})`,
							}}
						>
							<div className="absolute top-3 right-3">
								<span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/70 text-text-primary backdrop-blur-sm">
									<Sparkles className="w-2.5 h-2.5" strokeWidth={2} />
									Skill
								</span>
							</div>
							<div className="flex flex-col gap-1 max-w-full">
								<div className="text-base font-semibold text-text-primary leading-tight">
									{s.name}
								</div>
								{s.group ? (
									<div className="text-[11px] text-text-primary/70">
										{s.group}
										{s.default_frame ? ` · ${s.default_frame}` : ""}
									</div>
								) : null}
							</div>
						</div>
						<div className="px-4 py-3 flex flex-col gap-1.5">
							<p className="text-[12.5px] text-text-muted leading-relaxed line-clamp-2">
								{s.description}
							</p>
							{s.triggers?.length ? (
								<div className="flex flex-wrap gap-1 pt-1">
									{s.triggers.slice(0, 3).map((t) => (
										<span
											key={t}
											className="text-[10px] px-2 py-0.5 rounded-full bg-warm-200/60 text-text-muted"
										>
											{t}
										</span>
									))}
								</div>
							) : null}
						</div>
					</button>
				);
			})}
		</div>
	);
}
