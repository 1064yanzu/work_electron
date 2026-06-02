/**
 * AppUpdateCard — 应用更新卡片
 *
 * 设计目标：把检查 / 下载 / 安装的多步状态收敛成一个单卡片，
 * 用色彩、icon 和状态行（+ 必要时的进度条）告诉用户在做什么、能做什么，
 * 不堆砌冗长的说明文字。
 */
import {
	AlertCircle,
	CheckCircle2,
	Download,
	FolderOpen,
	RefreshCw,
	Rocket,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../../../lib/utils";
import { invoke } from "../../../../lib/tauriCompat";
import { listen } from "../../../../lib/tauriEventCompat";
import { SettingsButton, SettingsBadge } from "../../ui/SettingsButtons";
import { SettingsCardSection } from "../../ui/SettingsPrimitives";
import { toast } from "../../../ui/Toast";

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
	if (bps < 1024) return `${Math.max(0, Math.round(bps))} B/s`;
	if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
	return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function normalizeUpdateError(error?: string): string {
	if (!error) return "无法连接更新服务器，请检查网络后重试。";
	if (error === "UPDATE_NOT_READY") return "更新包尚未下载完成，请先下载更新。";
	if (error === "INSTALL_NOT_TRIGGERED") {
		return "应用没能自动重启安装。可以手动打开下载好的更新包来完成安装。";
	}
	if (error.includes("latest-mac.yml")) {
		return "当前 Release 缺少 macOS 自动更新元数据，请联系开发者补齐。";
	}
	if (error.toLowerCase().includes("net::") || error.includes("ENOTFOUND")) {
		return "网络连接异常，请检查网络后重试。";
	}
	return error;
}

function pickReleaseNotes(notes?: string): string | undefined {
	if (!notes) return undefined;
	const trimmed = notes.replace(/<[^>]*>/g, "").replace(/\s+\n/g, "\n").trim();
	return trimmed || undefined;
}

export function AppUpdateCard() {
	const [updateState, setUpdateState] = useState<UpdateState>({
		status: "idle",
	});
	const [actionBusy, setActionBusy] = useState<
		"check" | "download" | "install" | "reveal" | null
	>(null);
	const installTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let unlisten: (() => void) | undefined;
		listen<UpdateState>("update-state-changed", (event) => {
			setUpdateState(event.payload);
			if (
				event.payload.status !== "checking" &&
				event.payload.status !== "downloading" &&
				event.payload.status !== "installing"
			) {
				setActionBusy(null);
			}
		}).then((fn) => {
			unlisten = fn;
		});
		return () => {
			unlisten?.();
			if (installTimerRef.current) clearTimeout(installTimerRef.current);
		};
	}, []);

	useEffect(() => {
		invoke<UpdateState>("update_get_state").then((state) => {
			setUpdateState(state);
		});
	}, []);

	const handleCheckUpdate = useCallback(async () => {
		setActionBusy("check");
		try {
			const state = await invoke<UpdateState>("update_check");
			setUpdateState(state);
			if (state.status === "not-available") {
				toast.success("当前已是最新版本。");
			}
		} catch (err) {
			toast.error(
				`检查更新失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setActionBusy((busy) => (busy === "check" ? null : busy));
		}
	}, []);

	const handleDownload = useCallback(async () => {
		setActionBusy("download");
		try {
			const state = await invoke<UpdateState>("update_download");
			setUpdateState(state);
		} catch (err) {
			toast.error(
				`下载更新失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, []);

	const handleInstall = useCallback(async () => {
		setActionBusy("install");
		setUpdateState((prev) => ({
			...prev,
			status: "installing",
			error: undefined,
		}));
		try {
			await invoke("update_install");
		} catch (err) {
			setActionBusy(null);
			toast.error(
				`启动安装失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, []);

	const handleRevealPending = useCallback(async () => {
		setActionBusy("reveal");
		try {
			const res = await invoke<{
				success: boolean;
				path?: string;
				error?: string;
			}>("update_reveal_pending");
			if (!res.success) {
				toast.error(
					res.error === "NO_DOWNLOADED_FILE"
						? "没有可定位的更新包，请先下载更新。"
						: `打开更新包失败：${res.error ?? "未知错误"}`,
				);
			}
		} catch (err) {
			toast.error(
				`打开更新包失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setActionBusy(null);
		}
	}, []);

	const isChecking = updateState.status === "checking" || actionBusy === "check";
	const isDownloading =
		updateState.status === "downloading" || actionBusy === "download";
	const isInstalling =
		updateState.status === "installing" || actionBusy === "install";
	const isDownloaded = updateState.status === "downloaded";
	const isAvailable = updateState.status === "available";
	const isError = updateState.status === "error";
	const isUpToDate = updateState.status === "not-available";

	const progressPercent = Math.min(
		100,
		Math.max(0, updateState.progress?.percent ?? 0),
	);

	const releaseNotes = pickReleaseNotes(updateState.releaseNotes);

	// 状态徽章 + 主标题 + 副文案
	const headline = (() => {
		if (isError) {
			return {
				badge: <SettingsBadge tone="error">更新失败</SettingsBadge>,
				icon: <AlertCircle className="h-4 w-4 text-error" strokeWidth={1.7} />,
				title: "更新遇到问题",
				subtitle: normalizeUpdateError(updateState.error),
			};
		}
		if (isInstalling) {
			return {
				badge: <SettingsBadge tone="primary">正在重启</SettingsBadge>,
				icon: (
					<Rocket
						className="h-4 w-4 text-primary animate-pulse"
						strokeWidth={1.7}
					/>
				),
				title: `正在安装 v${updateState.version ?? ""}`.trim(),
				subtitle: "应用即将退出，请稍候系统弹出的安装确认。",
			};
		}
		if (isDownloaded) {
			return {
				badge: <SettingsBadge tone="success">已就绪</SettingsBadge>,
				icon: (
					<CheckCircle2
						className="h-4 w-4 text-mint-600"
						strokeWidth={1.7}
					/>
				),
				title: `v${updateState.version} 已下载完成`,
				subtitle: "重启后将自动应用更新。",
			};
		}
		if (isDownloading) {
			return {
				badge: <SettingsBadge tone="primary">正在下载</SettingsBadge>,
				icon: (
					<Download
						className="h-4 w-4 text-primary animate-pulse"
						strokeWidth={1.7}
					/>
				),
				title: `正在下载 v${updateState.version ?? ""}`.trim(),
				subtitle: undefined,
			};
		}
		if (isAvailable) {
			return {
				badge: <SettingsBadge tone="primary">新版本</SettingsBadge>,
				icon: <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.7} />,
				title: `v${updateState.version} 可用`,
				subtitle: updateState.releaseName ?? undefined,
			};
		}
		if (isChecking) {
			return {
				badge: <SettingsBadge tone="neutral">检查中</SettingsBadge>,
				icon: (
					<RefreshCw
						className="h-4 w-4 text-text-secondary animate-spin"
						strokeWidth={1.7}
					/>
				),
				title: "正在检查最新版本",
				subtitle: undefined,
			};
		}
		if (isUpToDate) {
			return {
				badge: <SettingsBadge tone="success">已是最新</SettingsBadge>,
				icon: (
					<CheckCircle2
						className="h-4 w-4 text-mint-600"
						strokeWidth={1.7}
					/>
				),
				title: "你已经在使用最新版本",
				subtitle: undefined,
			};
		}
		return {
			badge: <SettingsBadge tone="neutral">待检查</SettingsBadge>,
			icon: <Sparkles className="h-4 w-4 text-text-muted" strokeWidth={1.7} />,
			title: "应用更新",
			subtitle: "点击右上角「检查更新」获取最新版本。",
		};
	})();

	// 主操作按钮
	const primaryAction = (() => {
		if (isAvailable) {
			return (
				<SettingsButton
					variant="primary"
					size="md"
					icon={Download}
					loading={isDownloading}
					onClick={handleDownload}
				>
					下载更新
				</SettingsButton>
			);
		}
		if (isDownloaded) {
			return (
				<SettingsButton
					variant="primary"
					size="md"
					icon={Rocket}
					loading={isInstalling}
					onClick={handleInstall}
				>
					立即重启安装
				</SettingsButton>
			);
		}
		return null;
	})();

	return (
		<SettingsCardSection
			title="应用更新"
			headerAction={
				<SettingsButton
					variant="secondary"
					size="sm"
					icon={RefreshCw}
					loading={isChecking}
					disabled={isDownloading || isInstalling}
					onClick={handleCheckUpdate}
				>
					{isChecking ? "检查中" : "检查更新"}
				</SettingsButton>
			}
			bodyClassName="pt-1"
		>
			<div className="space-y-3 py-2">
				{/* 主状态卡 */}
				<div
					className={cn(
						"rounded-2xl border px-4 py-3.5 transition-colors duration-300",
						isError
							? "border-[rgba(181,51,51,0.22)] bg-[rgba(181,51,51,0.05)]"
							: isDownloaded || isUpToDate
								? "border-mint-300/55 bg-mint-50/60 dark:bg-mint-900/15"
								: "border-border bg-warm-50/70 dark:bg-cream-900/30",
					)}
				>
					<div className="flex items-start justify-between gap-3">
						<div className="flex min-w-0 items-start gap-2.5">
							<span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warm-50 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] dark:bg-cream-900/40">
								{headline.icon}
							</span>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<h4 className="text-[14px] font-semibold leading-tight text-text-primary">
										{headline.title || "应用更新"}
									</h4>
									{headline.badge}
								</div>
								{headline.subtitle && (
									<p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
										{headline.subtitle}
									</p>
								)}
							</div>
						</div>
						{primaryAction}
					</div>

					{isDownloading && (
						<div className="mt-3 space-y-1.5">
							<div className="h-2 w-full overflow-hidden rounded-full bg-warm-200/70">
								<div
									className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
									style={{ width: `${progressPercent}%` }}
								/>
							</div>
							<div className="flex items-center justify-between text-[11px] tabular-nums text-text-muted">
								<span>
									{progressPercent.toFixed(1)}%
									{updateState.progress
										? `  ·  ${formatBytes(updateState.progress.transferred)} / ${formatBytes(updateState.progress.total)}`
										: ""}
								</span>
								<span>
									{updateState.progress
										? formatSpeed(updateState.progress.bytesPerSecond)
										: "准备中"}
								</span>
							</div>
						</div>
					)}

					{isError && (
						<div className="mt-3 flex flex-wrap items-center gap-2">
							<SettingsButton
								variant="secondary"
								size="sm"
								icon={RefreshCw}
								onClick={handleCheckUpdate}
								loading={isChecking}
							>
								重新检查
							</SettingsButton>
							{(updateState.error === "INSTALL_NOT_TRIGGERED" ||
								isDownloaded) && (
								<SettingsButton
									variant="secondary"
									size="sm"
									icon={FolderOpen}
									loading={actionBusy === "reveal"}
									onClick={handleRevealPending}
								>
									显示更新包
								</SettingsButton>
							)}
						</div>
					)}
				</div>

				{/* 发布说明：仅在有内容且处于发现 / 已下载状态时展示 */}
				{releaseNotes && (isAvailable || isDownloaded || isDownloading) && (
					<details className="group rounded-xl border border-border bg-warm-50/40 px-3.5 py-2.5 open:bg-warm-50/70 dark:bg-cream-900/20">
						<summary className="cursor-pointer list-none text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary">
							<span className="inline-flex items-center gap-1.5">
								<span className="select-none text-text-muted transition-transform group-open:rotate-90">
									›
								</span>
								更新内容
							</span>
						</summary>
						<p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-text-secondary">
							{releaseNotes}
						</p>
					</details>
				)}
			</div>
		</SettingsCardSection>
	);
}
