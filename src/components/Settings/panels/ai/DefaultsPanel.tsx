/**
 * DefaultsPanel — AI 与模型 · 默认模型分工
 *
 * Phase 6 新建，承载：
 *   1. 默认模型分工：标题生成 / 图像信息提取 / Wiki 生成 / Skill 执行
 *      （Skill 执行模型读写 `skill_llm_model`，下游 `SkillExecutor.getConfig("skill_llm_model")` 消费）；
 *   2. 搜索策略：搜索优先级 / MCP 搜索引擎 / `describeSearchHealth` 显示。
 *
 * 所有字段 `instant` 保存；失败时 UI 回滚 + toast。字段容器带 `id` + `data-settings-anchor`。
 */
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Select } from "../../../ui/Select";
import {
	describeSearchHealth,
	getConfig,
	getSearchMcpProvider,
	getSearchStrategy,
	setConfig,
	setSearchMcpProvider,
	setSearchStrategy,
	type SearchMcpProvider,
	type SearchStrategy,
} from "../../../../lib/config";
import { useSettingsStore } from "../../../../lib/settingsStore";
import { toast } from "../../../ui/Toast";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import {
	SettingsCardSection,
	SettingsHint,
	SettingsPageContainer,
	SettingsRow,
} from "../../ui/SettingsPrimitives";

const ANCHOR = {
	titleModel: "ai.defaults.model.title",
	imageModel: "ai.defaults.model.image",
	wikiModel: "ai.defaults.model.wiki",
	skillModel: "ai.defaults.model.skill",
	searchStrategy: "ai.defaults.search.strategy",
	searchProvider: "ai.defaults.search.provider",
	searchHealth: "ai.defaults.search.health",
} as const;

interface ModelOption {
	value: string;
	label: string;
}

export function DefaultsPanel() {
	const { providers } = useSettingsStore();

	const [titleModel, setTitleModel] = useState<string>("");
	const [imageExtractionModel, setImageExtractionModel] = useState<string>("");
	const [wikiModel, setWikiModel] = useState<string>("");
	const [skillModel, setSkillModel] = useState<string>("");
	const [searchStrategy, setSearchStrategyState] =
		useState<SearchStrategy>("local_first");
	const [searchMcpProvider, setSearchMcpProviderState] =
		useState<SearchMcpProvider>("auto");
	const [searchHealth, setSearchHealth] = useState<string>("");

	// 从已启用 Provider 汇总可选模型（用 "id" 作为值，和旧实现一致）
	const modelOptions = useMemo<ModelOption[]>(() => {
		const seen = new Set<string>();
		const out: ModelOption[] = [];
		out.push({ value: "", label: "跟随对话模型（默认）" });
		for (const provider of providers) {
			if (!provider.isEnabled) continue;
			for (const model of provider.models) {
				if (seen.has(model)) continue;
				seen.add(model);
				out.push({
					value: model,
					label: `${model} · ${provider.name}`,
				});
			}
		}
		return out;
	}, [providers]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [
					titleRaw,
					imageRaw,
					wikiRaw,
					skillRaw,
					strategy,
					provider,
				] = await Promise.all([
					getConfig("title_generation_model"),
					getConfig("image_extraction_model"),
					getConfig("wiki_generation_model"),
					getConfig("skill_llm_model"),
					getSearchStrategy(),
					getSearchMcpProvider(),
				]);
				if (cancelled) return;
				if (typeof titleRaw === "string") setTitleModel(titleRaw);
				if (typeof imageRaw === "string") setImageExtractionModel(imageRaw);
				if (typeof wikiRaw === "string") setWikiModel(wikiRaw);
				if (typeof skillRaw === "string") setSkillModel(skillRaw);
				setSearchStrategyState(strategy);
				setSearchMcpProviderState(provider);
				setSearchHealth(describeSearchHealth());
			} catch (error) {
				console.error("[DefaultsPanel] 加载默认分工设置失败:", error);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const makeModelHandler =
		(
			key:
				| "title_generation_model"
				| "image_extraction_model"
				| "wiki_generation_model"
				| "skill_llm_model",
			setLocal: (v: string) => void,
			currentValue: string,
			errorMsg: string,
		) =>
		async (nextValue: string) => {
			setLocal(nextValue);
			try {
				await setConfig(key, nextValue);
			} catch (error) {
				console.error(`[DefaultsPanel] 保存 ${key} 失败:`, error);
				setLocal(currentValue);
				toast.error(errorMsg);
			}
		};

	const handleTitleModelChange = makeModelHandler(
		"title_generation_model",
		setTitleModel,
		titleModel,
		"保存标题生成模型失败",
	);
	const handleImageExtractionModelChange = makeModelHandler(
		"image_extraction_model",
		setImageExtractionModel,
		imageExtractionModel,
		"保存图像信息提取模型失败",
	);
	const handleWikiModelChange = makeModelHandler(
		"wiki_generation_model",
		setWikiModel,
		wikiModel,
		"保存 Wiki 生成模型失败",
	);
	const handleSkillModelChange = makeModelHandler(
		"skill_llm_model",
		setSkillModel,
		skillModel,
		"保存 Skill 执行模型失败",
	);

	const handleSearchStrategyChange = async (value: SearchStrategy) => {
		const prev = searchStrategy;
		setSearchStrategyState(value);
		try {
			await setSearchStrategy(value);
			setSearchHealth(describeSearchHealth());
		} catch (error) {
			console.error("[DefaultsPanel] 保存搜索策略失败:", error);
			setSearchStrategyState(prev);
			toast.error("保存搜索策略失败");
		}
	};

	const handleSearchMcpProviderChange = async (value: SearchMcpProvider) => {
		const prev = searchMcpProvider;
		setSearchMcpProviderState(value);
		try {
			await setSearchMcpProvider(value);
			setSearchHealth(describeSearchHealth());
		} catch (error) {
			console.error("[DefaultsPanel] 保存 MCP 搜索引擎失败:", error);
			setSearchMcpProviderState(prev);
			toast.error("保存 MCP 搜索引擎失败");
		}
	};

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
			<SettingsPanelHeader
				icon={Sparkles}
				title="默认模型分工"
				description="为不同能力指定默认模型，并调整联网搜索的策略。"
			/>

			{/* 子区段 1：默认模型分工 */}
			<SettingsCardSection
				title="模型分工"
				description="未选择时使用当前对话模型。"
				bodyClassName="pt-1"
			>
				<div id={ANCHOR.titleModel} data-settings-anchor={ANCHOR.titleModel}>
					<SettingsRow
						label="会话标题生成模型"
						description="自动根据对话内容生成简短标题。"
						action={
							<Select
								value={titleModel}
								onChange={(e) => handleTitleModelChange(e.target.value)}
								variant="inline"
								containerClassName="w-auto min-w-[220px]"
								options={modelOptions}
							/>
						}
					/>
				</div>
				<div id={ANCHOR.imageModel} data-settings-anchor={ANCHOR.imageModel}>
					<SettingsRow
						label="图像信息提取模型"
						description="用于图片导入后的信息提取与结构化整理。"
						action={
							<Select
								value={imageExtractionModel}
								onChange={(e) =>
									handleImageExtractionModelChange(e.target.value)
								}
								variant="inline"
								containerClassName="w-auto min-w-[220px]"
								options={modelOptions}
							/>
						}
					/>
				</div>
				<div id={ANCHOR.wikiModel} data-settings-anchor={ANCHOR.wikiModel}>
					<SettingsRow
						label="Wiki 生成模型"
						description="用于 Wiki 自动整理、知识地图扩写与页面生成。"
						action={
							<Select
								value={wikiModel}
								onChange={(e) => handleWikiModelChange(e.target.value)}
								variant="inline"
								containerClassName="w-auto min-w-[220px]"
								options={modelOptions}
							/>
						}
					/>
				</div>
				<div id={ANCHOR.skillModel} data-settings-anchor={ANCHOR.skillModel}>
					<SettingsRow
						label="Skill 执行模型"
						description="Agent 执行技能（skill_llm_model）时优先使用的模型。"
						action={
							<Select
								value={skillModel}
								onChange={(e) => handleSkillModelChange(e.target.value)}
								variant="inline"
								containerClassName="w-auto min-w-[220px]"
								options={modelOptions}
							/>
						}
					/>
				</div>
			</SettingsCardSection>

			{/* 子区段 2：搜索策略 */}
			<SettingsCardSection
				title="搜索策略"
				description="联网搜索的本地 / MCP 回退顺序与引擎选择。"
				bodyClassName="pt-1"
			>
				<div
					id={ANCHOR.searchStrategy}
					data-settings-anchor={ANCHOR.searchStrategy}
				>
					<SettingsRow
						label="搜索优先级"
						description="控制本地搜索与 MCP 搜索的回退顺序。"
						action={
							<Select
								value={searchStrategy}
								onChange={(e) =>
									handleSearchStrategyChange(e.target.value as SearchStrategy)
								}
								variant="inline"
								containerClassName="w-auto min-w-[240px]"
								options={[
									{
										value: "local_first",
										label: "本地优先（失败再用 MCP）",
									},
									{
										value: "mcp_first",
										label: "MCP 优先（失败再用本地）",
									},
									{ value: "local_only", label: "仅本地（不联网）" },
									{ value: "mcp_only", label: "仅 MCP" },
								]}
							/>
						}
					/>
				</div>
				<div
					id={ANCHOR.searchProvider}
					data-settings-anchor={ANCHOR.searchProvider}
				>
					<SettingsRow
						label="MCP 搜索引擎"
						description="当策略选择 MCP 时使用的具体工具。"
						action={
							<Select
								value={searchMcpProvider}
								onChange={(e) =>
									handleSearchMcpProviderChange(
										e.target.value as SearchMcpProvider,
									)
								}
								variant="inline"
								containerClassName="w-auto min-w-[240px]"
								options={[
									{ value: "auto", label: "自动（优先 Tavily）" },
									{ value: "tavily", label: "Tavily (MCP)" },
									{ value: "exa_mcp", label: "Exa MCP（免费）" },
								]}
							/>
						}
					/>
				</div>
				{searchHealth && (
					<div
						id={ANCHOR.searchHealth}
						data-settings-anchor={ANCHOR.searchHealth}
						className="mt-3"
					>
						<SettingsHint tone="info" title="当前健康状态">
							<span className="font-mono text-[11px]">{searchHealth}</span>
						</SettingsHint>
					</div>
				)}
			</SettingsCardSection>
		</SettingsPageContainer>
	);
}
