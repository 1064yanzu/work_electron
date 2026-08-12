/**
 * SystemPromptTemplates — 系统级提示词模板编辑（提示词库 › 系统模板 分区）。
 *
 * 来源：原 Settings › AI › 提示词模板 面板（PromptsPanel），按精简决策方案 C2
 * 并入统一「提示词库」作为高级分区。当前只有「会话标题生成」一项内置模板。
 *
 * 行为约定与原面板一致：失焦 / Enter 提交（useCommittedValue blur 模式）、
 * Esc 回滚、支持单项恢复默认。
 */

import { FileText, RotateCcw, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getConfig, setConfig } from "../../lib/config";
import { DEFAULT_PROMPTS } from "../../lib/prompts";
import { useCommittedValue } from "../Settings/hooks/useCommittedValue";
import { toast } from "../ui/Toast";

interface SystemPromptConfig {
	id: string;
	label: string;
	description: string;
	icon: LucideIcon;
	configKey: string;
	defaultValue: string;
	placeholder?: string;
	variables: string[];
}

const SYSTEM_PROMPT_CONFIGS: SystemPromptConfig[] = [
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

export function SystemPromptTemplates() {
	const [loaded, setLoaded] = useState<Record<string, string> | null>(null);
	const [resetTick, setResetTick] = useState(0);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			const next: Record<string, string> = {};
			for (const cfg of SYSTEM_PROMPT_CONFIGS) {
				try {
					const stored = await getConfig(cfg.configKey);
					next[cfg.id] =
						typeof stored === "string" && stored.length > 0
							? stored
							: cfg.defaultValue;
				} catch (error) {
					console.error(`加载系统模板 ${cfg.id} 失败:`, error);
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

	const handleResetSingle = useCallback(async (cfg: SystemPromptConfig) => {
		try {
			await setConfig(cfg.configKey, cfg.defaultValue);
			setLoaded((prev) =>
				prev ? { ...prev, [cfg.id]: cfg.defaultValue } : prev,
			);
			setResetTick((t) => t + 1);
			toast.success(`已恢复「${cfg.label}」默认值`);
		} catch (error) {
			console.error("[SystemPromptTemplates] 恢复默认失败:", error);
			toast.error("恢复失败，请重试");
		}
	}, []);

	return (
		<div className="h-full overflow-y-auto p-6 scroll-smooth">
			<div className="max-w-2xl mx-auto">
				<div className="mb-5">
					<h3 className="text-base font-semibold text-text-primary">
						系统模板
					</h3>
					<p className="mt-1 text-xs leading-relaxed text-text-muted">
						内置场景使用的系统级提示词，修改会影响标题生成等自动行为。失焦或回车自动保存。
					</p>
				</div>
				<div className="space-y-4">
					{SYSTEM_PROMPT_CONFIGS.map((cfg) => (
						<SystemPromptCard
							key={`${cfg.id}-${resetTick}`}
							config={cfg}
							initialValue={loaded?.[cfg.id] ?? cfg.defaultValue}
							loading={loaded == null}
							onResetSingle={() => void handleResetSingle(cfg)}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

interface SystemPromptCardProps {
	config: SystemPromptConfig;
	initialValue: string;
	loading: boolean;
	onResetSingle: () => void;
}

function SystemPromptCard({
	config,
	initialValue,
	loading,
	onResetSingle,
}: SystemPromptCardProps) {
	const Icon = config.icon;
	const isModified = initialValue !== config.defaultValue;

	const { draft, isDirty, handleChange, handleBlur, handleKeyDown, reset } =
		useCommittedValue<string>({
			value: initialValue,
			mode: "blur",
			errorMessage: `「${config.label}」保存失败`,
			onCommit: async (next) => {
				await setConfig(config.configKey, next);
			},
		});

	return (
		<div className="rounded-2xl border border-border bg-surface overflow-hidden">
			<div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
				<div className="flex items-start gap-3 min-w-0">
					<span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-cream-100 text-text-muted">
						<Icon className="h-4 w-4" strokeWidth={1.6} />
					</span>
					<div className="min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<h4 className="text-sm font-semibold leading-snug text-text-primary">
								{config.label}
							</h4>
							{isModified && (
								<span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
									已自定义
								</span>
							)}
							{isDirty && (
								<span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[11px] font-medium">
									未提交
								</span>
							)}
						</div>
						<p className="mt-1 text-xs leading-relaxed text-text-muted">
							{config.description}
						</p>
						{config.variables.length > 0 && (
							<div className="mt-2 flex items-center gap-1.5 flex-wrap">
								<span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
									变量
								</span>
								{config.variables.map((v) => (
									<code
										key={v}
										className="inline-flex items-center rounded-md border border-border bg-cream-100 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary"
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
						<button
							type="button"
							onClick={reset}
							title="撤销当前修改（Esc）"
							className="px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary rounded-lg hover:bg-warm-100 transition-colors"
						>
							撤销
						</button>
					)}
					<button
						type="button"
						disabled={!isModified}
						onClick={onResetSingle}
						className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:bg-warm-100 transition-colors disabled:opacity-40 disabled:pointer-events-none"
					>
						<RotateCcw className="w-3.5 h-3.5" strokeWidth={1.6} />
						恢复默认
					</button>
				</div>
			</div>

			<div className="px-5 py-4">
				<textarea
					value={draft}
					onChange={(e) => handleChange(e.target.value)}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
					placeholder={config.placeholder}
					rows={8}
					disabled={loading}
					className="w-full rounded-xl border border-border bg-cream-50 dark:bg-cream-900 px-3 py-2.5 font-mono text-xs leading-relaxed text-text-primary placeholder-text-muted outline-none focus:border-focus focus:ring-2 focus:ring-focus/20 transition-[color,background-color,border-color,opacity,box-shadow,transform] resize-y min-h-[160px] disabled:opacity-50"
				/>
				<div className="mt-1 flex items-center justify-end text-xs tabular-nums text-text-light">
					{draft.length} 字符
				</div>
			</div>
		</div>
	);
}
