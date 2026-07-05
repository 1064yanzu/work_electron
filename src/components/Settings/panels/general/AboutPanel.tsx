/**
 * AboutPanel — 通用 · 关于与更新
 *
 * 展示当前版本信息、应用更新入口与日志诊断工具。
 */
import { Download, FileText, FolderOpen, Info } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../../../../lib/tauriCompat";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import {
	SettingsButton,
	SettingsCardSection,
	SettingsChipGroup,
	SettingsPageContainer,
	SettingsRow,
} from "../../ui/SettingsPrimitives";
import { toast } from "../../../ui/Toast";
import { AppUpdateCard } from "./AppUpdateCard";

interface LogsInfo {
	root: string;
	exists: boolean;
	total_bytes: number;
	subdir_count: number;
	latest_subdirs: string[];
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type LogFileLevel = "default" | "error" | "warn" | "info" | "debug";

const LOG_LEVEL_OPTIONS: Array<{ value: LogFileLevel; label: string }> = [
	{ value: "default", label: "默认" },
	{ value: "error", label: "Error" },
	{ value: "warn", label: "Warn" },
	{ value: "info", label: "Info" },
	{ value: "debug", label: "Debug" },
];

export function AboutPanel() {
	const [appVersion, setAppVersion] = useState("");
	const [logsInfo, setLogsInfo] = useState<LogsInfo | null>(null);
	const [logsBusy, setLogsBusy] = useState<"export" | "reveal" | null>(null);
	const [logLevel, setLogLevel] = useState<LogFileLevel>("default");

	const refreshLogsInfo = useCallback(async () => {
		try {
			const info = await invoke<LogsInfo>("logs_get_info");
			setLogsInfo(info);
		} catch (err) {
			console.error("[AboutPanel] 获取日志信息失败:", err);
		}
	}, []);

	const handleExportLogs = useCallback(async () => {
		setLogsBusy("export");
		try {
			const res = await invoke<{
				canceled: boolean;
				path: string;
				bytes: number;
				error?: string;
			}>("logs_export", { days: 7 });
			if (res.canceled) return;
			if (res.error) {
				toast.error(`日志导出失败：${res.error}`);
				return;
			}
			toast.success(`日志已导出（${formatBytes(res.bytes)}） → ${res.path}`);
		} catch (err) {
			toast.error(
				`日志导出失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setLogsBusy(null);
			void refreshLogsInfo();
		}
	}, [refreshLogsInfo]);

	const handleRevealLogs = useCallback(async () => {
		setLogsBusy("reveal");
		try {
			const res = await invoke<{
				success: boolean;
				path: string;
				error?: string;
			}>("logs_reveal");
			if (!res.success) {
				toast.error(`打开日志目录失败：${res.error ?? "未知错误"}`);
			}
		} catch (err) {
			toast.error(
				`打开日志目录失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setLogsBusy(null);
		}
	}, []);

	// 获取当前版本
	useEffect(() => {
		invoke<{ appVersion: string }>("app_get_version").then((res) => {
			setAppVersion(res.appVersion);
		});
	}, []);

	// 初次加载日志概览 + 已保存的日志级别
	useEffect(() => {
		void refreshLogsInfo();
		void invoke<string | null>("get_config", { key: "log_file_level" })
			.then((v) => {
				if (v === "error" || v === "warn" || v === "info" || v === "debug") {
					setLogLevel(v);
				}
			})
			.catch(() => {});
	}, [refreshLogsInfo]);

	const logLevelRef = useRef(logLevel);
	logLevelRef.current = logLevel;

	const handleLogLevelChange = useCallback(async (next: LogFileLevel) => {
		const prev = logLevelRef.current;
		setLogLevel(next);
		try {
			await invoke("set_log_file_level", { level: next });
			toast.success(
				next === "default"
					? "日志级别已恢复默认"
					: `文件日志级别已设为 ${next}`,
			);
		} catch (err) {
			setLogLevel(prev);
			toast.error(
				`日志级别设置失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, []);

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
			<SettingsPanelHeader
				icon={Info}
				title="关于与更新"
				description="查看当前版本信息，检查并安装应用更新。"
			/>

			<SettingsCardSection
				title="应用信息"
				description="当前版本与运行环境。"
				bodyClassName="pt-1"
			>
				<SettingsRow label="当前版本" value={`v${appVersion}`} />
			</SettingsCardSection>

			<AppUpdateCard />

			<SettingsCardSection
				title="日志与诊断"
				description="排查问题时，可以把日志打包发给开发者；默认导出最近 7 天的运行日志。"
				bodyClassName="pt-1"
			>
				<SettingsRow
					label="日志目录"
					description={logsInfo?.root ?? "日志目录会在第一次出问题时自动创建。"}
					value={
						logsInfo && logsInfo.exists
							? `${formatBytes(logsInfo.total_bytes)} · ${logsInfo.subdir_count} 个时段`
							: undefined
					}
					action={
						<SettingsButton
							variant="secondary"
							size="sm"
							icon={FolderOpen}
							loading={logsBusy === "reveal"}
							onClick={handleRevealLogs}
						>
							打开目录
						</SettingsButton>
					}
				/>
				<SettingsRow
					label="导出日志"
					description="打包成 zip 文件，包含主进程 / Agent SDK / HTTP 三个分类的最近日志，以及应用版本元信息。"
					action={
						<SettingsButton
							variant="primary"
							size="sm"
							icon={Download}
							loading={logsBusy === "export"}
							onClick={handleExportLogs}
						>
							导出为 ZIP
						</SettingsButton>
					}
				/>
				<SettingsRow
					label="文件日志级别"
					description="默认：正式版 Info、开发模式 Debug。排查问题时可临时调到 Debug，立即生效，无需重启。"
					action={
						<SettingsChipGroup<LogFileLevel>
							value={logLevel}
							options={LOG_LEVEL_OPTIONS}
							onChange={(v) => void handleLogLevelChange(v)}
							size="sm"
						/>
					}
				/>
				{logsInfo && logsInfo.exists && logsInfo.latest_subdirs.length > 0 && (
					<div className="mt-2 flex flex-wrap items-center gap-1.5 pt-3">
						<FileText
							className="h-3.5 w-3.5 text-text-muted"
							strokeWidth={1.8}
						/>
						<span className="text-[11.5px] text-text-muted">最近时段：</span>
						{logsInfo.latest_subdirs.map((name) => (
							<span
								key={name}
								className="rounded-full bg-warm-100 px-2 py-0.5 text-[11px] tabular-nums text-text-secondary"
							>
								{name}
							</span>
						))}
					</div>
				)}
			</SettingsCardSection>
		</SettingsPageContainer>
	);
}
