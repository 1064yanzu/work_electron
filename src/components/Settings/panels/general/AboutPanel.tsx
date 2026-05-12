/**
 * AboutPanel — 通用 · 关于与更新
 *
 * 展示当前版本信息；集成 electron-updater 应用内更新（检测 → 下载 → 重启安装）。
 * 主进程通过 `update-state-changed` 事件实时推送状态变化。
 */
import {
	Download,
	Info,
	RefreshCw,
	Rocket,
	CheckCircle2,
	AlertCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { invoke } from "../../../../lib/tauriCompat";
import { listen } from "../../../../lib/tauriEventCompat";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import {
	SettingsButton,
	SettingsCardSection,
	SettingsPageContainer,
	SettingsRow,
} from "../../ui/SettingsPrimitives";

interface UpdateProgress {
	percent: number;
	transferred: number;
	total: number;
	bytesPerSecond: number;
}

interface UpdateState {
	status: string;
	version?: string;
	releaseName?: string;
	releaseNotes?: string;
	progress?: UpdateProgress;
	error?: string;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bps: number): string {
	if (bps < 1024) return `${bps} B/s`;
	if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
	return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function AboutPanel() {
	const [appVersion, setAppVersion] = useState("");
	const [updateState, setUpdateState] = useState<UpdateState>({
		status: "idle",
	});

	// 获取当前版本
	useEffect(() => {
		invoke<{ appVersion: string }>("app_get_version").then((res) => {
			setAppVersion(res.appVersion);
		});
	}, []);

	// 监听更新状态变化事件
	useEffect(() => {
		let unlisten: (() => void) | undefined;
		listen<UpdateState>("update-state-changed", (event) => {
			setUpdateState(event.payload);
		}).then((fn) => {
			unlisten = fn;
		});
		return () => {
			unlisten?.();
		};
	}, []);

	// 获取初始状态
	useEffect(() => {
		invoke<UpdateState>("update_get_state").then((state) => {
			setUpdateState(state);
		});
	}, []);

	const handleCheckUpdate = useCallback(async () => {
		try {
			const state = await invoke<UpdateState>("update_check");
			setUpdateState(state);
		} catch (err) {
			console.error("[AboutPanel] 检查更新失败:", err);
		}
	}, []);

	const handleDownload = useCallback(async () => {
		try {
			const state = await invoke<UpdateState>("update_download");
			setUpdateState(state);
		} catch (err) {
			console.error("[AboutPanel] 下载更新失败:", err);
		}
	}, []);

	const handleInstall = useCallback(() => {
		invoke("update_install");
	}, []);

	const isChecking = updateState.status === "checking";
	const isDownloading = updateState.status === "downloading";
	const isDownloaded = updateState.status === "downloaded";
	const isAvailable = updateState.status === "available";
	const isError = updateState.status === "error";

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

			<SettingsCardSection
				title="应用更新"
				description="检查 GitHub Releases 获取最新版本，支持应用内直接下载安装。"
				headerAction={
					<SettingsButton
						variant="secondary"
						size="sm"
						icon={RefreshCw}
						loading={isChecking}
						onClick={handleCheckUpdate}
					>
						{isChecking ? "检查中..." : "检查更新"}
					</SettingsButton>
				}
				bodyClassName="pt-1"
			>
				{/* 有新版本可用 */}
				{isAvailable && updateState.version && (
					<div className="space-y-3 py-3">
						<div className="flex items-center gap-2">
							<span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[12px] font-semibold text-primary">
								v{updateState.version}
							</span>
							<span className="text-[13px] text-text-secondary">
								{updateState.releaseName ?? "新版本可用"}
							</span>
						</div>
						<SettingsButton
							variant="primary"
							size="md"
							icon={Download}
							onClick={handleDownload}
						>
							下载更新
						</SettingsButton>
					</div>
				)}

				{/* 下载中 — 进度条 */}
				{isDownloading && updateState.progress && (
					<div className="space-y-2 py-3">
						<div className="flex items-center justify-between text-[12px] text-text-secondary">
							<span>
								正在下载 v{updateState.version ?? "..."}
							</span>
							<span className="tabular-nums">
								{formatSpeed(updateState.progress.bytesPerSecond)}
							</span>
						</div>
						<div className="h-2 w-full overflow-hidden rounded-full bg-warm-200">
							<div
								className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
								style={{ width: `${updateState.progress.percent}%` }}
							/>
						</div>
						<div className="flex items-center justify-between text-[11px] text-text-muted">
							<span className="tabular-nums">
								{updateState.progress.percent.toFixed(1)}%
							</span>
							<span className="tabular-nums">
								{formatBytes(updateState.progress.transferred)} /{" "}
								{formatBytes(updateState.progress.total)}
							</span>
						</div>
					</div>
				)}

				{/* 下载完成 — 可重启安装 */}
				{isDownloaded && (
					<div className="space-y-3 py-3">
						<div className="flex items-center gap-2 text-[13px] text-text-primary">
							<CheckCircle2
								className="h-4 w-4 text-green-600"
								strokeWidth={1.8}
							/>
							<span>
								v{updateState.version ?? "..."} 已下载完成
							</span>
						</div>
						<SettingsButton
							variant="primary"
							size="md"
							icon={Rocket}
							onClick={handleInstall}
						>
							立即重启安装
						</SettingsButton>
						<p className="text-[11.5px] leading-relaxed text-text-muted">
							应用将立即退出并安装新版本，未保存的工作可能会丢失。
						</p>
					</div>
				)}

				{/* 错误状态 */}
				{isError && (
					<div className="flex items-start gap-2 py-3">
						<AlertCircle
							className="mt-0.5 h-4 w-4 shrink-0 text-error"
							strokeWidth={1.8}
						/>
						<div className="space-y-1">
							<p className="text-[13px] text-text-primary">
								更新检查失败
							</p>
							<p className="text-[12px] text-text-muted">
								{updateState.error ?? "无法连接更新服务器，请稍后重试。"}
							</p>
						</div>
					</div>
				)}

				{/* idle / not-available 状态 */}
				{(updateState.status === "idle" ||
					updateState.status === "not-available") && (
					<p className="py-3 text-[13px] text-text-muted">
						{updateState.status === "not-available"
							? "当前已是最新版本。"
							: "点击右上角按钮检查是否有新版本。"}
					</p>
				)}
			</SettingsCardSection>
		</SettingsPageContainer>
	);
}
