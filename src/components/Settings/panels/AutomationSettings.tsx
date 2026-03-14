import { Clock, Globe, Shield, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { getConfig, setConfig } from "../../../lib/config";
import { Select } from "../../ui/Select";
import {
	SettingsPageContainer,
	SettingsSwitch,
} from "../ui/SettingsPrimitives";

export function AutomationSettings() {
	const [fetchFrequency, setFetchFrequency] = useState("daily");
	const [headlessMode, setHeadlessMode] = useState(true);
	const [autoExtract, setAutoExtract] = useState(true);
	const [lastRunAt, setLastRunAt] = useState<string | null>(null);

	useEffect(() => {
		loadSettings();
	}, []);

	const loadSettings = async () => {
		try {
			const freq = await getConfig("automation.fetch_frequency");
			const headless = await getConfig("automation.headless_mode");
			const extract = await getConfig("automation.auto_extract");
			const lastRun = await getConfig("automation.last_run_at");

			if (freq) setFetchFrequency(freq);
			if (headless !== null) setHeadlessMode(headless);
			if (extract !== null) setAutoExtract(extract);
			setLastRunAt(
				typeof lastRun === "string" && lastRun.trim() ? lastRun : null,
			);
		} catch (error) {
			console.error("加载设置失败:", error);
		}
	};

	const handleFrequencyChange = async (value: string) => {
		setFetchFrequency(value);
		try {
			await setConfig("automation.fetch_frequency", value);
		} catch (error) {
			console.error("保存失败:", error);
		}
	};

	const handleHeadlessModeChange = async (checked: boolean) => {
		setHeadlessMode(checked);
		try {
			await setConfig("automation.headless_mode", checked);
		} catch (error) {
			console.error("保存失败:", error);
		}
	};

	const handleAutoExtractChange = async (checked: boolean) => {
		setAutoExtract(checked);
		try {
			await setConfig("automation.auto_extract", checked);
		} catch (error) {
			console.error("保存失败:", error);
		}
	};

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-8">
			<div className="border-b border-border pb-4 mb-8">
				<h3 className="text-lg font-serif font-medium text-text-primary flex items-center gap-2">
					<Zap className="w-5 h-5" />
					自动化设置
				</h3>
				<p className="text-sm text-text-secondary mt-1">
					配置浏览器自动化行为与信息雷达抓取策略
				</p>
			</div>

			{/* Fetch Frequency */}
			<div className="space-y-4">
				<h4 className="font-medium text-text-primary flex items-center gap-2">
					<Clock className="w-4 h-4 text-text-muted" />
					抓取频率
				</h4>
				<div className="p-4 rounded-lg border border-border bg-surface/30">
					<div className="flex items-center justify-between mb-4">
						<div>
							<div className="text-sm font-medium text-text-primary">
								后台自动收集
							</div>
							<div className="text-xs text-text-secondary">
								定期检查已订阅源的更新
							</div>
						</div>
						<Select
							value={fetchFrequency}
							onChange={(e) => handleFrequencyChange(e.target.value)}
							variant="inline"
							containerClassName="w-auto"
							options={[
								{ value: "hourly", label: "每小时" },
								{ value: "daily", label: "每天 (默认)" },
								{ value: "weekly", label: "每周" },
								{ value: "manual", label: "手动触发" },
							]}
						/>
					</div>
					<div className="text-xs text-text-muted flex gap-1">
						<span>上次运行:</span>
						<span className="font-mono">
							{lastRunAt
								? new Date(lastRunAt).toLocaleString("zh-CN")
								: "暂无记录"}
						</span>
					</div>
				</div>
			</div>

			{/* Browser Behavior */}
			<div className="space-y-4">
				<h4 className="font-medium text-text-primary flex items-center gap-2">
					<Globe className="w-4 h-4 text-text-muted" />
					浏览器行为
				</h4>
				<div className="space-y-3">
					<label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface/50 cursor-pointer transition-colors">
						<SettingsSwitch
							checked={headlessMode}
							onChange={handleHeadlessModeChange}
							className="mt-0.5"
						/>
						<div>
							<div className="text-sm font-medium text-text-primary">
								无头模式 (Headless)
							</div>
							<div className="text-xs text-text-secondary">
								在后台运行浏览器，不显示界面，速度更快
							</div>
						</div>
					</label>
					<label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface/50 cursor-pointer transition-colors">
						<SettingsSwitch
							checked={autoExtract}
							onChange={handleAutoExtractChange}
							className="mt-0.5"
						/>
						<div>
							<div className="text-sm font-medium text-text-primary">
								自动提取正文
							</div>
							<div className="text-xs text-text-secondary">
								智能过滤广告和侧边栏，仅保存文章核心内容
							</div>
						</div>
					</label>
				</div>
			</div>

			{/* Security */}
			<div className="space-y-4">
				<h4 className="font-medium text-text-primary flex items-center gap-2">
					<Shield className="w-4 h-4 text-text-muted" />
					安全与隐私
				</h4>
				<div className="p-4 rounded-lg border border-yellow-100 bg-yellow-50/30">
					<p className="text-sm text-yellow-800 mb-2">
						自动化浏览器将使用您的本地网络环境。请确保只抓取您有权访问的公开网站。
					</p>
					<div className="text-xs text-yellow-600">
						* 敏感 Cookies 不会被保存
					</div>
				</div>
			</div>
		</SettingsPageContainer>
	);
}
