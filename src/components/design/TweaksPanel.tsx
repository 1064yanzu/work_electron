/**
 * TweaksPanel —— 给当前 skill 的 od.tweaks 渲染可调参数。
 *
 * - 调用 designListBuiltinSkills 取 tweaks 元数据
 * - 调用 designApplyTweak({ session_id, run_id, tweak_name, tweak_value }) 通过 runRegistry 注入 follow-up
 * - 改动 500ms 防抖，避免每个滑动都推一条消息
 */
import { Loader2, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	designApplyTweak,
	designListBuiltinSkills,
} from "../../lib/api/design";
import { RadioCardGroup } from "../ui/RadioCard";
import { toast } from "../ui/Toast";

interface DesignSkillTweak {
	name: string;
	type: "select" | "number";
	values?: string[];
	min?: number;
	max?: number;
	step?: number;
	default?: string | number;
}

interface DesignSkillSummary {
	name: string;
	description: string;
	version: string;
	triggers: string[];
	group?: string;
	default_frame?: string;
	tweaks?: DesignSkillTweak[];
}

const MODE_TO_PRIMARY_SKILL: Record<string, string> = {
	"web-prototype": "ipo-web-prototype",
	"mobile-mockup": "ipo-mobile-mockup",
	"pitch-deck": "ipo-pitch-deck",
	poster: "ipo-poster",
};

interface TweaksPanelProps {
	sessionId: string;
	runId: string | null;
	mode?: string;
	onClose?: () => void;
}

export function TweaksPanel({
	sessionId,
	runId,
	mode,
	onClose,
}: TweaksPanelProps) {
	const [skills, setSkills] = useState<DesignSkillSummary[]>([]);
	const [values, setValues] = useState<Record<string, string | number>>({});
	const [pendingTweak, setPendingTweak] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

	useEffect(() => {
		void (async () => {
			try {
				const list = await designListBuiltinSkills();
				setSkills(list);
			} catch (err) {
				console.warn("[TweaksPanel] load skills failed", err);
			} finally {
				setLoading(false);
			}
		})();
		return () => {
			for (const t of Object.values(timersRef.current)) {
				clearTimeout(t);
			}
		};
	}, []);

	const activeSkill = useMemo(() => {
		if (skills.length === 0) return null;
		const target = mode ? MODE_TO_PRIMARY_SKILL[mode] : null;
		if (target) {
			const hit = skills.find((s) => s.name === target);
			if (hit) return hit;
		}
		return (
			skills.find((s) => Array.isArray(s.tweaks) && s.tweaks.length > 0) ?? null
		);
	}, [skills, mode]);

	const tweaks = activeSkill?.tweaks ?? [];

	// 初始化默认值
	useEffect(() => {
		if (tweaks.length === 0) return;
		setValues((prev) => {
			const next = { ...prev };
			for (const t of tweaks) {
				if (next[t.name] == null && t.default != null) {
					next[t.name] = t.default;
				}
			}
			return next;
		});
	}, [tweaks]);

	const triggerApply = (tweak: DesignSkillTweak, value: string | number) => {
		setValues((prev) => ({ ...prev, [tweak.name]: value }));
		const existing = timersRef.current[tweak.name];
		if (existing) clearTimeout(existing);
		timersRef.current[tweak.name] = setTimeout(async () => {
			if (!runId) {
				toast.error("Agent 已结束，无法实时调整");
				return;
			}
			setPendingTweak(tweak.name);
			try {
				const res = await designApplyTweak({
					session_id: sessionId,
					run_id: runId,
					tweak_name: tweak.name,
					tweak_value: value,
				});
				if (!res.success) {
					toast.error(`调整失败：${res.error ?? "未知错误"}`);
				}
			} catch (err) {
				toast.error(
					`调整失败：${err instanceof Error ? err.message : String(err)}`,
				);
			} finally {
				setPendingTweak((prev) => (prev === tweak.name ? null : prev));
			}
		}, 500);
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center gap-2 py-8 text-xs text-text-muted">
				<Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
				加载 tweaks…
			</div>
		);
	}

	if (!activeSkill || tweaks.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-8 text-xs text-text-muted text-center px-3">
				<SlidersHorizontal className="w-5 h-5 opacity-50" strokeWidth={1.5} />
				当前 skill 未定义可调参数
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3 p-3">
			<header className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<SlidersHorizontal
						className="w-3.5 h-3.5 text-text-muted"
						strokeWidth={1.5}
					/>
					<span className="text-xs font-medium text-text-primary">Tweaks</span>
					<span className="text-[10px] text-text-muted">
						· {activeSkill.name}
					</span>
				</div>
				{onClose ? (
					<button
						type="button"
						onClick={onClose}
						className="p-1 rounded hover:bg-warm-200/60 text-text-muted hover:text-text-primary"
					>
						<X className="w-3 h-3" strokeWidth={1.5} />
					</button>
				) : null}
			</header>

			<div className="flex flex-col gap-3">
				{tweaks.map((tweak) => {
					const currentValue = values[tweak.name] ?? tweak.default ?? "";
					const isPending = pendingTweak === tweak.name;
					return (
						<div key={tweak.name} className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between text-xs">
								<span className="text-text-primary font-medium">
									{tweak.name}
								</span>
								<span
									className={`text-[10px] ${
										isPending ? "text-primary" : "text-text-muted"
									}`}
								>
									{isPending ? "应用中…" : String(currentValue)}
								</span>
							</div>
							{tweak.type === "select" && tweak.values ? (
								<RadioCardGroup
									value={String(currentValue)}
									onChange={(next) => triggerApply(tweak, next)}
									items={tweak.values.map((v) => ({
										value: v,
										label: v,
										disabled: !runId,
									}))}
									size="sm"
									layout="horizontal"
									aria-label={tweak.name}
								/>
							) : null}
							{tweak.type === "number" ? (
								<div className="flex items-center gap-2">
									<input
										type="range"
										min={tweak.min ?? 0}
										max={tweak.max ?? 100}
										step={tweak.step ?? 1}
										value={Number(currentValue) || 0}
										disabled={!runId}
										onChange={(e) =>
											triggerApply(tweak, Number(e.target.value))
										}
										className="flex-1 accent-primary disabled:opacity-50"
									/>
								</div>
							) : null}
						</div>
					);
				})}
			</div>

			{!runId ? (
				<div className="text-[10px] text-text-muted leading-relaxed border-t border-border pt-2">
					当前没有活跃的 Agent 运行，调节只会更新本地状态，不会同步到
					HTML。下次"重做"会带入这些参数作为初始值。
				</div>
			) : null}
		</div>
	);
}
