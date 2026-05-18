/**
 * NewProjectPanel — Design 入口左栏「创建项目」紧凑面板
 *
 * 4 tab：原型 / 幻灯片 / 从模板 / 媒体。
 * - 前三个：在本面板里**一次性**完成 startSession + submitDiscovery，把
 *   prompt / metadata / systemId 直接 mapping 成 discovery answers，拿到
 *   launch_payload 写进 designStore.draftLaunch（**草稿态**）；同时把简介
 *   注入右栏 Copilot 输入框。**不直接启动 SDK**——用户需要在 Copilot 里
 *   按发送（携带最终 prompt），或在中栏「开始生成」按钮上确认，才会真正
 *   把 draftLaunch 转成 pendingLaunch 启动 Agent。
 * - 媒体走 design_media_generate（不创建 design session）。
 *
 * 二级入口（SystemsLibrary / BuiltinSkills / BrandExtract）通过
 * `designStore.setNewProjectSeed` 给本面板预填字段；本面板 mount 时一次性
 * 消费并清空。
 */
import {
	FileText,
	Image as ImageIcon,
	Layers,
	Loader2,
	Plus,
	Presentation,
	Sparkles,
	ExternalLink,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	designListSessions,
	designMediaGenerate,
	designSaveMediaTemplate,
	designStartSession,
	designSubmitDiscovery,
	type DesignProjectKind,
	type DesignProjectPlatform,
	type DesignProjectPrecision,
	type DesignSessionMetadata,
	type DiscoveryAnswers,
} from "../../../../lib/api/design";
import { getActiveModel } from "../../../../lib/api/providers";
import {
	designStore,
	layoutStore,
	useDesignStoreSelector,
} from "../../../../lib/stores";
import { invoke } from "../../../../lib/tauriCompat";
import { EVENTS, events } from "../../../../lib/events";
import { Button } from "../../../ui/Button";
import { Tabs, type TabItem } from "../../../ui/Tabs";
import { Toggle } from "../../../Settings/components/Toggle";
import { toast } from "../../../ui/Toast";
import { cn } from "../../../../lib/utils";
import { DesignSystemPicker } from "./DesignSystemPicker";
import { FidelityPicker } from "./FidelityPicker";
import { MediaProjectOptions, type MediaKind } from "./MediaProjectOptions";
import { MediaTemplatePicker } from "./MediaTemplatePicker";
import { PlatformPicker } from "./PlatformPicker";
import { TemplatePicker } from "./TemplatePicker";

type PanelTab = "prototype" | "deck" | "template" | "media";

const TAB_ITEMS: TabItem<PanelTab>[] = [
	{
		value: "prototype",
		label: "原型",
		icon: <Layers className="w-3.5 h-3.5" strokeWidth={1.6} />,
	},
	{
		value: "deck",
		label: "幻灯片",
		icon: <Presentation className="w-3.5 h-3.5" strokeWidth={1.6} />,
	},
	{
		value: "template",
		label: "从模板",
		icon: <FileText className="w-3.5 h-3.5" strokeWidth={1.6} />,
	},
	{
		value: "media",
		label: "媒体",
		icon: <ImageIcon className="w-3.5 h-3.5" strokeWidth={1.6} />,
	},
];

interface MediaResult {
	kind: MediaKind;
	provider: string;
	status: "queued" | "running" | "done" | "failed";
	asset_paths: string[];
	prompt: string;
	error?: string;
}

function FieldLabel({
	children,
	hint,
}: {
	children: React.ReactNode;
	hint?: string;
}) {
	return (
		<div className="flex items-center justify-between gap-2 mb-1.5 px-0.5">
			<label className="text-[12px] font-semibold text-text-secondary tracking-wide">
				{children}
			</label>
			{hint && <span className="text-[10.5px] text-text-muted/70">{hint}</span>}
		</div>
	);
}

function ToggleRow({
	label,
	description,
	checked,
	onChange,
}: {
	label: string;
	description?: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onChange(!checked)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onChange(!checked);
				}
			}}
			className={cn(
				"group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left w-full cursor-pointer",
				"bg-white/40 dark:bg-cream-900/40 backdrop-blur-sm",
				"border border-cream-200/60 dark:border-cream-600/40",
				"shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-200",
				"hover:bg-white/80 dark:hover:bg-cream-900/80 hover:border-cream-300 dark:hover:border-cream-500 hover:shadow-sm",
				"active:scale-[0.985]",
				checked && "border-[#D96C46]/30 bg-[#D96C46]/5 dark:bg-[#D96C46]/10",
			)}
		>
			<div className="min-w-0 flex-1">
				<div
					className={cn(
						"text-[12.5px] font-medium transition-colors",
						checked
							? "text-text-primary"
							: "text-text-secondary group-hover:text-text-primary truncate",
					)}
				>
					{label}
				</div>
				{description && (
					<div className="text-[11px] text-text-muted/80 truncate mt-0.5">
						{description}
					</div>
				)}
			</div>
			<Toggle checked={checked} onChange={() => onChange(!checked)} size="sm" />
		</div>
	);
}

/**
 * NewProjectPanel 字段 + 元数据 → discovery answers 映射。
 * - output_kind：tab + platforms 推断
 * - topic：prompt 必填（空时给兜底但 UI 已经禁用提交）
 * - tone：默认 modern-minimal，systemId 存在时由 DESIGN.md 接管
 * - brand：systemId → brand-spec，否则 pick-direction
 * - scale：deck / includeLanding 等综合判断
 */
function buildDiscoveryAnswers(input: {
	prompt: string;
	tab: PanelTab;
	platforms: DesignProjectPlatform[];
	systemId: string | null;
	includeLanding: boolean;
}): DiscoveryAnswers {
	let output_kind: string;
	if (input.tab === "prototype") {
		const isMobile = input.platforms.some(
			(p) => p === "mobile-ios" || p === "mobile-android",
		);
		output_kind = isMobile ? "mobile-mockup" : "web-prototype";
	} else if (input.tab === "deck") {
		output_kind = "pitch-deck";
	} else {
		// template 默认 web-prototype；具体模板会通过 metadata.template_id 注入
		output_kind = "web-prototype";
	}

	const brand: string = input.systemId ? "brand-spec" : "pick-direction";

	const scale =
		input.tab === "deck"
			? "single-screen"
			: input.includeLanding
				? "landing-page"
				: "landing-page";

	const topic =
		input.prompt.trim() || "（用户未填写简介，请先在对话里追问意图）";

	return {
		output_kind,
		topic,
		tone: "modern-minimal",
		brand,
		scale,
	};
}

export function NewProjectPanel() {
	const [tab, setTab] = useState<PanelTab>("prototype");
	const [title, setTitle] = useState("");
	const [prompt, setPrompt] = useState("");

	// prototype / deck 通用
	const [systemId, setSystemId] = useState<string | null>(null);

	// prototype
	const [platforms, setPlatforms] = useState<DesignProjectPlatform[]>([
		"responsive",
	]);
	const [precision, setPrecision] =
		useState<DesignProjectPrecision>("high-fidelity");
	const [includeLanding, setIncludeLanding] = useState(false);
	const [includeOsWidgets, setIncludeOsWidgets] = useState(false);

	// deck
	const [speakerNotes, setSpeakerNotes] = useState(true);
	const [animations, setAnimations] = useState(false);

	// template
	const [templateId, setTemplateId] = useState<string | null>(null);

	// media
	const [mediaKind, setMediaKind] = useState<MediaKind>("image");
	const [mediaProvider, setMediaProvider] = useState<string>("");
	const [mediaAspect, setMediaAspect] = useState<string>("1:1");
	const [mediaDuration, setMediaDuration] = useState<number>(5);
	const [mediaTemplateId, setMediaTemplateId] = useState<string | null>(null);
	const [mediaResult, setMediaResult] = useState<MediaResult | null>(null);

	const [submitting, setSubmitting] = useState(false);

	// 消费二级入口塞进来的预填种子（systemId / kind / titleHint 等）
	const newProjectSeed = useDesignStoreSelector((s) => s.newProjectSeed);
	useEffect(() => {
		if (!newProjectSeed) return;
		if (newProjectSeed.systemId) setSystemId(newProjectSeed.systemId);
		if (newProjectSeed.kind === "deck") setTab("deck");
		else if (newProjectSeed.kind === "template") setTab("template");
		else if (
			newProjectSeed.kind === "image" ||
			newProjectSeed.kind === "video" ||
			newProjectSeed.kind === "audio"
		) {
			setTab("media");
			setMediaKind(newProjectSeed.kind as MediaKind);
		} else if (newProjectSeed.kind === "prototype") {
			setTab("prototype");
		}
		if (newProjectSeed.titleHint && !title) setTitle(newProjectSeed.titleHint);
		// 一次性消费；session_id / work_dir 保留到 handleSubmit 时读 store
		// （读完才决定要不要再 startSession）
	}, [newProjectSeed, title]);

	const canSubmit = (() => {
		if (submitting) return false;
		if (tab === "media") {
			return mediaProvider.trim().length > 0 && prompt.trim().length > 0;
		}
		if (tab === "template" && !templateId) return false;
		// 主路径必须有简介 —— 没简介意味着 agent 跑起来无从下笔
		return prompt.trim().length > 0;
	})();

	const buildMetadata = (): DesignSessionMetadata => {
		const kindMap: Record<PanelTab, DesignProjectKind> = {
			prototype: "prototype",
			deck: "deck",
			template: "template",
			media: mediaKind,
		};
		const kind = kindMap[tab];

		if (tab === "prototype") {
			return {
				kind,
				platforms,
				precision,
				design_system_id: systemId,
				include_landing_page: includeLanding,
				include_os_widgets: includeOsWidgets,
			};
		}
		if (tab === "deck") {
			return {
				kind,
				design_system_id: systemId,
				speaker_notes: speakerNotes,
				animations,
			};
		}
		if (tab === "template") {
			return {
				kind,
				template_id: templateId,
				design_system_id: systemId,
			};
		}
		// media
		return {
			kind,
			media_model: mediaProvider,
			media_aspect: mediaAspect,
			media_duration_sec: mediaDuration,
		};
	};

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setSubmitting(true);
		const resolvedTitle =
			title.trim() ||
			(tab === "media"
				? `媒体生成 · ${new Date().toLocaleString("zh-CN", { hour12: false })}`
				: prompt.trim().slice(0, 24) || "未命名设计");
		try {
			if (tab === "media") {
				if (!prompt.trim()) {
					toast.error("请填写提示词");
					return;
				}
				setMediaResult({
					kind: mediaKind,
					provider: mediaProvider,
					status: "running",
					asset_paths: [],
					prompt: prompt.trim(),
				});
				const result = await designMediaGenerate({
					provider: mediaProvider,
					kind: mediaKind === "audio" ? "audio" : mediaKind,
					prompt: prompt.trim(),
					options: {
						aspect: mediaAspect,
						duration_sec: mediaKind === "image" ? undefined : mediaDuration,
					},
				});
				setMediaResult({
					kind: mediaKind,
					provider: mediaProvider,
					status: result.status,
					asset_paths: result.asset_paths ?? [],
					prompt: prompt.trim(),
					error: result.error,
				});
				if (result.status === "done") {
					toast.success("媒体生成完成");
				} else if (result.status === "failed") {
					toast.error(result.error || "媒体生成失败");
				}
				return;
			}

			// prototype / deck / template —— 快速通道：一次性创建并提交，
			// 拿到 launch_payload 后由 DesignWorkspace 监听并启动 SDK
			const metadata = buildMetadata();

			// 如果 seed 给了已创建的 session（典型场景：BrandExtractTab 已经为
			// brand-spec 写盘开了草稿），就接管它，避免新建工作目录
			const seed = designStore.getState().newProjectSeed;
			let sessionId: string;
			let workDir: string;
			if (seed?.sessionId && seed?.workDir) {
				sessionId = seed.sessionId;
				workDir = seed.workDir;
			} else {
				const startResult = await designStartSession({
					title: resolvedTitle,
					initial_brief: prompt.trim() || undefined,
					metadata,
				});
				sessionId = startResult.session_id;
				workDir = startResult.work_dir;
			}

			const answers = buildDiscoveryAnswers({
				prompt,
				tab,
				platforms,
				systemId,
				includeLanding,
			});

			const activeModel = await getActiveModel().catch(() => null);
			const model = activeModel || "claude-sonnet-4-5";

			const submitResult = await designSubmitDiscovery({
				session_id: sessionId,
				answers,
				direction_id: "modern-minimal",
				system_id: systemId ?? undefined,
				model,
			});

			designStore.setCurrentSession({
				id: sessionId,
				title: resolvedTitle,
				status: "draft",
				work_dir: workDir,
				system_id: systemId ?? undefined,
				metadata,
				created_at: Date.now(),
				updated_at: Date.now(),
			});
			designStore.setDraftLaunch({
				sessionId,
				payload: submitResult.launch_payload,
				initialPrompt: prompt.trim(),
			});
			designStore.setStage("draft");
			designStore.clearNewProjectSeed();

			// 中栏切到 design 主视图（如果用户从其它视图过来）
			layoutStore.setMainView("design");

			// 把简介作为草稿注入 Copilot 输入框，让用户继续在右栏对话
			events.emit(EVENTS.SLASH_FILL_INPUT, { text: prompt.trim() });

			// 刷新最近设计列表
			try {
				const list = await designListSessions({ limit: 50 });
				designStore.setSessionsList(list);
			} catch {
				// 忽略列表刷新失败
			}
		} catch (err) {
			console.error("[NewProjectPanel] submit failed", err);
			toast.error(
				`创建失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="h-full flex flex-col bg-white/60 dark:bg-black/20 backdrop-blur-md border-r border-cream-200/70 dark:border-cream-700/40">
			{/* Header */}
			<div className="px-5 pt-6 pb-4 flex flex-col gap-2.5 border-b border-cream-200/50 dark:border-cream-700/30 bg-white/40 dark:bg-black/10">
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#D96C46]/20 to-[#D96C46]/5 border border-[#D96C46]/10 text-[#D96C46] flex items-center justify-center shadow-sm">
						<Sparkles className="w-4 h-4" strokeWidth={2} />
					</div>
					<h2 className="text-[16px] font-bold text-text-primary tracking-tight">
						创建项目
					</h2>
				</div>
				<p className="text-[12px] text-text-secondary leading-relaxed">
					选一种形态，填一句简介，剩下交给 Agent。
				</p>
			</div>

			{/* Body */}
			<div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4 custom-scrollbar">
				{/* 项目名 */}
				<div>
					<FieldLabel hint="可选">项目名</FieldLabel>
					<input
						type="text"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder={tab === "media" ? `媒体生成 · 自动填充` : "未命名设计"}
						maxLength={80}
						className={cn(
							"w-full px-3 py-2.5 text-[13px] transition-all duration-200",
							"bg-white/80 dark:bg-cream-900/50 backdrop-blur-sm",
							"border border-cream-200 dark:border-cream-600/60",
							"rounded-xl text-text-primary placeholder:text-text-muted/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
							"hover:border-cream-300 dark:hover:border-cream-500",
							"focus:outline-none focus:ring-4 focus:ring-[#D96C46]/10 focus:border-[#D96C46]/40 focus:bg-white dark:focus:bg-cream-900",
						)}
					/>
				</div>

				{/* Tab 切换 */}
				<div>
					<Tabs<PanelTab>
						value={tab}
						onChange={setTab}
						items={TAB_ITEMS}
						variant="segmented"
						size="sm"
						fullWidth
					/>
				</div>

				{/* 简介 / 提示词 */}
				<div>
					<FieldLabel>{tab === "media" ? "提示词" : "一句话简介"}</FieldLabel>
					<div className="group relative">
						<textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							rows={4}
							placeholder={
								tab === "media"
									? "描述你要生成的画面 / 视频 / 音乐"
									: "比如：为一款 AI 阅读助手做着陆页，主色橙调，强调智能与温度"
							}
							className={cn(
								"w-full px-3.5 py-3 text-[13px] resize-none transition-all duration-200 min-h-[100px]",
								"bg-white/80 dark:bg-cream-900/50 backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
								"border border-cream-200 dark:border-cream-600/60",
								"rounded-xl text-text-primary placeholder:text-text-muted/60",
								"hover:border-cream-300 dark:hover:border-cream-500",
								"focus:outline-none focus:ring-4 focus:ring-[#D96C46]/10 focus:border-[#D96C46]/40 focus:bg-white dark:focus:bg-cream-900",
								"leading-relaxed",
							)}
						/>
					</div>
				</div>

				{/* Per-tab 字段 */}
				{tab === "prototype" && (
					<>
						<div>
							<FieldLabel>平台</FieldLabel>
							<PlatformPicker value={platforms} onChange={setPlatforms} />
						</div>
						<div>
							<FieldLabel hint="可选">设计系统</FieldLabel>
							<DesignSystemPicker value={systemId} onChange={setSystemId} />
						</div>
						<div>
							<FieldLabel>精度</FieldLabel>
							<FidelityPicker value={precision} onChange={setPrecision} />
						</div>
						<div className="flex flex-col gap-1.5">
							<FieldLabel hint="可选">衍生面板</FieldLabel>
							<ToggleRow
								label="着陆页"
								description="附带营销首页"
								checked={includeLanding}
								onChange={setIncludeLanding}
							/>
							<ToggleRow
								label="OS 小组件"
								description="生成桌面 / 手机端 widget 草图"
								checked={includeOsWidgets}
								onChange={setIncludeOsWidgets}
							/>
						</div>
					</>
				)}

				{tab === "deck" && (
					<>
						<div>
							<FieldLabel hint="可选">设计系统</FieldLabel>
							<DesignSystemPicker value={systemId} onChange={setSystemId} />
						</div>
						<div className="flex flex-col gap-1.5">
							<ToggleRow
								label="演讲者注释"
								description="为每页生成 speaker notes"
								checked={speakerNotes}
								onChange={setSpeakerNotes}
							/>
							<ToggleRow
								label="动画"
								description="尝试加入切换 / 入场效果"
								checked={animations}
								onChange={setAnimations}
							/>
						</div>
					</>
				)}

				{tab === "template" && (
					<>
						<div>
							<FieldLabel>挑一个模板</FieldLabel>
							<TemplatePicker value={templateId} onChange={setTemplateId} />
						</div>
						<div>
							<FieldLabel hint="可选">设计系统</FieldLabel>
							<DesignSystemPicker value={systemId} onChange={setSystemId} />
						</div>
					</>
				)}

				{tab === "media" && (
					<>
						<MediaTemplatePicker
							kind={mediaKind}
							value={mediaTemplateId}
							onApply={(tpl) => {
								setMediaTemplateId(tpl.id);
								setPrompt(tpl.prompt);
								if (tpl.aspect) setMediaAspect(tpl.aspect);
								if (typeof tpl.duration_sec === "number") {
									setMediaDuration(tpl.duration_sec);
								}
							}}
						/>
						<MediaProjectOptions
							kind={mediaKind}
							onKindChange={(k) => {
								setMediaKind(k);
								// 切换 kind 时清掉已选模板，避免类型不一致
								setMediaTemplateId(null);
							}}
							provider={mediaProvider}
							onProviderChange={setMediaProvider}
							aspect={mediaAspect}
							onAspectChange={setMediaAspect}
							durationSec={mediaDuration}
							onDurationChange={setMediaDuration}
						/>
					</>
				)}

				{/* 媒体生成结果（仅 media tab） */}
				{tab === "media" && mediaResult && (
					<MediaResultCard
						result={mediaResult}
						onSaveAsTemplate={async () => {
							try {
								await designSaveMediaTemplate({
									kind: mediaResult.kind,
									title:
										title.trim() ||
										prompt.trim().slice(0, 24) ||
										"未命名媒体模板",
									prompt: mediaResult.prompt,
									aspect: mediaAspect,
									duration_sec:
										mediaResult.kind === "image" ? undefined : mediaDuration,
									model: mediaResult.provider,
									preview_image_url:
										mediaResult.kind === "image" && mediaResult.asset_paths[0]
											? `file://${mediaResult.asset_paths[0]}`
											: undefined,
								});
								toast.success("已保存到我的模板");
							} catch (err) {
								toast.error(
									`保存失败：${err instanceof Error ? err.message : String(err)}`,
								);
							}
						}}
					/>
				)}
			</div>

			{/* Footer CTA */}
			<div className="px-5 py-4 border-t border-cream-200/60 dark:border-cream-700/40 bg-white/40 dark:bg-black/10 backdrop-blur-sm flex items-center gap-2">
				<Button
					type="button"
					variant="action"
					size="md"
					onClick={() => void handleSubmit()}
					disabled={!canSubmit}
					icon={
						submitting ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
						)
					}
					className="flex-1 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.985]"
				>
					{submitting
						? tab === "media"
							? "生成中…"
							: "创建并生成…"
						: tab === "media"
							? "生成"
							: "创建并生成"}
				</Button>
			</div>
		</div>
	);
}

function MediaResultCard({
	result,
	onSaveAsTemplate,
}: {
	result: MediaResult;
	onSaveAsTemplate: () => Promise<void> | void;
}) {
	const [saving, setSaving] = useState(false);
	const reveal = async (p: string) => {
		try {
			await invoke("reveal_file_safe", { path: p });
		} catch (err) {
			toast.error(
				`定位失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};
	const first = result.asset_paths[0];

	const handleSave = async () => {
		setSaving(true);
		try {
			await onSaveAsTemplate();
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="rounded-xl border border-cream-300 dark:border-cream-500/60 bg-cream-50 dark:bg-cream-900 overflow-hidden">
			{result.status === "done" && first ? (
				<>
					{result.kind === "image" ? (
						<img
							src={`file://${first}`}
							alt={result.prompt}
							className="w-full max-h-48 object-cover"
						/>
					) : (
						<div className="px-3 py-6 text-center text-[12px] text-text-muted bg-cream-100/60">
							{result.kind === "video" ? "视频" : "音频"}已生成
						</div>
					)}
				</>
			) : result.status === "failed" ? (
				<div className="px-3 py-4 text-[12px] text-[#b53333]">
					生成失败：{result.error ?? "未知错误"}
				</div>
			) : (
				<div className="px-3 py-4 flex items-center gap-2 text-[12px] text-text-muted">
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
					正在生成…
				</div>
			)}
			<div className="px-3 py-2 flex items-center gap-2 border-t border-cream-200/70 dark:border-cream-500/30">
				<div className="min-w-0 flex-1 text-[11.5px] text-text-muted truncate">
					{result.prompt}
				</div>
				{result.status === "done" && (
					<button
						type="button"
						onClick={() => void handleSave()}
						disabled={saving}
						className="shrink-0 inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-[#D96C46] transition-colors disabled:opacity-50"
					>
						{saving ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<Plus className="w-3 h-3" strokeWidth={2} />
						)}
						{saving ? "保存中…" : "保存为模板"}
					</button>
				)}
				{first && (
					<button
						type="button"
						onClick={() => void reveal(first)}
						className="shrink-0 inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary"
					>
						<ExternalLink className="w-3 h-3" strokeWidth={1.8} />
						打开
					</button>
				)}
			</div>
		</div>
	);
}
