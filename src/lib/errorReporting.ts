/**
 * 渲染端全局错误收口
 *
 * 生产构建剥离了 console.log/info/debug，但 console.warn/error 仍保留。
 * 同时挂全局 error + unhandledrejection 监听，通过 IPC 推送给主进程 winston，
 * 让生产环境也能在 userData/logs/ 下查阅渲染层异常。
 *
 * 节流：相同 message + stack 5 秒内只上报一次，避免循环报错刷爆日志。
 */
import { invoke } from "./tauriCompat";

const RECENT_CACHE_MS = 5000;
const recentSignatures = new Map<string, number>();

function isDuplicate(signature: string): boolean {
	const now = Date.now();
	const prev = recentSignatures.get(signature);
	if (prev && now - prev < RECENT_CACHE_MS) return true;
	recentSignatures.set(signature, now);
	// 简单清理：超过 200 条时丢一半旧条目
	if (recentSignatures.size > 200) {
		const sorted = [...recentSignatures.entries()].sort((a, b) => a[1] - b[1]);
		for (let i = 0; i < 100; i++) recentSignatures.delete(sorted[i][0]);
	}
	return false;
}

function send(payload: {
	level: "warn" | "error";
	message: string;
	source?: string;
	stack?: string;
	location?: { url?: string; line?: number; column?: number };
}): void {
	const signature = `${payload.level}:${payload.message}:${payload.stack ?? ""}`;
	if (isDuplicate(signature)) return;
	void invoke("log_renderer_event", payload).catch(() => {
		// 主进程不可达不抛出（启动时序、退出阶段都可能）
	});
}

export function installRendererErrorReporting(): void {
	if (typeof window === "undefined") return;

	window.addEventListener("error", (event) => {
		const error = event.error;
		const message =
			(error instanceof Error ? error.message : null) ||
			event.message ||
			"window.error";
		send({
			level: "error",
			message,
			source: "window.error",
			stack: error instanceof Error ? error.stack : undefined,
			location: {
				url: event.filename,
				line: event.lineno,
				column: event.colno,
			},
		});
	});

	window.addEventListener("unhandledrejection", (event) => {
		const reason = event.reason;
		const message =
			(reason instanceof Error ? reason.message : null) ||
			(typeof reason === "string" ? reason : "unhandled promise rejection");
		send({
			level: "error",
			message,
			source: "unhandledrejection",
			stack: reason instanceof Error ? reason.stack : undefined,
		});
	});
}
