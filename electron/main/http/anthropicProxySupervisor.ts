/**
 * Anthropic 兼容代理的健康监督器。
 *
 * 背景：本地代理是所有 AI 模型流量的唯一出口（Agent SDK 的 baseUrl 指向它），
 * 它一旦挂掉整个 AI 能力全部失效，且此前没有任何自愈手段——用户只能重启应用。
 *
 * 本模块做三件事：
 *   1. 周期探活：定时请求 `/health`，短超时，连续失败即判定不健康。
 *   2. 自动重启：不健康时关闭旧 server 重新拉起（端口从 8765 起重新探测）。
 *   3. 状态广播：健康状态变化通过 `anthropic-proxy-status` 事件推给所有渲染窗口，
 *      Copilot 侧据此展示明确的「代理不可用」错误态，而不是笼统的请求失败。
 */
import type { Server } from "node:http";
import { BrowserWindow } from "electron";
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import { sendToLiveWebContents } from "../utils/safeWebContentsSend";
import { startAnthropicProxyServer } from "./startAnthropicProxyServer";

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const HEALTH_CHECK_TIMEOUT_MS = 3_000;
/** 连续失败达到该次数才触发重启，避免单次网络抖动引发误杀。 */
const FAILURES_BEFORE_RESTART = 2;
/** 两次自动重启之间的最小间隔，防止代理反复崩溃时无限热重启。 */
const RESTART_COOLDOWN_MS = 15_000;

export const ANTHROPIC_PROXY_STATUS_EVENT = "anthropic-proxy-status";

export interface AnthropicProxyHealth {
	healthy: boolean;
	port: number;
	baseUrl: string;
	consecutiveFailures: number;
	lastCheckedAt: number | null;
	lastError: string | null;
	restartCount: number;
	restarting: boolean;
}

export interface AnthropicProxySupervisor {
	getStatus(): AnthropicProxyHealth;
	/** 立即探活一次并返回最新状态（IPC 按需调用）。 */
	checkNow(): Promise<AnthropicProxyHealth>;
	/** 手动重启代理（设置面板 / Copilot 错误态的「重试」按钮）。 */
	restart(): Promise<AnthropicProxyHealth>;
	stop(): void;
}

export async function startAnthropicProxySupervisor({
	logger,
	db,
}: {
	logger: Logger;
	db: DbContext;
}): Promise<AnthropicProxySupervisor> {
	let server: Server | null = null;
	let health: AnthropicProxyHealth = {
		healthy: false,
		port: 0,
		baseUrl: "",
		consecutiveFailures: 0,
		lastCheckedAt: null,
		lastError: null,
		restartCount: 0,
		restarting: false,
	};
	let timer: NodeJS.Timeout | null = null;
	let restartPromise: Promise<void> | null = null;
	let lastRestartAt = 0;
	let stopped = false;

	const broadcast = () => {
		const payload = { ...health };
		for (const win of BrowserWindow.getAllWindows()) {
			sendToLiveWebContents(win, ANTHROPIC_PROXY_STATUS_EVENT, payload);
		}
	};

	const setHealth = (patch: Partial<AnthropicProxyHealth>) => {
		const prev = health;
		health = { ...health, ...patch };
		if (
			prev.healthy !== health.healthy ||
			prev.restarting !== health.restarting ||
			prev.port !== health.port
		) {
			broadcast();
		}
	};

	const startServer = async () => {
		const started = await startAnthropicProxyServer({ logger, db });
		server = started.server;
		setHealth({
			healthy: true,
			port: started.port,
			baseUrl: started.baseUrl,
			consecutiveFailures: 0,
			lastError: null,
			lastCheckedAt: Date.now(),
		});
		return started;
	};

	const closeServer = async () => {
		const current = server;
		server = null;
		if (!current) return;
		await new Promise<void>((resolve) => {
			// close() 会等待既有连接结束；closeAllConnections 强制断开挂死的流式连接
			current.closeAllConnections?.();
			current.close(() => resolve());
		});
	};

	const restart = async (): Promise<void> => {
		if (restartPromise) return restartPromise;
		restartPromise = (async () => {
			setHealth({ restarting: true });
			logger.warn({
				msg: "anthropic proxy 不健康，正在重启",
				failures: health.consecutiveFailures,
			});
			try {
				await closeServer();
				await startServer();
				lastRestartAt = Date.now();
				setHealth({
					restarting: false,
					restartCount: health.restartCount + 1,
				});
				logger.info({
					msg: "anthropic proxy 重启成功",
					port: health.port,
					restartCount: health.restartCount,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				lastRestartAt = Date.now();
				setHealth({
					restarting: false,
					healthy: false,
					lastError: `重启失败：${message}`,
				});
				logger.error({ msg: "anthropic proxy 重启失败", error: message });
			}
		})().finally(() => {
			restartPromise = null;
		});
		return restartPromise;
	};

	const probe = async (): Promise<void> => {
		if (stopped || health.restarting || !health.baseUrl) return;
		try {
			const res = await fetch(`${health.baseUrl}/health`, {
				signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			setHealth({
				healthy: true,
				consecutiveFailures: 0,
				lastError: null,
				lastCheckedAt: Date.now(),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const failures = health.consecutiveFailures + 1;
			setHealth({
				healthy: false,
				consecutiveFailures: failures,
				lastError: message,
				lastCheckedAt: Date.now(),
			});
			logger.warn({
				msg: "anthropic proxy 健康检查失败",
				failures,
				error: message,
			});
			if (
				failures >= FAILURES_BEFORE_RESTART &&
				Date.now() - lastRestartAt >= RESTART_COOLDOWN_MS
			) {
				await restart();
			}
		}
	};

	await startServer();
	const started = { port: health.port, baseUrl: health.baseUrl };

	timer = setInterval(() => void probe(), HEALTH_CHECK_INTERVAL_MS);
	timer.unref?.();

	logger.info({
		msg: "anthropic proxy supervisor started",
		port: started.port,
		intervalMs: HEALTH_CHECK_INTERVAL_MS,
	});

	return {
		getStatus: () => ({ ...health }),
		checkNow: async () => {
			await probe();
			return { ...health };
		},
		restart: async () => {
			await restart();
			return { ...health };
		},
		stop: () => {
			stopped = true;
			if (timer) clearInterval(timer);
			timer = null;
			void closeServer();
		},
	};
}
