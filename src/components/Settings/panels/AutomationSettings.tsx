import { Clock, Globe, Shield, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { getConfig, setConfig } from "../../../lib/config";
import { Select } from "../../ui/Select";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
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
		<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
			<SettingsPanelHeader
				icon={Workflow}
				title="自动化设置"
				description="配置浏览器自动化行为与信息雷达抓取策略"
			/>

			{/* 抓取频率 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>
						<span className="flex items-center gap-1.5">
							<Clock className="w-3.5 h-3.5" />
							抓取频率
						</span>
					</SettingsSectionTitle>
					<SettingsRow
						label="后台自动收集"
						description={`定期检查已订阅源的更新。上次运行：${
							lastRunAt
								? new Date(lastRunAt).toLocaleString("zh-CN")
								: "暂无记录"
						}`}
						action={
							<Select
								value={fetchFrequency}
								onChange={(e) => handleFrequencyChange(e.target.value)}
								variant="inline"
								containerClassName="w-auto min-w-[140px]"
								options={[
									{ value: "hourly", label: "每小时" },
									{ value: "daily", label: "每天（默认）" },
									{ value: "weekly", label: "每周" },
									{ value: "manual", label: "手动触发" },
								]}
							/>
						}
					/>
				</div>
			</SettingsSectionCard>

			{/* 浏览器行为 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>
						<span className="flex items-center gap-1.5">
							<Globe className="w-3.5 h-3.5" />
							浏览器行为
						</span>
					</SettingsSectionTitle>
					<SettingsRow
						label="无头模式 (Headless)"
						description="在后台运行浏览器，不显示界面，速度更快"
						action={
							<SettingsSwitch
								checked={headlessMode}
								onChange={handleHeadlessModeChange}
							/>
						}
					/>
					<SettingsRow
						label="自动提取正文"
						description="智能过滤广告和侧边栏，仅保存文章核心内容"
						action={
							<SettingsSwitch
								checked={autoExtract}
								onChange={handleAutoExtractChange}
							/>
						}
					/>
				</div>
			</SettingsSectionCard>

			{/* 安全与隐私 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>
						<span className="flex items-center gap-1.5">
							<Shield className="w-3.5 h-3.5" />
							安全与隐私
						</span>
					</SettingsSectionTitle>
					<div className="p-4 rounded-2xl border border-border bg-warm-200/60">
						<p className="text-sm text-text-primary mb-2">
							自动化浏览器将使用您的本地网络环境。请确保只抓取您有权访问的公开网站。
						</p>
						<div className="text-xs text-text-muted">
							* 敏感 Cookies 不会被保存
						</div>
					</div>
				</div>
			</SettingsSectionCard>
		</SettingsPageContainer>
	);
}
