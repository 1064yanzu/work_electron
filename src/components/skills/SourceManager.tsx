/**
 * SourceManager —— 设置面板里的「市场源 + 镜像 + 测速」管理子组件
 */

import {
	BadgeCheck,
	Gauge,
	Plus,
	RefreshCw,
	ShieldAlert,
	Trash2,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	skillsMarketplaceStore,
	useMarketplaceStore,
} from "../../lib/skillsMarketplaceStore";
import type {
	MarketplaceMirror,
	MarketplaceMirrorTestResult,
	MarketplaceSourceConfig,
	MarketplaceSourceType,
} from "../../lib/config";
import { cn } from "../../lib/utils";
import { Select } from "../ui/Select";

const TYPE_LABEL: Record<MarketplaceSourceType, string> = {
	anthropic_marketplace_json: "Anthropic Marketplace JSON",
	skills_sh: "skills.sh API",
	tencent_skillhub: "腾讯 SkillHub",
	custom_json: "自定义 JSON",
};

function genId(prefix: string) {
	return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SourceManager() {
	const { config } = useMarketplaceStore();
	const sources = config?.sources ?? [];
	const mirrors = config?.mirrors ?? [];
	const autoCheck = config?.autoCheck ?? true;

	const [testing, setTesting] = useState(false);
	const [testResults, setTestResults] = useState<MarketplaceMirrorTestResult[]>(
		[],
	);
	const [drafting, setDrafting] = useState<{
		name: string;
		url: string;
		type: MarketplaceSourceType;
	}>({ name: "", url: "", type: "anthropic_marketplace_json" });

	useEffect(() => {
		if (!config) skillsMarketplaceStore.loadConfig();
	}, [config]);

	const updateSources = async (next: MarketplaceSourceConfig[]) => {
		await skillsMarketplaceStore.saveConfig({ sources: next });
	};
	const updateMirrors = async (next: MarketplaceMirror[]) => {
		await skillsMarketplaceStore.saveConfig({ mirrors: next });
	};

	const handleAddSource = async () => {
		if (!drafting.name.trim() || !drafting.url.trim()) return;
		const next: MarketplaceSourceConfig = {
			id: genId("custom"),
			name: drafting.name.trim(),
			url: drafting.url.trim(),
			type: drafting.type,
			enabled: true,
			trust:
				drafting.type === "anthropic_marketplace_json" ? "community" : "custom",
		};
		await updateSources([...sources, next]);
		setDrafting({ name: "", url: "", type: "anthropic_marketplace_json" });
	};

	const handleTest = async () => {
		setTesting(true);
		try {
			const r = await skillsMarketplaceStore.testMirrors();
			setTestResults(r);
		} finally {
			setTesting(false);
		}
	};

	const trustBadge = (t?: string) => {
		if (t === "official")
			return (
				<span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-success/8 text-success dark:bg-success/10 dark:text-success">
					<BadgeCheck className="w-3 h-3" /> 官方
				</span>
			);
		if (t === "community")
			return (
				<span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-focus/8 text-focus dark:bg-focus/10 dark:text-focus">
					<Users className="w-3 h-3" /> 社区
				</span>
			);
		return (
			<span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-peach-100 text-amber-700 dark:bg-peach-500/10 dark:text-amber-300">
				<ShieldAlert className="w-3 h-3" /> 自定义
			</span>
		);
	};

	return (
		<div className="space-y-6">
			{/* 源列表 */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<h4 className="text-sm font-medium text-text-primary">市场源</h4>
					<label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
						<input
							type="checkbox"
							checked={autoCheck}
							onChange={(e) =>
								skillsMarketplaceStore.saveConfig({
									autoCheck: e.target.checked,
								})
							}
							className="accent-primary"
						/>
						启动时检查更新
					</label>
				</div>
				<div className="space-y-2">
					{sources.map((s, idx) => (
						<div
							key={s.id}
							className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-surface/50"
						>
							<input
								type="checkbox"
								checked={s.enabled}
								onChange={(e) => {
									const next = [...sources];
									next[idx] = { ...s, enabled: e.target.checked };
									updateSources(next);
								}}
								className="accent-primary"
							/>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="text-[12.5px] font-medium text-text-primary">
										{s.name}
									</span>
									{trustBadge(s.trust)}
									<span className="text-[10px] text-text-light">
										{TYPE_LABEL[s.type]}
									</span>
								</div>
								<div className="text-[11px] text-text-muted font-mono truncate mt-0.5">
									{s.url}
								</div>
							</div>
							<button
								type="button"
								onClick={() => {
									const next = sources.filter((_, i) => i !== idx);
									updateSources(next);
								}}
								className="p-1.5 text-text-muted hover:text-error hover:bg-[rgba(181,51,51,0.08)] dark:hover:bg-red-900/20 rounded-md"
								title="删除"
							>
								<Trash2 className="w-3.5 h-3.5" />
							</button>
						</div>
					))}
				</div>

				{/* 新增源 */}
				<div className="rounded-xl border border-dashed border-border/60 p-3 space-y-2">
					<div className="flex items-center gap-2">
						<input
							type="text"
							value={drafting.name}
							onChange={(e) =>
								setDrafting((d) => ({ ...d, name: e.target.value }))
							}
							placeholder="源名称（如 我的私有源）"
							className="flex-1 px-3 py-1.5 text-xs bg-warm-200/60 border-none rounded-md focus:outline-none focus:ring-1 focus:ring-primary/30"
						/>
						<Select
							value={drafting.type}
							onChange={(e) =>
								setDrafting((d) => ({
									...d,
									type: e.target.value as MarketplaceSourceType,
								}))
							}
							variant="compact"
							options={[
								{
									value: "anthropic_marketplace_json",
									label: "Marketplace JSON",
								},
								{ value: "custom_json", label: "Custom JSON" },
								{ value: "skills_sh", label: "skills.sh" },
								{ value: "tencent_skillhub", label: "Tencent SkillHub" },
							]}
							containerClassName="w-44"
						/>
					</div>
					<div className="flex items-center gap-2">
						<input
							type="text"
							value={drafting.url}
							onChange={(e) =>
								setDrafting((d) => ({ ...d, url: e.target.value }))
							}
							placeholder="URL（marketplace.json 直链 或 API 基址）"
							className="flex-1 px-3 py-1.5 text-xs bg-warm-200/60 border-none rounded-md focus:outline-none focus:ring-1 focus:ring-primary/30 font-mono"
						/>
						<button
							type="button"
							onClick={handleAddSource}
							disabled={!drafting.name.trim() || !drafting.url.trim()}
							className="px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
						>
							<Plus className="w-3 h-3" />
							添加
						</button>
					</div>
				</div>
			</div>

			{/* 镜像 */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<h4 className="text-sm font-medium text-text-primary">下载镜像</h4>
					<button
						type="button"
						onClick={handleTest}
						disabled={testing}
						className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-md border border-border/60 hover:bg-warm-200/60 disabled:opacity-50"
					>
						{testing ? (
							<RefreshCw className="w-3 h-3 animate-spin" />
						) : (
							<Gauge className="w-3 h-3" />
						)}
						{testing ? "测速中…" : "测速"}
					</button>
				</div>
				<div className="space-y-2">
					{mirrors.map((m, idx) => {
						const testItem = testResults.find((r) =>
							r.url.includes(m.id) || m.pattern.split("{")[0].length > 0
								? testResults.find((r) =>
										r.url.startsWith(m.pattern.split("{")[0]),
									)
								: undefined,
						);
						return (
							<div
								key={m.id}
								className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-surface/50"
							>
								<input
									type="checkbox"
									checked={m.enabled}
									onChange={(e) => {
										const next = [...mirrors];
										next[idx] = { ...m, enabled: e.target.checked };
										updateMirrors(next);
									}}
									className="accent-primary"
								/>
								<div className="flex-1 min-w-0">
									<div className="text-[12.5px] font-medium text-text-primary">
										{m.name}
									</div>
									<div className="text-[11px] text-text-muted font-mono truncate mt-0.5">
										{m.pattern}
									</div>
								</div>
								{testItem && (
									<div
										className={cn(
											"text-[10.5px] font-mono px-2 py-0.5 rounded",
											testItem.ok
												? "bg-success/8 text-success dark:bg-success/10 dark:text-success"
												: "bg-[rgba(181,51,51,0.08)] text-error dark:bg-error/10 dark:text-error",
										)}
									>
										{testItem.ok
											? `${testItem.latencyMs}ms`
											: testItem.error || "unreachable"}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
