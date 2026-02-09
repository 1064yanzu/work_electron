import { Settings as SettingsIcon } from "lucide-react";
import { Select } from "../../ui/Select";
import { useEffect, useState } from "react";
import {
	describeSearchHealth,
	getConfig,
	getSearchMcpProvider,
	getSearchStrategy,
	type SearchMcpProvider,
	type SearchStrategy,
	setConfig,
	setSearchMcpProvider,
	setSearchStrategy,
} from "../../../lib/config";
import { useSettingsStore } from "../../../lib/settingsStore";
import { type ThemeMode, themeManager } from "../../../lib/theme";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { toast } from "../../ui/Toast";
import { SettingsPageContainer } from "../ui/SettingsPrimitives";

export function GeneralSettings() {
	const { providers } = useSettingsStore();
	const [theme, setTheme] = useState<ThemeMode>(themeManager.getTheme());
	const [language, setLanguage] = useState<string>("zh-CN");
	const [titleModel, setTitleModel] = useState<string>("");
	const [imageExtractionModel, setImageExtractionModel] = useState<string>("");
	const [searchStrategy, setSearchStrategyState] =
		useState<SearchStrategy>("local_first");
	const [searchMcpProvider, setSearchMcpProviderState] =
		useState<SearchMcpProvider>("auto");
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

			const strategy = await getSearchStrategy();
			setSearchStrategyState(strategy);
			const mcpProvider = await getSearchMcpProvider();
			setSearchMcpProviderState(mcpProvider);
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
		<SettingsPageContainer contentClassName="max-w-2xl space-y-8">
				<div className="border-b border-border pb-4 mb-8">
					<h3 className="text-lg font-serif font-medium text-text-primary flex items-center gap-2">
						<SettingsIcon className="w-5 h-5" />
						常规设置
					</h3>
					<p className="text-sm text-text-secondary mt-1">
						配置应用的基础行为和外观
					</p>
				</div>

				{/* Theme */}
				<div className="space-y-4">
					<h4 className="font-medium text-text-primary">界面外观</h4>
					<div className="grid grid-cols-3 gap-4">
						<button
							onClick={() => handleThemeChange("light")}
							className={`p-4 rounded-lg text-sm font-medium text-center transition-colors duration-200 cursor-pointer shadow-sm hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 ${theme === "light"
								? "border-2 border-primary bg-primary/5 text-primary"
								: "border border-border hover:border-primary/40 text-text-secondary hover:text-primary"
								}`}
						>
							浅色模式
						</button>
						<button
							onClick={() => handleThemeChange("dark")}
							className={`p-4 rounded-lg text-sm font-medium text-center transition-colors duration-200 cursor-pointer shadow-sm hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 ${theme === "dark"
								? "border-2 border-primary bg-primary/5 text-primary"
								: "border border-border hover:border-primary/40 text-text-secondary hover:text-primary"
								}`}
						>
							深色模式
						</button>
						<button
							onClick={() => handleThemeChange("system")}
							className={`p-4 rounded-lg text-sm font-medium text-center transition-colors duration-200 cursor-pointer shadow-sm hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 ${theme === "system"
								? "border-2 border-primary bg-primary/5 text-primary"
								: "border border-border hover:border-primary/40 text-text-secondary hover:text-primary"
								}`}
						>
							跟随系统
						</button>
					</div>
				</div>


				{/* Language */}
				<div className="space-y-4">
					<h4 className="font-medium text-text-primary">语言</h4>
					<Select
						value={language}
						onChange={(e) => handleLanguageChange(e.target.value)}
						options={[
							{ value: "zh-CN", label: "简体中文" },
							{ value: "en-US", label: "English" },
						]}
					/>
				</div>

				{/* 搜索策略 */}
				<div className="space-y-4">
					<h4 className="font-medium text-text-primary">搜索策略</h4>
					<Select
						value={searchStrategy}
						onChange={(e) =>
							handleSearchStrategyChange(e.target.value as SearchStrategy)
						}
						options={[
							{ value: "local_first", label: "本地优先（失败或无结果再用 MCP）" },
							{ value: "mcp_first", label: "MCP 优先（失败或无结果再用本地）" },
							{ value: "local_only", label: "仅本地（不联网）" },
							{ value: "mcp_only", label: "仅 MCP" },
						]}
					/>
					<Select
						value={searchMcpProvider}
						onChange={(e) =>
							handleSearchMcpProviderChange(
								e.target.value as SearchMcpProvider,
							)
						}
						options={[
							{ value: "auto", label: "自动（优先 Tavily，无则 Exa MCP）" },
							{ value: "tavily", label: "Tavily (MCP)" },
							{ value: "exa_mcp", label: "Exa MCP（免费）" },
						]}
					/>
					{searchHealth && (
						<p className="text-xs text-text-muted">
							当前健康状态：{searchHealth}
						</p>
					)}
				</div>

				{/* AI Capabilities */}
				<div className="space-y-4">
					<h4 className="font-medium text-text-primary">AI 能力</h4>
					<div className="space-y-3">
						<div>
							<label className="text-sm text-text-secondary mb-1.5 block">
								会话标题生成模型
							</label>
							<Select
								value={titleModel}
								onChange={(e) => handleTitleModelChange(e.target.value)}
							>
								<option value="">跟随当前对话模型 (默认)</option>
								{allModels.map((model) => (
									<option
										key={`${model.provider}-${model.id}`}
										value={model.id}
									>
										{model.id} ({model.provider})
									</option>
								))}
							</Select>
							<p className="text-xs text-text-muted mt-1.5">
								用于自动根据对话内容生成简短标题。如果未选择，将尝试使用当前对话的模型。
							</p>
						</div>

						<div>
							<label className="text-sm text-text-secondary mb-1.5 block">
								图像信息提取模型
							</label>
							<Select
								value={imageExtractionModel}
								onChange={(e) =>
									handleImageExtractionModelChange(e.target.value)
								}
							>
								<option value="">跟随当前对话模型 (默认)</option>
								{allModels.map((model) => (
									<option
										key={`${model.provider}-${model.id}`}
										value={model.id}
									>
										{model.id} ({model.provider})
									</option>
								))}
							</Select>
							<p className="text-xs text-text-muted mt-1.5">
								用于图片导入后的信息提取与结构化整理。如果未选择，将尝试使用当前对话的模型。
							</p>
						</div>
					</div>
				</div>

				{/* Update */}
				<div className="pt-4 border-t border-border">
					<div className="flex items-center justify-between">
						<div>
							<div className="font-medium text-text-primary">当前版本</div>
							<div className="text-xs text-text-muted">v0.1.0-alpha</div>
						</div>
						<button
							onClick={handleCheckUpdate}
							disabled={isCheckingUpdate}
							className="px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-white hover:text-primary hover:border-primary transition-all disabled:opacity-50"
						>
							{isCheckingUpdate ? "检查中..." : "检查更新"}
						</button>
					</div>
				</div>
		</SettingsPageContainer>
	);
}
