/**
 * ProxyHealthBanner — Copilot 侧的「AI 代理不可用」明确错误态。
 *
 * 本地 Anthropic 代理是所有模型流量的唯一出口，它挂掉时用户此前只能看到
 * 笼统的「请求失败」。本横幅订阅主进程监督器广播的健康状态：
 *   - 健康时不渲染任何东西（零开销，不打扰）。
 *   - 不健康时给出明确原因 + 自动重启进度 + 手动重启按钮。
 */
import { RefreshCw, ServerCrash } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useIpcListen } from "../../hooks/useIpcListen";
import { safeInvoke } from "../../lib/tauriBridge";

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

export function ProxyHealthBanner() {
	const [health, setHealth] = useState<ProxyHealth | null>(null);
	const [isRestarting, setIsRestarting] = useState(false);

	useEffect(() => {
		let cancelled = false;
		safeInvoke<ProxyHealth>("anthropic_proxy_get_health")
			.then((next) => {
				if (!cancelled) setHealth(next);
			})
			// 非桌面环境（纯浏览器调试）拿不到 IPC，静默跳过即可
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

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
		} catch {
			// 重启命令本身失败时保留当前不健康状态，横幅继续可见
		} finally {
			setIsRestarting(false);
		}
	}, []);

	if (!health || health.healthy) return null;

	const busy = health.restarting || isRestarting;

	return (
		<div className="mx-4 mt-2 rounded-xl border border-error/30 bg-error/5 px-3.5 py-2.5">
			<div className="flex items-start gap-2.5">
				<ServerCrash
					className="mt-0.5 h-4 w-4 shrink-0 text-error"
					strokeWidth={1.5}
				/>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-text-primary">
						AI 代理服务不可用
					</p>
					<p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
						{busy
							? "正在重启本地代理，请稍候…"
							: "本地模型代理无响应，AI 对话暂时无法使用。"}
						{!busy && health.lastError ? (
							<span className="text-text-muted">
								（{health.lastError}
								{health.consecutiveFailures > 1
									? `，已连续失败 ${health.consecutiveFailures} 次`
									: ""}
								）
							</span>
						) : null}
					</p>
				</div>
				<button
					type="button"
					onClick={() => void handleRestart()}
					disabled={busy}
					className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-error/10 px-2.5 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/15 disabled:opacity-50"
				>
					<RefreshCw
						className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`}
						strokeWidth={1.5}
					/>
					{busy ? "重启中" : "重启代理"}
				</button>
			</div>
		</div>
	);
}
