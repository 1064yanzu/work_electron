import { Settings as SettingsIcon } from "lucide-react";
import { Select } from "../../ui/Select";
import { useEffect, useState } from "react";
import {
	getCenterUxPrefs,
	describeSearchHealth,
	getConfig,
	getMotionPreference,
	getSearchMcpProvider,
	getSearchStrategy,
	setCenterUxPrefs,
	type SearchMcpProvider,
	type SearchStrategy,
	type CenterUxPrefs,
	setConfig,
	setMotionPreference,
	setSearchMcpProvider,
	setSearchStrategy,
} from "../../../lib/config";
import type { MotionPreference } from "../../../lib/interaction/motionPreference";
import { useSettingsStore } from "../../../lib/settingsStore";
import { type ThemeMode, themeManager } from "../../../lib/theme";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { toast } from "../../ui/Toast";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import { ThemeColorPicker } from "../components/ThemeColorPicker";
import { useSettingsExperience } from "../context/SettingsExperienceContext";
import {
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
} from "../ui/SettingsPrimitives";

export function GeneralSettings() {
	const { providers } = useSettingsStore();
	const { mode, setMode } = useSettingsExperience();
	const [theme, setTheme] = useState<ThemeMode>(themeManager.getTheme());
	const [colorThemeId, setColorThemeId] = useState(
		themeManager.getColorThemeId(),
	);
	const [language, setLanguage] = useState<string>("zh-CN");
	const [titleModel, setTitleModel] = useState<string>("");
	const [imageExtractionModel, setImageExtractionModel] = useState<string>("");
	const [wikiModel, setWikiModel] = useState<string>("");
	const [searchStrategy, setSearchStrategyState] =
		useState<SearchStrategy>("local_first");
	const [searchMcpProvider, setSearchMcpProviderState] =
		useState<SearchMcpProvider>("auto");
	const [motionPreference, setMotionPreferenceState] =
		useState<MotionPreference>("system");
	const [centerUxPrefs, setCenterUxPrefsState] = useState<CenterUxPrefs>({
		defaultView: "graph",
		graphFollow: true,
		artifactClickBehavior: "select_only",
		infoDensity: "comfortable",
	});
	const [searchHealth, setSearchHealth] = useState<string>("");
	const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

	// 获取所有可用模型
	const allModels = providers
		.filter((p) => p.isEnabled)
		.flatMap((p) => p.models.map((m) => ({ id: m, provider: p.name })));

	useEffect(() => {
		loadSettings();
		const unsubscribe = themeManager.subscribe(() => {
			setTheme(themeManager.getTheme());
			setColorThemeId(themeManager.getColorThemeId());
		});
		return () => unsubscribe();
	}, []);

	const loadSettings = async () => {
		try {
			const lang = await getConfig("language");
			if (lang) setLanguage(lang);

			const model = await getConfig("title_generation_model");
			if (model) setTitleModel(model);

			const imageModel = await getConfig("image_extraction_model");
			if (imageModel) setImageExtractionModel(imageModel);

			const wikiGenerationModel = await getConfig("wiki_generation_model");
			if (wikiGenerationModel) setWikiModel(wikiGenerationModel);

			const strategy = await getSearchStrategy();
			setSearchStrategyState(strategy);
			const mcpProvider = await getSearchMcpProvider();
			setSearchMcpProviderState(mcpProvider);
			const motionPref = await getMotionPreference();
			setMotionPreferenceState(motionPref);
			const centerPrefs = await getCenterUxPrefs();
			setCenterUxPrefsState(centerPrefs);
			setSearchHealth(describeSearchHealth());
		} catch (error) {
			console.error("加载设置失败:", error);
		}
	};

	const handleThemeChange = async (newTheme: ThemeMode) => {
		themeManager.setTheme(newTheme);
		try {
			await setConfig("theme", newTheme);
		} catch (error) {
			console.error("保存主题失败:", error);
		}
	};

	const handleColorThemeChange = async (id: string) => {
		themeManager.setColorTheme(id);
		try {
			await setConfig("colorTheme", id);
		} catch (error) {
			console.error("保存色彩主题失败:", error);
		}
	};

	const handleLanguageChange = async (newLang: string) => {
		setLanguage(newLang);
		try {
			await setConfig("language", newLang);
		} catch (error) {
			console.error("保存语言失败:", error);
		}
	};

	const handleTitleModelChange = async (newModel: string) => {
		setTitleModel(newModel);
		try {
			await setConfig("title_generation_model", newModel);
		} catch (error) {
			console.error("保存标题生成模型失败:", error);
		}
	};

	const handleImageExtractionModelChange = async (newModel: string) => {
		setImageExtractionModel(newModel);
		try {
			await setConfig("image_extraction_model", newModel);
		} catch (error) {
			console.error("保存图像信息提取模型失败:", error);
		}
	};

	const handleWikiModelChange = async (newModel: string) => {
		setWikiModel(newModel);
		try {
			await setConfig("wiki_generation_model", newModel);
		} catch (error) {
			console.error("保存 Wiki 模型失败:", error);
		}
	};

	const handleSearchStrategyChange = async (value: SearchStrategy) => {
		setSearchStrategyState(value);
		try {
			await setSearchStrategy(value);
			setSearchHealth(describeSearchHealth());
		} catch (error) {
			console.error("保存搜索策略失败:", error);
		}
	};

	const handleSearchMcpProviderChange = async (value: SearchMcpProvider) => {
		setSearchMcpProviderState(value);
		try {
			await setSearchMcpProvider(value);
			setSearchHealth(describeSearchHealth());
		} catch (error) {
			console.error("保存 MCP 搜索提供商失败:", error);
		}
	};

	const handleMotionPreferenceChange = async (value: MotionPreference) => {
		setMotionPreferenceState(value);
		try {
			await setMotionPreference(value);
		} catch (error) {
			console.error("保存动效偏好失败:", error);
		}
	};

	const handleCenterUxPrefsChange = async (updates: Partial<CenterUxPrefs>) => {
		const next = { ...centerUxPrefs, ...updates };
		setCenterUxPrefsState(next);
		try {
			const saved = await setCenterUxPrefs(updates);
			setCenterUxPrefsState(saved);
		} catch (error) {
			console.error("保存中间栏体验设置失败:", error);
		}
	};

	const handleCheckUpdate = async () => {
		setIsCheckingUpdate(true);
		try {
			// 检查 GitHub releases 获取最新版本
			const response = await fetch(
				"https://api.github.com/repos/1064yanzu/ipo-workbench/releases/latest",
				{
					headers: { Accept: "application/vnd.github.v3+json" },
				},
			);

			if (response.ok) {
				const data = await response.json();
				const latestVersion = data.tag_name?.replace("v", "") || "0.0.0";
				const currentVersion = "0.1.0"; // 当前版本

				if (latestVersion > currentVersion) {
					const shouldUpdate = await confirmDialog.warning(
						`🎉 发现新版本 v${latestVersion}！\n\n当前版本: v${currentVersion}\n\n是否前往下载页面？`,
						"发现新版本",
					);
					if (shouldUpdate) {
						window.open(
							data.html_url ||
								"https://github.com/1064yanzu/ipo-workbench/releases",
							"_blank",
						);
					}
				} else {
					toast.success("当前已是最新版本");
				}
			} else if (response.status === 404) {
				// 仓库不存在或没有 releases
				toast.info("当前已是最新版本（暂无发布版本）");
			} else {
				throw new Error(`HTTP ${response.status}`);
			}
		} catch (error) {
			// 网络错误时静默处理
			console.error("检查更新失败:", error);
			toast.info("当前已是最新版本（无法连接更新服务器）");
		} finally {
			setIsCheckingUpdate(false);
		}
	};

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
			<SettingsPanelHeader
				icon={SettingsIcon}
				title="常规设置"
				description="配置应用的基础行为和外观。"
			/>

			{/* 界面外观 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>界面外观</SettingsSectionTitle>
					<ThemeColorPicker
						currentColorThemeId={colorThemeId}
						currentMode={theme}
						onColorThemeChange={handleColorThemeChange}
						onModeChange={handleThemeChange}
					/>
				</div>
			</SettingsSectionCard>

			{/* 动效与显示 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>动效与显示</SettingsSectionTitle>
					<SettingsRow
						label="动效偏好"
						description="减少动效会显著缩短过渡与动画时长，适合对动态效果敏感的场景。"
						action={
							<Select
								value={motionPreference}
								onChange={(e) =>
									handleMotionPreferenceChange(
										e.target.value as MotionPreference,
									)
								}
								variant="inline"
								containerClassName="w-auto min-w-[160px]"
								options={[
									{ value: "system", label: "跟随系统（默认）" },
									{ value: "standard", label: "标准动效" },
									{ value: "reduced", label: "减少动效" },
								]}
							/>
						}
					/>
					<SettingsRow
						label="设置详细程度"
						description="完整模式会展示更多高级设置项。"
						action={
							<Select
								value={mode}
								onChange={(e) => setMode(e.target.value as typeof mode)}
								variant="inline"
								containerClassName="w-auto min-w-[120px]"
								options={[
									{ value: "simple", label: "默认" },
									{ value: "geek", label: "完整" },
								]}
							/>
						}
					/>
					<SettingsRow
						label="语言"
						action={
							<Select
								value={language}
								onChange={(e) => handleLanguageChange(e.target.value)}
								variant="inline"
								containerClassName="w-auto min-w-[120px]"
								options={[
									{ value: "zh-CN", label: "简体中文" },
									{ value: "en-US", label: "English" },
								]}
							/>
						}
					/>
				</div>
			</SettingsSectionCard>

			{/* 中间栏体验 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>中间栏体验</SettingsSectionTitle>
					<SettingsRow
						label="默认视图"
						action={
							<Select
								value={centerUxPrefs.defaultView}
								onChange={(e) =>
									handleCenterUxPrefsChange({
										defaultView: e.target.value as CenterUxPrefs["defaultView"],
									})
								}
								variant="inline"
								containerClassName="w-auto min-w-[160px]"
								options={[
									{ value: "graph", label: "运行图（推荐）" },
									{ value: "preview", label: "产物预览" },
								]}
							/>
						}
					/>
					<SettingsRow
						label="产物节点点击行为"
						action={
							<Select
								value={centerUxPrefs.artifactClickBehavior}
								onChange={(e) =>
									handleCenterUxPrefsChange({
										artifactClickBehavior: e.target
											.value as CenterUxPrefs["artifactClickBehavior"],
									})
								}
								variant="inline"
								containerClassName="w-auto min-w-[180px]"
								options={[
									{ value: "select_only", label: "仅选中节点（推荐）" },
									{ value: "open_preview", label: "直接打开预览" },
								]}
							/>
						}
					/>
					<SettingsRow
						label="信息密度"
						action={
							<Select
								value={centerUxPrefs.infoDensity}
								onChange={(e) =>
									handleCenterUxPrefsChange({
										infoDensity: e.target.value as CenterUxPrefs["infoDensity"],
									})
								}
								variant="inline"
								containerClassName="w-auto min-w-[120px]"
								options={[
									{ value: "comfortable", label: "舒适" },
									{ value: "compact", label: "紧凑" },
								]}
							/>
						}
					/>
					<SettingsRow
						label="运行图自动跟随"
						description="开启后会自动聚焦到当前活动节点"
						action={
							<SettingsSwitch
								checked={centerUxPrefs.graphFollow}
								onChange={(v) => handleCenterUxPrefsChange({ graphFollow: v })}
							/>
						}
					/>
				</div>
			</SettingsSectionCard>

			{/* 搜索策略 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>搜索策略</SettingsSectionTitle>
					<SettingsRow
						label="搜索优先级"
						action={
							<Select
								value={searchStrategy}
								onChange={(e) =>
									handleSearchStrategyChange(e.target.value as SearchStrategy)
								}
								variant="inline"
								containerClassName="w-auto min-w-[240px]"
								options={[
									{ value: "local_first", label: "本地优先（失败再用 MCP）" },
									{ value: "mcp_first", label: "MCP 优先（失败再用本地）" },
									{ value: "local_only", label: "仅本地（不联网）" },
									{ value: "mcp_only", label: "仅 MCP" },
								]}
							/>
						}
					/>
					<SettingsRow
						label="MCP 搜索引擎"
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
					{searchHealth && (
						<div className="mt-2 px-1">
							<p className="text-xs text-text-muted">
								当前健康状态：{searchHealth}
							</p>
						</div>
					)}
				</div>
			</SettingsSectionCard>

			{/* AI 能力 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>AI 能力</SettingsSectionTitle>
					<SettingsRow
						label="会话标题生成模型"
						description="用于自动根据对话内容生成简短标题。未选择时使用当前对话模型。"
						action={
							<Select
								value={titleModel}
								onChange={(e) => handleTitleModelChange(e.target.value)}
								variant="inline"
								containerClassName="w-auto min-w-[200px]"
							>
								<option value="">跟随对话模型（默认）</option>
								{allModels.map((model) => (
									<option
										key={`${model.provider}-${model.id}`}
										value={model.id}
									>
										{model.id} ({model.provider})
									</option>
								))}
							</Select>
						}
					/>
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
								containerClassName="w-auto min-w-[200px]"
							>
								<option value="">跟随对话模型（默认）</option>
								{allModels.map((model) => (
									<option
										key={`${model.provider}-${model.id}`}
										value={model.id}
									>
										{model.id} ({model.provider})
									</option>
								))}
							</Select>
						}
					/>
					<SettingsRow
						label="Wiki 生成模型"
						description="用于 Wiki 自动整理、知识地图扩写和页面生成。"
						action={
							<Select
								value={wikiModel}
								onChange={(e) => handleWikiModelChange(e.target.value)}
								variant="inline"
								containerClassName="w-auto min-w-[200px]"
							>
								<option value="">跟随对话模型（默认）</option>
								{allModels.map((model) => (
									<option
										key={`${model.provider}-${model.id}-wiki`}
										value={model.id}
									>
										{model.id} ({model.provider})
									</option>
								))}
							</Select>
						}
					/>
				</div>
			</SettingsSectionCard>

			{/* 版本信息 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>关于</SettingsSectionTitle>
					<SettingsRow
						label="当前版本"
						value="v0.1.0-alpha"
						action={
							<button
								onClick={handleCheckUpdate}
								disabled={isCheckingUpdate}
								className="px-4 py-1.5 text-xs font-medium bg-warm-200 hover:bg-warm-300 text-text-secondary rounded-lg transition-colors disabled:opacity-50"
							>
								{isCheckingUpdate ? "检查中..." : "检查更新"}
							</button>
						}
					/>
				</div>
			</SettingsSectionCard>
		</SettingsPageContainer>
	);
}
