/**
 * PromptsPanel — 提示词模板设置（Phase 7.2 重构版）
 *
 * 改造点：
 *   - 废弃旧版的 sticky `SettingsToolbar` 集中保存按钮；
 *   - 每条模板的 textarea 接入 `useCommittedValue({ mode: "blur" })`：
 *     · 输入时只更新本地 draft
 *     · 失焦 / Enter 提交到 `setConfig`
 *     · Esc 回滚到上次成功提交值
 *     · 失败 toast.error + 自动回滚
 *   - 保留"恢复默认"单项按钮 + "全部重置"整体按钮；
 *   - 行为与旧 `PromptSettings.tsx` 一致：导出 `PromptSettings` 与 `DEFAULT_PROMPTS`，
 *     便于其他模块继续 import；同时新文件名 `PromptsPanel` 用于 settingsCatalog。
 */

import {
	FileText,
	RotateCcw,
	ScrollText,
	Sparkles,
	type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getConfig, setConfig } from "../../../../lib/config";
import { toast } from "../../../ui/Toast";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import {
	SettingsBadge,
	SettingsButton,
	SettingsCardSection,
	SettingsField,
	SettingsPageContainer,
	SettingsStat,
	SettingsTextArea,
} from "../../ui/SettingsPrimitives";
import { useCommittedValue } from "../../hooks/useCommittedValue";
import { cn } from "../../../../lib/utils";

export const DEFAULT_PROMPTS: Record<string, string> = {
	titleGeneration: `请为以下用户提问生成一个非常简短的对话标题（不超过10个字），直接返回标题内容，不要有任何引号或额外文字：

{message}`,
};

interface PromptConfig {
	id: string;
	label: string;
	description: string;
	icon: LucideIcon;
	configKey: string;
	defaultValue: string;
	placeholder?: string;
	variables: string[];
}

const PROMPT_CONFIGS: PromptConfig[] = [
	{
		id: "titleGeneration",
		label: "会话标题生成",
		description: "对话首条消息后自动生成简短标题，控制在十字以内。",
		icon: FileText,
		configKey: "prompt_title_generation",
		defaultValue: DEFAULT_PROMPTS.titleGeneration,
		placeholder: "输入标题生成提示词…",
		variables: ["message"],
	},
];

export function PromptsPanel() {
	// 加载阶段：把每条模板的当前值灌进 state；后续的"提交"由每个 PromptCard
	// 内部用 useCommittedValue 自管，父组件只在"全部重置"时强制刷新 key 让子组件
	// 重新挂载（与 SettingsModal 用 key={activeTab} 切面板的思路一致）。
	const [loaded, setLoaded] = useState<Record<string, string> | null>(null);
	const [resetTick, setResetTick] = useState(0);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			const next: Record<string, string> = {};
			for (const cfg of PROMPT_CONFIGS) {
				try {
					const stored = await getConfig(cfg.configKey);
					next[cfg.id] =
						typeof stored === "string" && stored.length > 0
							? stored
							: cfg.defaultValue;
				} catch (error) {
					console.error(`加载提示词 ${cfg.id} 失败:`, error);
					next[cfg.id] = cfg.defaultValue;
				}
			}
			if (!cancelled) setLoaded(next);
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	const modifiedCount = useMemo(() => {
		if (!loaded) return 0;
		return PROMPT_CONFIGS.filter((c) => (loaded[c.id] ?? "") !== c.defaultValue)
			.length;
	}, [loaded]);

	const handleResetSingle = useCallback(async (cfg: PromptConfig) => {
		try {
			await setConfig(cfg.configKey, cfg.defaultValue);
			setLoaded((prev) =>
				prev ? { ...prev, [cfg.id]: cfg.defaultValue } : prev,
			);
			setResetTick((t) => t + 1);
			toast.success(`已恢复「${cfg.label}」默认值`);
		} catch (error) {
			console.error("[PromptsPanel] 单项恢复失败:", error);
			toast.error("恢复失败，请重试");
		}
	}, []);

	const handleResetAll = useCallback(async () => {
		try {
			await Promise.all(
				PROMPT_CONFIGS.map((cfg) => setConfig(cfg.configKey, cfg.defaultValue)),
			);
			const next: Record<string, string> = {};
			for (const cfg of PROMPT_CONFIGS) next[cfg.id] = cfg.defaultValue;
			setLoaded(next);
			setResetTick((t) => t + 1);
			toast.success("所有模板已恢复默认");
		} catch (error) {
			console.error("[PromptsPanel] 全部重置失败:", error);
			toast.error("重置失败，请重试");
		}
	}, []);

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={ScrollText}
				title="提示词配置"
				description="自定义系统级提示词模板，影响标题生成等内置场景。失焦或回车自动保存。"
				actions={
					<SettingsButton
						variant="secondary"
						icon={RotateCcw}
						onClick={() => void handleResetAll()}
					>
						全部重置
					</SettingsButton>
				}
			/>

			<div className="grid grid-cols-2 gap-3">
				<SettingsStat
					label="可配置项"
					value={PROMPT_CONFIGS.length}
					hint="当前内置模板数量"
				/>
				<SettingsStat
					label="已修改"
					value={modifiedCount}
					hint={modifiedCount > 0 ? "偏离默认值" : "全部使用默认"}
				/>
			</div>

			<div className="space-y-4">
				{PROMPT_CONFIGS.map((cfg) => (
					<PromptCard
						key={`${cfg.id}-${resetTick}`}
						config={cfg}
						initialValue={loaded?.[cfg.id] ?? cfg.defaultValue}
						loading={loaded == null}
						onResetSingle={() => void handleResetSingle(cfg)}
						onCommitted={(next) => {
							setLoaded((prev) => (prev ? { ...prev, [cfg.id]: next } : prev));
						}}
					/>
				))}
			</div>
		</SettingsPageContainer>
	);
}

// 兼容旧 import：保留 PromptSettings 名称
export { PromptsPanel as PromptSettings };

interface PromptCardProps {
	config: PromptConfig;
	initialValue: string;
	loading: boolean;
	onResetSingle: () => void;
	onCommitted: (next: string) => void;
}

function PromptCard({
	config,
	initialValue,
	loading,
	onResetSingle,
	onCommitted,
}: PromptCardProps) {
	const Icon = config.icon;
	const isModified = initialValue !== config.defaultValue;

	const { draft, isDirty, handleChange, handleBlur, handleKeyDown, reset } =
		useCommittedValue<string>({
			value: initialValue,
			mode: "blur",
			errorMessage: `「${config.label}」保存失败`,
			onCommit: async (next) => {
				await setConfig(config.configKey, next);
				onCommitted(next);
			},
		});

	return (
		<div
			id={`ai.prompts.${config.id}`}
			data-settings-anchor={`ai.prompts.${config.id}`}
		>
			<SettingsCardSection>
				<div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
					<div className="flex items-start gap-3 min-w-0">
						<span
							className={cn(
								"mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border",
								"transition-[background-color,color] duration-150 ease-out",
								isModified
									? "bg-primary/10 text-primary"
									: "bg-cream-100 text-text-muted",
							)}
						>
							<Icon className="h-4 w-4" strokeWidth={1.6} />
						</span>
						<div className="min-w-0">
							<div className="flex items-center gap-2 flex-wrap">
								<h3 className="text-[14px] font-semibold leading-snug text-text-primary">
									{config.label}
								</h3>
								{isModified && (
									<SettingsBadge tone="primary" icon={Sparkles}>
										已自定义
									</SettingsBadge>
								)}
								{isDirty && (
									<SettingsBadge tone="warning">未提交</SettingsBadge>
								)}
							</div>
							<p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
								{config.description}
							</p>
							{config.variables.length > 0 && (
								<div className="mt-2 flex items-center gap-1.5 flex-wrap">
									<span className="text-[10.5px] uppercase tracking-[0.14em] text-text-muted">
										变量
									</span>
									{config.variables.map((v) => (
										<code
											key={v}
											className="inline-flex items-center rounded-md border border-border bg-cream-100 px-1.5 py-0.5 font-mono text-[10.5px] text-text-secondary"
										>
											{`{${v}}`}
										</code>
									))}
								</div>
							)}
						</div>
					</div>
					<div className="flex items-center gap-2">
						{isDirty && (
							<SettingsButton
								variant="ghost"
								size="sm"
								onClick={reset}
								title="撤销当前修改（Esc）"
							>
								撤销
							</SettingsButton>
						)}
						<SettingsButton
							variant="secondary"
							size="sm"
							icon={RotateCcw}
							disabled={!isModified}
							onClick={onResetSingle}
						>
							恢复默认
						</SettingsButton>
					</div>
				</div>

				<div className="px-5 py-4">
					<SettingsField
						label="模板内容"
						hint="支持变量插值；失焦或按 Enter 自动保存，Esc 撤销当前修改。"
					>
						<SettingsTextArea
							value={draft}
							onChange={(value) => handleChange(value)}
							onBlur={handleBlur}
							onKeyDown={handleKeyDown}
							placeholder={config.placeholder}
							rows={10}
							minHeight={180}
							mono
							disabled={loading}
						/>
					</SettingsField>
					<div className="mt-1 flex items-center justify-end text-[11px] tabular-nums text-text-light">
						{draft.length} 字符
					</div>
				</div>
			</SettingsCardSection>
		</div>
	);
}
