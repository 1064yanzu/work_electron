/**
 * DesignSettings — 创作与工具 · 设计模块
 *
 * 范围：
 *   - 工作目录（在 Finder 中打开）
 *   - 5 维自检（重做门控开关 + 评分模型）
 *   - 内置方向 / 设计系统 / Skill 资源（只读概览）
 *   - 媒体生成 provider（状态 + 是否需要 key）
 *
 * 设计设置都用 localStorage 持久化（轻量配置，无需走 DB）：
 *   - design.gateMode (boolean)
 *   - design.critiqueModel (string)
 */

import {
	CheckCircle2,
	FolderOpen,
	KeyRound,
	Palette,
	RotateCw,
	Sparkles,
	Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	designListBuiltinSkills,
	designListDirections,
	designListSystems,
	designMediaProviders,
	type DesignDirection,
	type DesignMediaProvider,
} from "../../../../lib/api/design";
import { invoke } from "../../../../lib/tauriCompat";
import { toast } from "../../../ui/Toast";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import { SettingsPageContainer } from "../../ui/SettingsPrimitives";

const GATE_KEY = "design.gateMode";
const MODEL_KEY = "design.critiqueModel";

function readBoolean(key: string, fallback = false): boolean {
	try {
		const v = localStorage.getItem(key);
		if (v === null) return fallback;
		return v === "1" || v === "true";
	} catch {
		return fallback;
	}
}
function readString(key: string, fallback = ""): string {
	try {
		return localStorage.getItem(key) ?? fallback;
	} catch {
		return fallback;
	}
}

interface SystemSummary {
	id: string;
	title: string;
	category: string;
	group: "product" | "style";
	swatches: string[];
}
interface SkillSummary {
	name: string;
	description: string;
	group?: string;
	default_frame?: string;
}

export function DesignSettings() {
	const [directions, setDirections] = useState<DesignDirection[]>([]);
	const [systems, setSystems] = useState<SystemSummary[]>([]);
	const [skills, setSkills] = useState<SkillSummary[]>([]);
	const [providers, setProviders] = useState<DesignMediaProvider[]>([]);
	const [loading, setLoading] = useState(true);

	const [gateMode, setGateMode] = useState(() => readBoolean(GATE_KEY, false));
	const [critiqueModel, setCritiqueModel] = useState(() =>
		readString(MODEL_KEY, "claude-haiku-4-5-20251001"),
	);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [d, s, sk, p] = await Promise.all([
					designListDirections(),
					designListSystems(),
					designListBuiltinSkills(),
					designMediaProviders(),
				]);
				if (cancelled) return;
				setDirections(d);
				setSystems(s as SystemSummary[]);
				setSkills(sk as SkillSummary[]);
				setProviders(p);
			} catch (err) {
				console.warn("[DesignSettings] init failed", err);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleGateToggle = (value: boolean) => {
		setGateMode(value);
		try {
			localStorage.setItem(GATE_KEY, value ? "1" : "0");
		} catch {
			// ignore
		}
	};

	const handleModelChange = (value: string) => {
		setCritiqueModel(value);
		try {
			localStorage.setItem(MODEL_KEY, value);
		} catch {
			// ignore
		}
	};

	const handleRevealDesignsRoot = async () => {
		try {
			const result = await invoke<{ userDataPath?: string }>(
				"system_get_user_info",
			).catch(() => ({}) as { userDataPath?: string });
			const userData = result.userDataPath;
			if (!userData) {
				toast.warning("无法获取应用数据目录路径");
				return;
			}
			await invoke("reveal_file_safe", { path: `${userData}/designs` });
		} catch (err) {
			toast.error(
				`打开目录失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const productSystems = systems.filter((s) => s.group === "product");
	const styleSystems = systems.filter((s) => s.group === "style");

	return (
		<SettingsPageContainer contentClassName="max-w-3xl space-y-6">
			<SettingsPanelHeader
				icon={Palette}
				title="设计模块"
				description="把自然语言简介 → HTML 设计稿；内置方向、设计系统、5 维自检、多模态资产生成与多格式导出。"
			/>

			<section className="rounded-2xl border border-border bg-bg-surface p-5 space-y-3">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-sm font-semibold text-text-primary">
							工作目录
						</h3>
						<p className="text-xs text-text-muted mt-0.5">
							所有设计会话的 HTML / assets 都生成在{" "}
							<code className="text-[11px] bg-warm-200 px-1.5 py-0.5 rounded">
								&lt;userData&gt;/designs/&lt;session_id&gt;/
							</code>
							。
						</p>
					</div>
					<button
						type="button"
						onClick={() => void handleRevealDesignsRoot()}
						className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-bg-surface text-text-primary border border-border hover:bg-warm-200/60 transition-colors"
					>
						<FolderOpen className="w-3.5 h-3.5" strokeWidth={1.5} />在 Finder
						中打开
					</button>
				</div>
			</section>

			<section className="rounded-2xl border border-border bg-bg-surface p-5 space-y-4">
				<div>
					<h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
						<Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />5
						维自检
					</h3>
					<p className="text-xs text-text-muted mt-0.5">
						每次生成完成后自动调用一次 Critique 引擎；开启「Gate
						模式」时引擎额外输出{" "}
						<code className="text-[11px]">
							passed / lowest_dim / regenerate_reason
						</code>{" "}
						字段，便于一键发起重做。
					</p>
				</div>

				<label className="flex items-center justify-between cursor-pointer">
					<div>
						<div className="text-sm text-text-primary">Self-Gate 评分门控</div>
						<div className="text-[11px] text-text-muted">
							总分 ≥ 40 且每维 ≥ 6 才标记 passed=true
						</div>
					</div>
					<button
						type="button"
						role="switch"
						aria-checked={gateMode}
						onClick={() => handleGateToggle(!gateMode)}
						className={`relative w-10 h-6 rounded-full transition-colors ${
							gateMode ? "bg-primary" : "bg-warm-200"
						}`}
					>
						<span
							className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
								gateMode ? "translate-x-4" : "translate-x-0"
							}`}
						/>
					</button>
				</label>

				<div>
					<label
						htmlFor="design-critique-model"
						className="text-xs text-text-muted block mb-1"
					>
						评分模型
					</label>
					<input
						id="design-critique-model"
						type="text"
						value={critiqueModel}
						onChange={(e) => handleModelChange(e.target.value)}
						placeholder="claude-haiku-4-5-20251001"
						className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50"
					/>
					<div className="text-[11px] text-text-muted mt-1">
						推荐 Haiku 系列（评分负载轻、单次 60k 字符以内）。也可填入
						GPT-4.1-mini / DeepSeek 等。
					</div>
				</div>
			</section>

			<section className="rounded-2xl border border-border bg-bg-surface p-5">
				<div className="flex items-center justify-between mb-4">
					<div>
						<h3 className="text-sm font-semibold text-text-primary">
							内置方向（{directions.length} 个）
						</h3>
						<p className="text-xs text-text-muted mt-0.5">
							在 Discovery 表单的「品牌资产 → 我没有品牌」分支供选择；写入
							system prompt 的设计语言契约。
						</p>
					</div>
					{loading ? (
						<RotateCw className="w-4 h-4 text-text-muted animate-spin" />
					) : null}
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					{directions.map((d) => (
						<div
							key={d.id}
							className="flex flex-col rounded-xl border border-border overflow-hidden"
						>
							<div className="flex h-1.5">
								<div className="flex-1" style={{ background: d.palette.bg }} />
								<div className="flex-1" style={{ background: d.palette.fg }} />
								<div
									className="flex-1"
									style={{ background: d.palette.accent }}
								/>
								<div
									className="flex-1"
									style={{ background: d.palette.muted }}
								/>
							</div>
							<div className="p-3 bg-bg-surface">
								<div className="text-sm font-medium text-text-primary">
									{d.label}
								</div>
								<div className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
									{d.mood}
								</div>
								<div className="text-[10px] text-text-muted mt-2 truncate">
									字: {d.display_font}
								</div>
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="rounded-2xl border border-border bg-bg-surface p-5">
				<h3 className="text-sm font-semibold text-text-primary mb-1">
					Design Systems（{systems.length} 个）
				</h3>
				<p className="text-xs text-text-muted mb-3">
					Product = 真实产品风（Linear / Stripe…）；Style =
					风格流派（Glassmorphism / Brutalism…）。
				</p>
				{productSystems.length > 0 ? (
					<>
						<div className="text-[11px] text-text-muted uppercase tracking-wide mb-1.5">
							Product · {productSystems.length}
						</div>
						<div className="flex flex-wrap gap-1.5 mb-3">
							{productSystems.map((s) => (
								<SystemChip key={s.id} sys={s} />
							))}
						</div>
					</>
				) : null}
				{styleSystems.length > 0 ? (
					<>
						<div className="text-[11px] text-text-muted uppercase tracking-wide mb-1.5">
							Style · {styleSystems.length}
						</div>
						<div className="flex flex-wrap gap-1.5">
							{styleSystems.map((s) => (
								<SystemChip key={s.id} sys={s} />
							))}
						</div>
					</>
				) : null}
			</section>

			<section className="rounded-2xl border border-border bg-bg-surface p-5">
				<h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-1.5">
					<Wand2 className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
					内置 Skill（{skills.length} 个）
				</h3>
				<p className="text-xs text-text-muted mb-3">
					每个 Skill 对应一个生成 mode（web-prototype / mobile-mockup /
					pitch-deck / poster…）。
				</p>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
					{skills.map((s) => (
						<div
							key={s.name}
							className="rounded-lg border border-border bg-background px-3 py-2"
						>
							<div className="text-xs font-medium text-text-primary truncate">
								{s.name}
							</div>
							<div className="text-[11px] text-text-muted mt-0.5 line-clamp-2 leading-relaxed">
								{s.description}
							</div>
							{s.default_frame ? (
								<div className="text-[10px] text-text-muted mt-1">
									默认框：{s.default_frame}
								</div>
							) : null}
						</div>
					))}
				</div>
			</section>

			<section className="rounded-2xl border border-border bg-bg-surface p-5">
				<h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-1.5">
					<KeyRound className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
					媒体生成 Provider（{providers.length} 个）
				</h3>
				<p className="text-xs text-text-muted mb-3">
					图像 / 视频 / 音频 / 音乐生成入口；标 🔑 的 provider
					需要在「Providers」面板中配置对应 API Key。
				</p>
				<div className="flex flex-col gap-1.5">
					{providers.map((p) => (
						<div
							key={p.id}
							className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
						>
							<div>
								<div className="text-xs font-medium text-text-primary">
									{p.label}
								</div>
								<div className="text-[11px] text-text-muted mt-0.5">
									支持：{p.kinds.join(" / ")}
								</div>
							</div>
							{p.requires_key ? (
								<span className="text-[10px] text-amber-600 inline-flex items-center gap-1">
									<KeyRound className="w-3 h-3" strokeWidth={1.5} />需 Key
								</span>
							) : (
								<span className="text-[10px] text-primary inline-flex items-center gap-1">
									<CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
									开箱即用
								</span>
							)}
						</div>
					))}
				</div>
			</section>
		</SettingsPageContainer>
	);
}

function SystemChip({ sys }: { sys: SystemSummary }) {
	return (
		<div
			className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background pl-1 pr-2.5 py-0.5"
			title={sys.title}
		>
			<div className="flex h-3 rounded-full overflow-hidden">
				{sys.swatches.slice(0, 4).map((c, i) => (
					<div
						key={`${sys.id}-sw-${i}`}
						className="w-2.5"
						style={{ background: c }}
					/>
				))}
			</div>
			<span className="text-[10px] text-text-primary">{sys.title}</span>
		</div>
	);
}
