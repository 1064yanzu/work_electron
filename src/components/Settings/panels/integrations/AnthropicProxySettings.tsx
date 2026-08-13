/**
 * AnthropicProxySettings — 集成 · AI 代理
 *
 * 本地 Anthropic 兼容代理是所有 AI 模型流量的唯一出口（Agent SDK 的 baseUrl
 * 指向它）。此前它对用户完全不可见：挂了只能重启整个应用。主进程现在有
 * 健康监督器（周期探活 + 自动重启），本面板暴露：
 *   1. 实时健康状态与端口（订阅 `anthropic-proxy-status` 广播）
 *   2. 手动重启入口
 *   3. 访问 token 的查看与轮换（SDK 子进程经环境变量携带）
 */
import { Activity, KeyRound, Link2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useIpcListen } from "../../../../hooks/useIpcListen";
import { safeInvoke } from "../../../../lib/tauriBridge";
import { confirmDialog } from "../../../ui/ConfirmDialog";
import { toast } from "../../../ui/Toast";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import {
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../../ui/SettingsPrimitives";

interface ProxyHealth {
	healthy: boolean;
	port: number;
	baseUrl: string;
	consecutiveFailures: number;
	lastCheckedAt: number | null;
	lastError: string | null;
	restartCount: number;
	restarting: boolean;
}

interface HttpStatus {
	anthropicProxy: { port: number; baseUrl: string; token?: string };
}

const ANCHOR = {
	status: "integrations.aiProxy.status",
	token: "integrations.aiProxy.token",
} as const;

export function AnthropicProxySettings() {
	const [health, setHealth] = useState<ProxyHealth | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRestarting, setIsRestarting] = useState(false);
	const [isRotating, setIsRotating] = useState(false);
	const [tokenVisible, setTokenVisible] = useState(false);

	const loadStatus = useCallback(async () => {
		setIsLoading(true);
		try {
			const [nextHealth, httpStatus] = await Promise.all([
				safeInvoke<ProxyHealth>("anthropic_proxy_get_health"),
				safeInvoke<HttpStatus>("http_get_status"),
			]);
			setHealth(nextHealth);
			setToken(httpStatus.anthropicProxy.token ?? null);
		} catch (error) {
			console.error("[AnthropicProxySettings] 读取代理状态失败:", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadStatus();
	}, [loadStatus]);

	useIpcListen<ProxyHealth>("anthropic-proxy-status", (payload) => {
		setHealth(payload);
	});

	const handleRestart = useCallback(async () => {
		setIsRestarting(true);
		try {
			const result = await safeInvoke<{
				success: boolean;
				health: ProxyHealth;
			}>("anthropic_proxy_restart");
			setHealth(result.health);
			if (result.success) {
				toast.success(`代理已重启，端口 ${result.health.port}`);
			} else {
				toast.error(`重启失败：${result.health.lastError || "未知原因"}`);
			}
		} catch (error) {
			toast.error(
				`重启失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setIsRestarting(false);
		}
	}, []);

	const handleRotateToken = useCallback(async () => {
		const confirmed = await confirmDialog.show({
			type: "warning",
			title: "轮换代理 token",
			message:
				"轮换后旧 token 立即失效。正在运行的 Agent 会话不受影响，新会话会自动使用新 token。确定继续吗？",
			confirmText: "轮换",
			cancelText: "取消",
		});
		if (!confirmed) return;

		setIsRotating(true);
		try {
			const result = await safeInvoke<{ success: boolean; error?: string }>(
				"http_rotate_service_token",
				{ service: "anthropic_proxy" },
			);
			if (!result.success) {
				throw new Error(result.error || "轮换失败");
			}
			await loadStatus();
			toast.success("代理 token 已轮换");
		} catch (error) {
			toast.error(
				`轮换失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setIsRotating(false);
		}
	}, [loadStatus]);

	const busy = isRestarting || Boolean(health?.restarting);
	const statusText = isLoading
		? "正在检查…"
		: !health
			? "状态未知"
			: health.restarting
				? "正在自动重启…"
				: health.healthy
					? `运行正常，每 30 秒自动探活${health.restartCount > 0 ? `（本次会话已自动恢复 ${health.restartCount} 次）` : ""}`
					: `不可用${health.lastError ? `：${health.lastError}` : ""}`;

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={Activity}
				title="AI 代理"
				description="本机内嵌的 Anthropic 兼容代理：所有 AI 模型流量的统一出口，带健康监测与自动恢复。"
			/>

			<SettingsSectionCard>
				<div
					className="p-5"
					id={ANCHOR.status}
					data-settings-anchor={ANCHOR.status}
				>
					<SettingsSectionTitle>健康状态</SettingsSectionTitle>

					<SettingsRow
						label="运行状态"
						description={statusText}
						action={
							<div className="flex items-center gap-2">
								<span
									className={
										health?.healthy
											? "inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
											: "inline-flex items-center gap-1.5 rounded-full bg-error/10 px-2.5 py-1 text-xs font-medium text-error"
									}
								>
									<Activity className="h-3 w-3" />
									{isLoading
										? "检查中"
										: health?.restarting
											? "重启中"
											: health?.healthy
												? "健康"
												: "不可用"}
								</span>
								<button
									type="button"
									onClick={() => void loadStatus()}
									disabled={isLoading}
									aria-label="刷新代理状态"
									className="rounded-lg p-1.5 text-text-light transition-colors hover:bg-warm-200 hover:text-text-secondary disabled:opacity-50"
								>
									<RefreshCw
										className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
									/>
								</button>
							</div>
						}
					/>

					{health && health.port > 0 && (
						<SettingsRow
							label="服务地址"
							description={`端口 ${health.port}，仅监听本机回环地址；自动重启后可能变化`}
							action={
								<span className="inline-flex items-center gap-1.5 rounded-lg bg-warm-200 px-3 py-1.5 font-mono text-xs">
									<Link2 className="h-3.5 w-3.5" />
									{health.baseUrl}
								</span>
							}
						/>
					)}

					<SettingsRow
						label="手动重启"
						description="代理异常但未触发自动恢复时使用。重启期间进行中的 AI 请求会中断。"
						action={
							<button
								type="button"
								onClick={() => void handleRestart()}
								disabled={busy}
								className="inline-flex items-center gap-1.5 rounded-lg bg-warm-200 px-3 py-1.5 text-xs transition-colors hover:bg-warm-300 disabled:opacity-50"
							>
								<RefreshCw
									className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`}
								/>
								{busy ? "重启中…" : "重启代理"}
							</button>
						}
					/>
				</div>
			</SettingsSectionCard>

			{token !== null && (
				<SettingsSectionCard>
					<div
						className="p-5"
						id={ANCHOR.token}
						data-settings-anchor={ANCHOR.token}
					>
						<SettingsSectionTitle>访问 token</SettingsSectionTitle>

						<SettingsRow
							label="token"
							description="主进程拉起 Agent SDK 时经环境变量下发；只在本机有效。"
							action={
								<div className="flex items-center gap-2">
									<code className="max-w-[14rem] truncate rounded-lg bg-warm-200 px-2.5 py-1.5 font-mono text-xs text-text-secondary">
										{tokenVisible
											? token
											: "•".repeat(Math.min(token.length, 24))}
									</code>
									<button
										type="button"
										onClick={() => setTokenVisible((v) => !v)}
										className="rounded-lg px-2 py-1.5 text-xs text-text-light transition-colors hover:bg-warm-200 hover:text-text-secondary"
									>
										{tokenVisible ? "隐藏" : "显示"}
									</button>
								</div>
							}
						/>

						<SettingsRow
							label="轮换 token"
							description="怀疑泄漏时重置。新会话自动使用新 token，无需其他配置。"
							action={
								<button
									type="button"
									onClick={() => void handleRotateToken()}
									disabled={isRotating}
									className="inline-flex items-center gap-1.5 rounded-lg bg-warm-200 px-3 py-1.5 text-xs transition-colors hover:bg-warm-300 disabled:opacity-50"
								>
									<KeyRound className="h-3.5 w-3.5" />
									{isRotating ? "轮换中…" : "轮换"}
								</button>
							}
						/>
					</div>
				</SettingsSectionCard>
			)}
		</SettingsPageContainer>
	);
}

export default AnthropicProxySettings;
