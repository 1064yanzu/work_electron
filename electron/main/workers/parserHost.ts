/**
 * parser utilityProcess 宿主（主进程单例）。
 *
 * 把 JSDOM/Readability/EPUB 等重 CPU 解析移出主进程主线程：
 * - 懒 fork：首次 dispatch 才启动 dist-electron/parser-worker.js
 * - request/response：自增 id 关联，postMessage structured clone 传输
 * - 超时：kill 子进程，下次请求自动 respawn
 * - 降级：连续 MAX_CONSECUTIVE_FAILURES 次「传输层失败」（超时/进程退出/
 *   postMessage 异常）后永久降级为主进程内联实现，保证功能永不因 worker
 *   挂掉而不可用；worker 内部的业务解析错误（如损坏的 epub）原样抛回，
 *   不计入失败也不重复跑内联。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, utilityProcess, type UtilityProcess } from "electron";

import { createLogger } from "../logging/logger";

// 与 electron/main/index.ts 相同的做法：bundle 为 CJS 后 import.meta.url
// 会被 rollup shim 成 __filename 的 file URL。dev 与生产（asar 内）下
// parser-worker.js 都和主进程入口同级（dist-electron/）。
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;

type WorkerResponse = {
	id: number;
	ok: boolean;
	result?: unknown;
	error?: string;
};

type PendingEntry = {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
	method: string;
};

/** worker 内业务逻辑抛出的错误（非传输层故障），不触发降级计数。 */
class ParserMethodError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ParserMethodError";
	}
}

const logger = createLogger();

let child: UtilityProcess | null = null;
let nextId = 0;
const pending = new Map<number, PendingEntry>();
let consecutiveFailures = 0;
let degraded = false;
let quitHookInstalled = false;

function rejectAllPending(reason: string) {
	for (const [id, entry] of pending) {
		clearTimeout(entry.timer);
		entry.reject(new Error(`PARSER_WORKER_${reason}:${entry.method}`));
		pending.delete(id);
	}
}

function killWorker(reason: string) {
	if (!child) return;
	const proc = child;
	child = null;
	try {
		proc.kill();
	} catch {}
	logger.info({ scope: "parserHost", msg: "parser worker killed", reason });
	rejectAllPending("KILLED");
}

function ensureWorker(): UtilityProcess {
	if (child) return child;

	const workerPath = path.join(__dirname, "parser-worker.js");
	const proc = utilityProcess.fork(workerPath, [], {
		serviceName: "parser-worker",
	});
	child = proc;
	logger.info({
		scope: "parserHost",
		msg: "parser worker spawned",
		workerPath,
	});

	proc.on("message", (raw: unknown) => {
		const msg = raw as WorkerResponse;
		if (!msg || typeof msg.id !== "number") return;
		const entry = pending.get(msg.id);
		if (!entry) return;
		pending.delete(msg.id);
		clearTimeout(entry.timer);
		if (msg.ok) {
			entry.resolve(msg.result);
		} else {
			entry.reject(new ParserMethodError(msg.error || "PARSER_WORKER_ERROR"));
		}
	});

	proc.on("exit", (code) => {
		// 只有当前活跃实例意外退出才清理（kill 主动置 null 后不会走到这）
		if (child === proc) {
			child = null;
			logger.warn({
				scope: "parserHost",
				msg: "parser worker exited unexpectedly",
				code,
			});
			rejectAllPending("EXITED");
		}
	});

	if (!quitHookInstalled) {
		quitHookInstalled = true;
		app.on("will-quit", () => {
			killWorker("app-quit");
		});
	}

	return proc;
}

function requestWorker<T>(
	method: string,
	params: Record<string, unknown>,
	timeoutMs: number,
): Promise<T> {
	const proc = ensureWorker();
	const id = ++nextId;
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			pending.delete(id);
			reject(new Error(`PARSER_WORKER_TIMEOUT:${method}`));
			// 超时视为 worker 卡死：kill 掉，下次请求自动 respawn
			killWorker(`timeout:${method}`);
		}, timeoutMs);

		pending.set(id, {
			resolve: resolve as (value: unknown) => void,
			reject,
			timer,
			method,
		});

		try {
			proc.postMessage({ id, method, params });
		} catch (err) {
			pending.delete(id);
			clearTimeout(timer);
			reject(err instanceof Error ? err : new Error(String(err)));
		}
	});
}

export type ParserDispatchOptions<T> = {
	/** 超时毫秒数，默认 30s；整本解析建议给大值。 */
	timeoutMs?: number;
	/** 主进程内联降级实现（worker 不可用时兜底，功能永不中断）。 */
	inline: () => Promise<T> | T;
};

/**
 * 统一分发入口：优先走 parser worker，传输层失败自动降级内联实现。
 * 业务解析错误（worker 内 throw）原样抛出，与内联实现行为一致。
 */
export async function dispatchParser<T>(
	method: string,
	params: Record<string, unknown>,
	options: ParserDispatchOptions<T>,
): Promise<T> {
	if (degraded) {
		return options.inline();
	}

	try {
		const result = await requestWorker<T>(
			method,
			params,
			options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		);
		consecutiveFailures = 0;
		return result;
	} catch (err) {
		if (err instanceof ParserMethodError) {
			// worker 正常工作，只是这次解析本身失败（如损坏文件）——
			// 内联重跑大概率同样失败，直接抛回调用方
			consecutiveFailures = 0;
			throw new Error(err.message);
		}

		consecutiveFailures += 1;
		logger.warn({
			scope: "parserHost",
			msg: "parser worker request failed, falling back to inline",
			method,
			error: err instanceof Error ? err.message : String(err),
			consecutiveFailures,
		});

		if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
			degraded = true;
			killWorker("degraded");
			logger.warn({
				scope: "parserHost",
				msg: "parser worker degraded permanently, all parsing will run inline in main process",
				failures: consecutiveFailures,
			});
		}

		return options.inline();
	}
}
