import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Bot,
	Brain,
	Cloud,
	LayoutDashboard,
	Settings2,
	SlidersHorizontal,
	Sparkles,
	Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/components/ui/theme-provider";
import {
	resetCoreProviders,
	setActiveModel,
	setConfig,
	upsertProvider,
} from "@/features/workspace/ipc-api";
import {
	useActiveModelQuery,
	useAllConfigsQuery,
	useProvidersQuery,
} from "@/features/workspace/queries";
import { useIpc } from "@/hooks/useIpc";
import { cn } from "@/lib/utils";

export function SettingsModal({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { available } = useIpc();

	const [tab, setTab] = useState<
		| "dashboard"
		| "general"
		| "models"
		| "prompts"
		| "skills"
		| "mcp"
		| "automation"
		| "agent"
		| "data"
	>("dashboard");
	const tabs = useMemo(
		() => [
			{ id: "dashboard" as const, label: "仪表盘", icon: LayoutDashboard },
			{ id: "models" as const, label: "模型", icon: Brain },
			{ id: "prompts" as const, label: "提示词", icon: Sparkles },
			{ id: "skills" as const, label: "技能", icon: Wrench },
			{ id: "mcp" as const, label: "MCP", icon: Cloud },
			{ id: "automation" as const, label: "自动化", icon: Settings2 },
			{ id: "agent" as const, label: "Agent", icon: Bot },
			{ id: "general" as const, label: "通用", icon: SlidersHorizontal },
			{ id: "data" as const, label: "数据", icon: DatabaseIcon },
		],
		[],
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[980px]">
				<DialogHeader>
					<DialogTitle>设置</DialogTitle>
				</DialogHeader>

				<div className="grid h-[70vh] grid-cols-[220px_1fr] gap-4 overflow-hidden">
					<div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-secondary/40 p-2">
						{tabs.map((t) => (
							<button
								key={t.id}
								type="button"
								onClick={() => setTab(t.id)}
								className={cn(
									"flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
									tab === t.id ? "bg-background/80" : "hover:bg-background/60",
								)}
							>
								<t.icon className="h-4 w-4 text-muted-foreground" />
								<div>{t.label}</div>
							</button>
						))}
					</div>

					<ScrollArea className="h-full pr-2">
						{tab === "dashboard" && <DashboardSettings available={available} />}
						{tab === "models" && <ModelSettings available={available} />}
						{tab === "prompts" && <PromptSettings available={available} />}
						{tab === "skills" && <SkillsSettings available={available} />}
						{tab === "mcp" && <McpSettings available={available} />}
						{tab === "automation" && (
							<AutomationSettings available={available} />
						)}
						{tab === "agent" && <AgentSettings available={available} />}
						{tab === "general" && <GeneralSettings />}
						{tab === "data" && <DataSettings available={available} />}
					</ScrollArea>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function DatabaseIcon(props: { className?: string }) {
	return (
		<svg
			className={props.className}
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Database</title>
			<path
				d="M4 7c0 2.2 3.6 4 8 4s8-1.8 8-4-3.6-4-8-4-8 1.8-8 4Z"
				stroke="currentColor"
				strokeWidth="1.8"
			/>
			<path
				d="M4 7v5c0 2.2 3.6 4 8 4s8-1.8 8-4V7"
				stroke="currentColor"
				strokeWidth="1.8"
			/>
			<path
				d="M4 12v5c0 2.2 3.6 4 8 4s8-1.8 8-4v-5"
				stroke="currentColor"
				strokeWidth="1.8"
			/>
		</svg>
	);
}

function useConfigStore(available: boolean) {
	const queryClient = useQueryClient();
	const configsQuery = useAllConfigsQuery(available);
	const setMutation = useMutation({
		mutationFn: async (input: { key: string; value: string }) => {
			return setConfig(input.key, input.value);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["configs"] });
		},
	});

	const map = useMemo(() => {
		const m = new Map<string, string>();
		for (const item of configsQuery.data ?? []) m.set(item.key, item.value);
		return m;
	}, [configsQuery.data]);

	const get = useCallback((key: string) => map.get(key) ?? null, [map]);

	const set = useCallback(
		(key: string, value: string) => setMutation.mutateAsync({ key, value }),
		[setMutation],
	);

	return {
		get,
		set,
		loading: configsQuery.isLoading,
		saving: setMutation.isPending,
		raw: configsQuery.data,
	};
}

function ModelSettings({ available }: { available: boolean }) {
	const queryClient = useQueryClient();
	const providersQuery = useProvidersQuery(available);
	const activeModelQuery = useActiveModelQuery(available);
	const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
		null,
	);

	useEffect(() => {
		if (selectedProviderId) return;
		const first = providersQuery.data?.[0];
		if (first) setSelectedProviderId(first.id);
	}, [providersQuery.data, selectedProviderId]);

	const selectedProvider = useMemo(() => {
		if (!selectedProviderId) return null;
		return (
			(providersQuery.data ?? []).find((p) => p.id === selectedProviderId) ??
			null
		);
	}, [providersQuery.data, selectedProviderId]);

	const providerModels =
		(providersQuery.data ?? [])
			.filter((p) => p.is_enabled)
			.flatMap((p) =>
				p.models.map((m) => ({
					providerId: p.id,
					model: m,
					label: `${p.name} / ${m}`,
				})),
			) ?? [];

	const [draftName, setDraftName] = useState("");
	const [draftBase, setDraftBase] = useState("");
	const [draftModels, setDraftModels] = useState("");
	const [draftApiKey, setDraftApiKey] = useState("");
	const [draftEnabled, setDraftEnabled] = useState(false);

	useEffect(() => {
		setDraftName(selectedProvider?.name ?? "");
		setDraftBase(selectedProvider?.api_base ?? "");
		setDraftModels((selectedProvider?.models ?? []).join("\n"));
		setDraftApiKey("");
		setDraftEnabled(!!selectedProvider?.is_enabled);
	}, [
		selectedProvider?.api_base,
		selectedProvider?.is_enabled,
		selectedProvider?.models,
		selectedProvider?.name,
	]);

	const saveProviderMutation = useMutation({
		mutationFn: async () => {
			if (!selectedProvider) throw new Error("未选择 Provider");
			const models = draftModels
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean);
			return upsertProvider({
				id: selectedProvider.id,
				name: draftName.trim() || selectedProvider.name,
				provider_type: selectedProvider.provider_type,
				is_enabled: draftEnabled,
				api_base: draftBase.trim() || undefined,
				api_key: draftApiKey.trim() || undefined,
				models,
				metadata: selectedProvider.metadata ?? {},
				template_id: selectedProvider.template_id,
			});
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["providers"] });
			await activeModelQuery.refetch();
		},
	});

	const resetMutation = useMutation({
		mutationFn: resetCoreProviders,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["providers"] });
		},
	});

	const createProviderMutation = useMutation({
		mutationFn: async () => {
			return upsertProvider({
				name: "Custom",
				provider_type: "custom",
				is_enabled: false,
				models: [],
				metadata: {},
			});
		},
		onSuccess: async (p) => {
			await queryClient.invalidateQueries({ queryKey: ["providers"] });
			setSelectedProviderId(p.id);
		},
	});

	return (
		<div className="space-y-4 pb-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">当前模型</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<Select
						value={activeModelQuery.data ?? undefined}
						onValueChange={async (value) => {
							await setActiveModel(value);
							await activeModelQuery.refetch();
						}}
						disabled={!available}
					>
						<SelectTrigger className="w-full">
							<SelectValue
								placeholder={available ? "选择模型" : "仅 Electron 可用"}
							/>
						</SelectTrigger>
						<SelectContent>
							{providerModels.map((m) => (
								<SelectItem key={`${m.providerId}:${m.model}`} value={m.model}>
									{m.label}
								</SelectItem>
							))}
							{providersQuery.isLoading && (
								<div className="p-2 text-xs text-muted-foreground">加载中…</div>
							)}
						</SelectContent>
					</Select>
					<div className="text-[11px] text-muted-foreground">
						仅展示启用的 Provider 的模型列表。
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Providers</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-[260px_1fr] gap-4">
					<div className="space-y-2">
						<Select
							value={selectedProviderId ?? undefined}
							onValueChange={(value) => setSelectedProviderId(value)}
							disabled={!available}
						>
							<SelectTrigger className="w-full">
								<SelectValue
									placeholder={available ? "选择 Provider" : "仅 Electron 可用"}
								/>
							</SelectTrigger>
							<SelectContent>
								{(providersQuery.data ?? []).map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.name} · {p.provider_type}
									</SelectItem>
								))}
								{providersQuery.isLoading && (
									<div className="p-2 text-xs text-muted-foreground">
										加载中…
									</div>
								)}
							</SelectContent>
						</Select>

						<Button
							variant="secondary"
							className="w-full"
							disabled={!available || resetMutation.isPending}
							onClick={() => resetMutation.mutate()}
						>
							重置核心 Providers
						</Button>

						<Button
							className="w-full"
							disabled={!available || createProviderMutation.isPending}
							onClick={() => createProviderMutation.mutate()}
						>
							新增 Provider
						</Button>
					</div>

					{selectedProvider ? (
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-2">
									<div className="text-xs font-medium text-muted-foreground">
										名称
									</div>
									<Input
										value={draftName}
										onChange={(e) => setDraftName(e.target.value)}
									/>
								</div>
								<div className="space-y-2">
									<div className="text-xs font-medium text-muted-foreground">
										启用
									</div>
									<Select
										value={draftEnabled ? "enabled" : "disabled"}
										onValueChange={(v) => setDraftEnabled(v === "enabled")}
										disabled={!available}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="enabled">启用</SelectItem>
											<SelectItem value="disabled">禁用</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className="space-y-2">
								<div className="text-xs font-medium text-muted-foreground">
									API Base
								</div>
								<Input
									value={draftBase}
									onChange={(e) => setDraftBase(e.target.value)}
									placeholder="可选，如 https://api.openai.com/v1"
								/>
							</div>

							<div className="space-y-2">
								<div className="text-xs font-medium text-muted-foreground">
									API Key
								</div>
								<Input
									value={draftApiKey}
									onChange={(e) => setDraftApiKey(e.target.value)}
									placeholder="留空表示不修改"
								/>
							</div>

							<div className="space-y-2">
								<div className="text-xs font-medium text-muted-foreground">
									Models（每行一个）
								</div>
								<Textarea
									value={draftModels}
									onChange={(e) => setDraftModels(e.target.value)}
									className="min-h-[180px]"
								/>
							</div>

							<div className="flex items-center justify-end gap-2">
								<Button
									onClick={() => saveProviderMutation.mutate()}
									disabled={!available || saveProviderMutation.isPending}
								>
									保存 Provider
								</Button>
							</div>
						</div>
					) : (
						<div className="flex items-center justify-center rounded-xl border border-border/60 bg-secondary/40 p-8 text-sm text-muted-foreground">
							选择一个 Provider 进行配置
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function GeneralSettings() {
	const { theme, setTheme } = useTheme();
	const [language, setLanguage] = useState(
		() => localStorage.getItem("workbench.language") ?? "zh-CN",
	);

	useEffect(() => {
		localStorage.setItem("workbench.language", language);
	}, [language]);

	return (
		<div className="space-y-4 pb-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">界面</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							主题
						</div>
						<Select
							value={theme}
							onValueChange={(v) => setTheme(v as "system" | "light" | "dark")}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="system">系统</SelectItem>
								<SelectItem value="light">浅色</SelectItem>
								<SelectItem value="dark">深色</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							语言
						</div>
						<Select value={language} onValueChange={setLanguage}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="zh-CN">中文（简体）</SelectItem>
								<SelectItem value="en">English</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function DataSettings({ available }: { available: boolean }) {
	return (
		<div className="space-y-4 pb-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">数据与备份</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<div className="text-sm text-muted-foreground">
						后续将补齐：备份/恢复、WebDAV、导入导出与历史记录等能力。
					</div>
					<div className="text-[11px] text-muted-foreground">
						当前状态：{available ? "Electron 可用" : "仅 Electron 可用"}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function DashboardSettings({ available }: { available: boolean }) {
	const cfg = useConfigStore(available);
	return (
		<div className="space-y-4 pb-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">仪表盘</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="text-sm text-muted-foreground">
						该面板用于配置首页展示与默认行为。
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-2">
							<div className="text-xs font-medium text-muted-foreground">
								默认搜索策略
							</div>
							<Select
								value={cfg.get("search.strategy") ?? "local_first"}
								onValueChange={(v) => cfg.set("search.strategy", v)}
								disabled={!available || cfg.saving}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="local_first">local_first</SelectItem>
									<SelectItem value="mcp_first">mcp_first</SelectItem>
									<SelectItem value="local_only">local_only</SelectItem>
									<SelectItem value="mcp_only">mcp_only</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<div className="text-xs font-medium text-muted-foreground">
								知识库检索模式
							</div>
							<Select
								value={cfg.get("kb.retrieval_mode") ?? "fts"}
								onValueChange={(v) => cfg.set("kb.retrieval_mode", v)}
								disabled={!available || cfg.saving}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="fts">fts</SelectItem>
									<SelectItem value="vector">vector</SelectItem>
									<SelectItem value="hybrid">hybrid</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function PromptSettings({ available }: { available: boolean }) {
	const cfg = useConfigStore(available);
	const [prompt, setPrompt] = useState("");
	const [imagePrompt, setImagePrompt] = useState("");

	useEffect(() => {
		setPrompt(cfg.get("prompt_system") ?? "");
		setImagePrompt(cfg.get("prompt_image_extraction") ?? "");
	}, [cfg.get]);

	return (
		<div className="space-y-4 pb-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">提示词</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							系统提示词
						</div>
						<Textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							className="min-h-[180px]"
							disabled={!available}
						/>
						<div className="flex justify-end">
							<Button
								onClick={() => cfg.set("prompt_system", prompt)}
								disabled={!available || cfg.saving}
							>
								保存
							</Button>
						</div>
					</div>

					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							图片抽取提示词
						</div>
						<Textarea
							value={imagePrompt}
							onChange={(e) => setImagePrompt(e.target.value)}
							className="min-h-[140px]"
							disabled={!available}
						/>
						<div className="flex justify-end">
							<Button
								onClick={() => cfg.set("prompt_image_extraction", imagePrompt)}
								disabled={!available || cfg.saving}
							>
								保存
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function SkillsSettings({ available }: { available: boolean }) {
	const cfg = useConfigStore(available);
	const [skillsJson, setSkillsJson] = useState("");

	useEffect(() => {
		setSkillsJson(cfg.get("skills.enabled") ?? "[]");
	}, [cfg.get]);

	return (
		<div className="space-y-4 pb-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">技能</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="text-sm text-muted-foreground">
						以 JSON 数组维护启用的技能 id（后续会替换为可视化管理）。
					</div>
					<Textarea
						value={skillsJson}
						onChange={(e) => setSkillsJson(e.target.value)}
						className="min-h-[180px] font-mono text-xs"
						disabled={!available}
					/>
					<div className="flex justify-end">
						<Button
							onClick={() => cfg.set("skills.enabled", skillsJson)}
							disabled={!available || cfg.saving}
						>
							保存
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function McpSettings({ available }: { available: boolean }) {
	const cfg = useConfigStore(available);
	const [binding, setBinding] = useState("");

	useEffect(() => {
		setBinding(cfg.get("mcp.tavily_binding") ?? "");
	}, [cfg.get]);

	return (
		<div className="space-y-4 pb-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">MCP</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							启用 MCP
						</div>
						<Select
							value={cfg.get("mcp.enabled") ?? "false"}
							onValueChange={(v) => cfg.set("mcp.enabled", v)}
							disabled={!available || cfg.saving}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="true">启用</SelectItem>
								<SelectItem value="false">禁用</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							Tavily Binding
						</div>
						<Input
							value={binding}
							onChange={(e) => setBinding(e.target.value)}
							disabled={!available}
							placeholder="可选：server/binding id"
						/>
						<div className="flex justify-end">
							<Button
								variant="secondary"
								onClick={() => cfg.set("mcp.tavily_binding", binding)}
								disabled={!available || cfg.saving}
							>
								保存
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function AutomationSettings({ available }: { available: boolean }) {
	const cfg = useConfigStore(available);
	return (
		<div className="space-y-4 pb-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">自动化</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							抓取频率
						</div>
						<Select
							value={cfg.get("automation.fetch_frequency") ?? "daily"}
							onValueChange={(v) => cfg.set("automation.fetch_frequency", v)}
							disabled={!available || cfg.saving}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="daily">daily</SelectItem>
								<SelectItem value="weekly">weekly</SelectItem>
								<SelectItem value="manual">manual</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							Headless 模式
						</div>
						<Select
							value={cfg.get("automation.headless_mode") ?? "true"}
							onValueChange={(v) => cfg.set("automation.headless_mode", v)}
							disabled={!available || cfg.saving}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="true">true</SelectItem>
								<SelectItem value="false">false</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							自动抽取
						</div>
						<Select
							value={cfg.get("automation.auto_extract") ?? "true"}
							onValueChange={(v) => cfg.set("automation.auto_extract", v)}
							disabled={!available || cfg.saving}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="true">true</SelectItem>
								<SelectItem value="false">false</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function AgentSettings({ available }: { available: boolean }) {
	const cfg = useConfigStore(available);
	const [toolConcurrency, setToolConcurrency] = useState("");
	const [memoryMinScore, setMemoryMinScore] = useState("");

	useEffect(() => {
		setToolConcurrency(cfg.get("agent.tool_concurrency") ?? "4");
		setMemoryMinScore(cfg.get("agent.memory_min_score") ?? "0.2");
	}, [cfg.get]);

	return (
		<div className="space-y-4 pb-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Agent</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							最大并发工具调用
						</div>
						<Input
							value={toolConcurrency}
							onChange={(e) => setToolConcurrency(e.target.value)}
							disabled={!available}
						/>
					</div>
					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							记忆最小相关度
						</div>
						<Input
							value={memoryMinScore}
							onChange={(e) => setMemoryMinScore(e.target.value)}
							disabled={!available}
						/>
					</div>
					<div className="col-span-2 flex justify-end">
						<Button
							onClick={async () => {
								await cfg.set("agent.tool_concurrency", toolConcurrency);
								await cfg.set("agent.memory_min_score", memoryMinScore);
							}}
							disabled={!available || cfg.saving}
						>
							保存
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
