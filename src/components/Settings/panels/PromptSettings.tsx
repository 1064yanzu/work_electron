import {
	FileText,
	RotateCcw,
	Save,
	ScrollText,
	Sparkles,
	type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getConfig, setConfig } from "../../../lib/config";
import { toast } from "../../ui/Toast";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsBadge,
	SettingsButton,
	SettingsCardSection,
	SettingsField,
	SettingsPageContainer,
	SettingsStat,
	SettingsTextArea,
	SettingsToolbar,
} from "../ui/SettingsPrimitives";
import { cn } from "../../../lib/utils";

// 默认提示词配置
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

export function PromptSettings() {
	const [prompts, setPrompts] = useState<Record<string, string>>({});
	const [isSaving, setIsSaving] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);

	useEffect(() => {
		void loadPrompts();
	}, []);

	const loadPrompts = async () => {
		const loaded: Record<string, string> = {};
		for (const config of PROMPT_CONFIGS) {
			try {
				const value = await getConfig(config.configKey);
				loaded[config.id] = value || config.defaultValue;
			} catch (error) {
				console.error(`加载提示词 ${config.id} 失败:`, error);
				loaded[config.id] = config.defaultValue;
			}
		}
		setPrompts(loaded);
	};

	const modifiedCount = useMemo(
		() =>
			PROMPT_CONFIGS.filter(
				(c) => prompts[c.id] !== undefined && prompts[c.id] !== c.defaultValue,
			).length,
		[prompts],
	);

	const handlePromptChange = useCallback((id: string, value: string) => {
		setPrompts((prev) => ({ ...prev, [id]: value }));
		setHasChanges(true);
	}, []);

	const handleResetSingle = useCallback((id: string) => {
		const config = PROMPT_CONFIGS.find((c) => c.id === id);
		if (!config) return;
		setPrompts((prev) => ({ ...prev, [id]: config.defaultValue }));
		setHasChanges(true);
	}, []);

	const handleResetAll = useCallback(() => {
		const next: Record<string, string> = {};
		for (const config of PROMPT_CONFIGS) {
			next[config.id] = config.defaultValue;
		}
		setPrompts(next);
		setHasChanges(true);
	}, []);

	const handleSaveAll = async () => {
		setIsSaving(true);
		try {
			for (const config of PROMPT_CONFIGS) {
				const value = prompts[config.id];
				if (value !== undefined) {
					await setConfig(config.configKey, value);
				}
			}
			setHasChanges(false);
			toast.success("提示词已保存");
		} catch (error) {
			console.error("[PromptSettings] 保存失败:", error);
			toast.error("保存失败，请重试");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<SettingsPageContainer contentClassName="max-w-3xl space-y-6">
			<SettingsPanelHeader
				icon={ScrollText}
				title="提示词配置"
				description="自定义系统级提示词模板，影响标题生成等内置场景。"
			/>

			{/* 概览统计 */}
			<div className="grid grid-cols-3 gap-3">
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
				<SettingsStat
					label="状态"
					value={hasChanges ? "未保存" : "已同步"}
					hint={hasChanges ? "有未保存变更" : "本地已落盘"}
				/>
			</div>

			{/* 提示词列表 */}
			<div className="space-y-4">
				{PROMPT_CONFIGS.map((config) => {
					const currentValue = prompts[config.id] ?? "";
					const isModified =
						currentValue !== "" && currentValue !== config.defaultValue;
					const Icon = config.icon;

					return (
						<SettingsCardSection key={config.id}>
							<div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
								<div className="flex items-start gap-3 min-w-0">
									<span
										className={cn(
											"mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border transition-colors",
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
								<SettingsButton
									variant="secondary"
									size="sm"
									icon={RotateCcw}
									disabled={!isModified}
									onClick={() => handleResetSingle(config.id)}
								>
									恢复默认
								</SettingsButton>
							</div>

							<div className="px-5 py-4">
								<SettingsField
									label="模板内容"
									hint="支持变量插值；保存后即时生效。"
								>
									<SettingsTextArea
										value={currentValue}
										onChange={(value) => handlePromptChange(config.id, value)}
										placeholder={config.placeholder}
										rows={10}
										minHeight={180}
										mono
									/>
								</SettingsField>
								<div className="mt-1 flex items-center justify-end text-[11px] tabular-nums text-text-light">
									{currentValue.length} 字符
								</div>
							</div>
						</SettingsCardSection>
					);
				})}
			</div>

			{/* 底部 sticky 操作栏 */}
			<SettingsToolbar
				left={
					hasChanges
						? "有未保存的修改"
						: modifiedCount > 0
							? `${modifiedCount} 项已自定义并保存`
							: "所有模板均为默认值"
				}
				right={
					<>
						<SettingsButton
							variant="secondary"
							icon={RotateCcw}
							onClick={handleResetAll}
						>
							全部重置
						</SettingsButton>
						<SettingsButton
							variant="primary"
							icon={Save}
							loading={isSaving}
							disabled={!hasChanges || isSaving}
							onClick={handleSaveAll}
						>
							{isSaving ? "保存中…" : "保存修改"}
						</SettingsButton>
					</>
				}
			/>
		</SettingsPageContainer>
	);
}
