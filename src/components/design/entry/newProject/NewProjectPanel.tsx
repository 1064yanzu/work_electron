/**
 * NewProjectPanel — Design 入口左栏「创建项目」紧凑面板
 *
 * 4 tab：原型 / 幻灯片 / 从模板 / 媒体。
 * - 前三个走 design_start_session → discovery
 * - 媒体走 design_media_generate（不创建 design session）
 *
 * 字段名直接复用 DesignSessionMetadata 的 key，避免做 mapping。
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
import { useState } from "react";
import {
	designListSessions,
	designMediaGenerate,
	designStartSession,
	type DesignProjectKind,
	type DesignProjectPlatform,
	type DesignProjectPrecision,
} from "../../../../lib/api/design";
import { designStore } from "../../../../lib/stores";
import { invoke } from "../../../../lib/tauriCompat";
import { Button } from "../../../ui/Button";
import { Tabs, type TabItem } from "../../../ui/Tabs";
import { Toggle } from "../../../Settings/components/Toggle";
import { toast } from "../../../ui/Toast";
import { cn } from "../../../../lib/utils";
import { DesignSystemPicker } from "./DesignSystemPicker";
import { FidelityPicker } from "./FidelityPicker";
import { MediaProjectOptions, type MediaKind } from "./MediaProjectOptions";
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
		<div className="flex items-baseline justify-between gap-2 mb-1.5">
			<label className="text-[11.5px] font-medium text-text-muted uppercase tracking-wide">
				{children}
			</label>
			{hint && <span className="text-[10.5px] text-text-light">{hint}</span>}
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
				"flex items-center gap-3 px-3 py-2 rounded-xl text-left w-full cursor-pointer",
				"border border-cream-300 dark:border-cream-500/60",
				"bg-cream-50 dark:bg-cream-900 hover:bg-cream-100/60 dark:hover:bg-cream-800/40",
				"transition-colors duration-150",
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="text-[12.5px] font-medium text-text-primary truncate">
					{label}
				</div>
				{description && (
					<div className="text-[11px] text-text-muted truncate mt-0.5">
						{description}
					</div>
				)}
			</div>
			<Toggle checked={checked} onChange={() => onChange(!checked)} size="sm" />
		</div>
	);
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
	const [mediaResult, setMediaResult] = useState<MediaResult | null>(null);

	const [submitting, setSubmitting] = useState(false);

	const canSubmit = (() => {
		if (submitting) return false;
		if (tab === "media") {
			return mediaProvider.trim().length > 0 && prompt.trim().length > 0;
		}
		if (tab === "template" && !templateId) return false;
		return true;
	})();

	const buildMetadata = () => {
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

			// prototype / deck / template
			const metadata = buildMetadata();
			const result = await designStartSession({
				title: resolvedTitle,
				initial_brief: prompt.trim() || undefined,
				metadata,
			});
			designStore.setDiscoveryForm(result.discovery_form);
			designStore.setCurrentSession({
				id: result.session_id,
				title: resolvedTitle,
				status: "draft",
				work_dir: result.work_dir,
				system_id: metadata.design_system_id ?? undefined,
				metadata,
				created_at: Date.now(),
				updated_at: Date.now(),
			});
			// 把用户在面板里填的简介作为 discovery 表单的初始答案 hint
			designStore.resetDraft();
			if (prompt.trim()) {
				designStore.patchDraftAnswers({
					answers: { product_brief: prompt.trim() },
				});
			}
			designStore.setStage("discovery");

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
		<div className="h-full flex flex-col bg-cream-50/40 dark:bg-cream-900/30 border-r border-cream-200/70 dark:border-cream-500/30">
			{/* Header */}
			<div className="px-5 pt-6 pb-3 flex flex-col gap-2 border-b border-cream-200/60 dark:border-cream-500/30">
				<div className="flex items-center gap-2">
					<div className="w-7 h-7 rounded-xl bg-[#D96C46]/12 text-[#D96C46] flex items-center justify-center">
						<Sparkles className="w-3.5 h-3.5" strokeWidth={1.8} />
					</div>
					<h2 className="text-[15px] font-semibold text-text-primary tracking-tight">
						创建项目
					</h2>
				</div>
				<p className="text-[11.5px] text-text-muted leading-relaxed">
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
							"w-full px-3 py-2 text-[13px]",
							"bg-cream-50 dark:bg-cream-900",
							"border border-cream-300 dark:border-cream-500",
							"rounded-xl text-text-primary placeholder:text-text-light",
							"focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/40",
						)}
					/>
				</div>

				{/* Tab 切换 */}
				<div>
					<Tabs<PanelTab>
						value={tab}
						onChange={setTab}
						items={TAB_ITEMS}
						variant="underline"
						size="sm"
						fullWidth
					/>
				</div>

				{/* 简介 / 提示词 */}
				<div>
					<FieldLabel>{tab === "media" ? "提示词" : "一句话简介"}</FieldLabel>
					<textarea
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						rows={3}
						placeholder={
							tab === "media"
								? "描述你要生成的画面 / 视频 / 音乐"
								: "比如：为一款 AI 阅读助手做着陆页，主色橙调，强调智能与温度"
						}
						className={cn(
							"w-full px-3 py-2 text-[13px] resize-none",
							"bg-cream-50 dark:bg-cream-900",
							"border border-cream-300 dark:border-cream-500",
							"rounded-xl text-text-primary placeholder:text-text-light",
							"focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/40",
						)}
					/>
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
					<MediaProjectOptions
						kind={mediaKind}
						onKindChange={setMediaKind}
						provider={mediaProvider}
						onProviderChange={setMediaProvider}
						aspect={mediaAspect}
						onAspectChange={setMediaAspect}
						durationSec={mediaDuration}
						onDurationChange={setMediaDuration}
					/>
				)}

				{/* 媒体生成结果（仅 media tab） */}
				{tab === "media" && mediaResult && (
					<MediaResultCard result={mediaResult} />
				)}
			</div>

			{/* Footer CTA */}
			<div className="px-5 py-4 border-t border-cream-200/60 dark:border-cream-500/30 flex items-center gap-2">
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
					className="flex-1"
				>
					{submitting
						? tab === "media"
							? "生成中…"
							: "创建中…"
						: tab === "media"
							? "生成"
							: "创建"}
				</Button>
			</div>
		</div>
	);
}

function MediaResultCard({ result }: { result: MediaResult }) {
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
