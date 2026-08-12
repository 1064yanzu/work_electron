/**
 * ReaderImmersionControls — 阅读器沉浸 / 翻页 / AI 副驾驶 设置
 *
 * 不再走 horizontal SettingsField，使用更紧凑的 2 列卡片网格。
 */
import {
	ArrowLeftRight,
	BellOff,
	Brain,
	MousePointerClick,
	Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Provider } from "../../../../types";
import { listProviders } from "../../../../lib/api/providers";
import { Select } from "../../../ui/Select";
import {
	SettingsChipGroup,
	SettingsSlider,
	SettingsSwitch,
} from "../../ui/SettingsPrimitives";
import type { ReaderClientSettings } from "../../../../lib/api/reader";

interface ReaderImmersionControlsProps {
	settings: ReaderClientSettings;
	patch: (next: Partial<ReaderClientSettings>) => void;
}

export function ReaderImmersionControls({
	settings,
	patch,
}: ReaderImmersionControlsProps) {
	const [providers, setProviders] = useState<Provider[]>([]);

	useEffect(() => {
		listProviders()
			.then(setProviders)
			.catch(() => {});
	}, []);

	const allModels = useMemo(
		() =>
			providers
				.filter((p) => p.is_enabled !== false)
				.flatMap((p) =>
					(p.models || []).map((m: string) => ({
						id: m,
						provider: p.name,
					})),
				),
		[providers],
	);

	return (
		<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
			<TileCard
				icon={<ArrowLeftRight className="h-4 w-4" strokeWidth={1.6} />}
				label="翻页过渡"
				hint="不同的过渡节奏适配不同阅读心境。"
			>
				<SettingsChipGroup<"slide" | "fade" | "instant">
					value={settings.page_transition}
					options={[
						{ value: "slide", label: "滑动" },
						{ value: "fade", label: "淡入" },
						{ value: "instant", label: "无" },
					]}
					onChange={(v) => patch({ page_transition: v })}
					size="sm"
					fullWidth
				/>
			</TileCard>

			<TileCard
				icon={<MousePointerClick className="h-4 w-4" strokeWidth={1.6} />}
				label="划词默认动作"
				hint="选中文字后弹起的工具栏默认高亮项。"
			>
				<Select
					value={settings.default_selection_action}
					onChange={(e) =>
						patch({
							default_selection_action: e.target
								.value as ReaderClientSettings["default_selection_action"],
						})
					}
					variant="inline"
					options={[
						{ value: "highlight", label: "高亮" },
						{ value: "explain", label: "解释" },
						{ value: "translate", label: "翻译" },
						{ value: "ask", label: "追问" },
					]}
				/>
			</TileCard>

			<TileCard
				icon={<BellOff className="h-4 w-4" strokeWidth={1.6} />}
				label="阅读时屏蔽通知"
				hint="进入阅读全屏时静音 Toast 与通知中心。"
				control={
					<SettingsSwitch
						checked={settings.disable_notifications_while_reading}
						onChange={(v) => patch({ disable_notifications_while_reading: v })}
					/>
				}
			>
				<p className="mt-1 text-[10.5px] leading-relaxed text-text-light">
					系统级提醒不受影响。
				</p>
			</TileCard>

			<TileCard
				icon={<Sparkles className="h-4 w-4" strokeWidth={1.6} />}
				label="AI 副驾驶上下文"
				hint="副驾驶能感知到的内容范围。"
			>
				<SettingsChipGroup<"chapter" | "book">
					value={settings.ai_context_scope}
					options={[
						{ value: "chapter", label: "当前章节", hint: "更快" },
						{ value: "book", label: "整本书", hint: "FTS5+摘要" },
					]}
					onChange={(v) => patch({ ai_context_scope: v })}
					size="sm"
					fullWidth
				/>
			</TileCard>

			<TileCard
				icon={<Brain className="h-4 w-4" strokeWidth={1.6} />}
				label="卡片生成模型"
				hint="留空则使用全局活跃模型。"
			>
				<Select
					value={settings.card_gen_model || ""}
					onChange={(e) => patch({ card_gen_model: e.target.value })}
					variant="inline"
					options={[
						{ value: "", label: "跟随全局模型" },
						...allModels.map((m) => ({
							value: m.id,
							label: `${m.id}（${m.provider}）`,
						})),
					]}
				/>
			</TileCard>

			<TileCard
				icon={<Brain className="h-4 w-4" strokeWidth={1.6} />}
				label="划词默认生成卡片数"
				hint="选中文字后一次生成多少张草稿卡。"
			>
				<SettingsSlider
					value={settings.card_default_count_selection}
					min={1}
					max={15}
					step={1}
					onChange={(v) => patch({ card_default_count_selection: v })}
					formatValue={(v) => `${v} 张`}
					minLabel="1"
					maxLabel="15"
				/>
			</TileCard>

			<TileCard
				icon={<Brain className="h-4 w-4" strokeWidth={1.6} />}
				label="本章默认生成卡片数"
				hint="侧栏「为本章生成」按钮一次生成多少张。"
			>
				<SettingsSlider
					value={settings.card_default_count_chapter}
					min={1}
					max={20}
					step={1}
					onChange={(v) => patch({ card_default_count_chapter: v })}
					formatValue={(v) => `${v} 张`}
					minLabel="1"
					maxLabel="20"
				/>
			</TileCard>

			<TileCard
				icon={<Brain className="h-4 w-4" strokeWidth={1.6} />}
				label="启用间隔重复（SRS）"
				hint="复习时根据「认识/不认识」调整下次出现时间。"
				control={
					<SettingsSwitch
						checked={settings.card_srs_enabled}
						onChange={(v) => patch({ card_srs_enabled: v })}
					/>
				}
			>
				<p className="mt-1 text-[10.5px] leading-relaxed text-text-light">
					关闭后卡片仅作浏览，不再排期。
				</p>
			</TileCard>

			<TileCard
				icon={<Brain className="h-4 w-4" strokeWidth={1.6} />}
				label="每日新卡上限"
				hint="今日复习队列里新卡片最多引入多少张，避免被淹没。"
			>
				<SettingsSlider
					value={settings.card_daily_new_limit}
					min={0}
					max={100}
					step={5}
					onChange={(v) => patch({ card_daily_new_limit: v })}
					formatValue={(v) => (v === 0 ? "不引入" : `${v} 张/天`)}
					minLabel="0"
					maxLabel="100"
				/>
			</TileCard>

			<div className="lg:col-span-2">
				<TileCard
					icon={null}
					label="沉浸模式自动隐藏顶栏"
					hint="鼠标移动会立即恢复；为 0 表示不隐藏。"
				>
					<SettingsSlider
						value={settings.auto_hide_chrome_ms}
						min={0}
						max={4000}
						step={100}
						onChange={(v) => patch({ auto_hide_chrome_ms: v })}
						formatValue={(v) => (v === 0 ? "不隐藏" : `${v}ms`)}
						minLabel="0"
						maxLabel="4000"
					/>
				</TileCard>
			</div>
		</div>
	);
}

function TileCard({
	icon,
	label,
	hint,
	control,
	children,
}: {
	icon: React.ReactNode | null;
	label: string;
	hint?: string;
	control?: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<div className="rounded-2xl border border-border bg-cream-50 p-4 transition-colors hover:border-cream-500 hover:bg-surface">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-1 items-start gap-2.5">
					{icon && (
						<span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary">
							{icon}
						</span>
					)}
					<div className="min-w-0">
						<div className="text-[13px] font-semibold leading-snug text-text-primary">
							{label}
						</div>
						{hint && (
							<div className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
								{hint}
							</div>
						)}
					</div>
				</div>
				{control}
			</div>
			{children && <div className="mt-3 pl-10">{children}</div>}
		</div>
	);
}
