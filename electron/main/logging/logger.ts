import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import type { Logger } from "./types";

/**
 * 获取日志目录路径
 * 开发模式: 项目根目录/logs
 * 生产模式: userData/logs
 */
function getLogDirectory(): string {
	if (app.isPackaged) {
		const userDataPath = app.getPath("userData");
		return path.join(userDataPath, "logs");
	}
	return path.join(process.cwd(), "logs");
}

type LogLevel = "error" | "warn" | "info" | "debug";

function normalizeLogLevel(level: unknown, fallback: LogLevel): LogLevel {
	if (typeof level !== "string") return fallback;
	const v = level.trim().toLowerCase();
	if (v === "error" || v === "warn" || v === "info" || v === "debug") return v;
	return fallback;
}

function truncateText(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return `${text.slice(0, maxLen)}…(truncated ${text.length - maxLen} chars)`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object") return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

function getStructuredLogPayload(
	info: Record<string, unknown>,
): Record<string, unknown> {
	if (isPlainObject(info.message)) {
		return info.message as Record<string, unknown>;
	}
	return info;
}

const SENSITIVE_KEY_RE =
	/(^|[_-])(api[_-]?key|token|authorization|cookie|password|secret)([_-]|$)/i;

// 深递归脱敏的成本上限：超深对象直接截断、超长字符串截断，
// 避免每条日志都为巨型负载付出全量遍历/拷贝代价。
const REDACT_MAX_DEPTH = 8;
const REDACT_MAX_STRING = 65536;

function redactSecrets(value: unknown, keyHint?: string, depth = 0): unknown {
	if (keyHint && SENSITIVE_KEY_RE.test(keyHint)) {
		if (typeof value === "string" && value.trim().length > 0) return "***";
		return "***";
	}

	if (typeof value === "string") {
		return truncateText(value, REDACT_MAX_STRING);
	}

	if (Array.isArray(value)) {
		if (depth >= REDACT_MAX_DEPTH) return `[array(${value.length})]`;
		return value.map((v) => redactSecrets(v, undefined, depth + 1));
	}

	if (value && typeof value === "object") {
		if (!isPlainObject(value)) return value;
		if (depth >= REDACT_MAX_DEPTH) return "[object: max depth]";
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = redactSecrets(v, k, depth + 1);
		}
		return out;
	}

	return value;
}

function toConsoleSummary(info: Record<string, unknown>): string {
	const payload = getStructuredLogPayload(info);
	const msg =
		typeof payload.msg === "string"
			? payload.msg
			: typeof info.message === "string"
				? info.message
				: "";

	const pickedKeys = [
		"event",
		"model",
		"runId",
		"tool",
		"toolName",
		"status",
		"code",
		"filePath",
	] as const;

	const parts: string[] = [];
	for (const k of pickedKeys) {
		const v = payload[k];
		if (v === undefined || v === null) continue;
		if (typeof v === "string") {
			parts.push(`${k}=${truncateText(v, 120)}`);
			continue;
		}
		if (typeof v === "number" || typeof v === "boolean") {
			parts.push(`${k}=${String(v)}`);
			continue;
		}
		if (Array.isArray(v)) {
			parts.push(`${k}=[${v.length}]`);
			continue;
		}
		if (typeof v === "object") {
			parts.push(`${k}={...}`);
		}
	}

	if (typeof payload.error === "string" && payload.error.trim()) {
		parts.push(`error=${truncateText(payload.error, 180)}`);
	}
	if (typeof payload.data === "string" && payload.data.trim()) {
		parts.push(`data=${truncateText(payload.data, 180)}`);
	}

	return parts.length > 0 ? `${msg} (${parts.join(" ")})` : msg;
}

function isAgentRelated(obj: Record<string, unknown>): boolean {
	const scope =
		typeof obj.scope === "string"
			? obj.scope
			: typeof obj.category === "string"
				? obj.category
				: "";
	if (scope.toLowerCase().includes("agent")) return true;

	const msg = typeof obj.msg === "string" ? obj.msg : "";
	return (
		msg.includes("agent") || msg.includes("skill") || msg.includes("anthropic")
	);
}

function isHttpRelated(obj: Record<string, unknown>): boolean {
	const scope =
		typeof obj.scope === "string"
			? obj.scope
			: typeof obj.category === "string"
				? obj.category
				: "";
	if (scope.toLowerCase().includes("http")) return true;

	const event = typeof obj.event === "string" ? obj.event : "";
	if (event.toLowerCase().startsWith("http_")) return true;

	const msg = typeof obj.msg === "string" ? obj.msg : "";
	return msg.toLowerCase().includes("http");
}

/**
 * 创建日志实例
 * - 同时输出到控制台和文件
 * - 文件日志按日期轮转,保留 14 天
 * - 包含详细时间戳
 * - 全局单例：多处调用共享同一组 winston transport，
 *   避免同一日志文件被重复打开多份句柄
 */
let cachedLogger: Logger | null = null;

// setFileLogLevel 运行时调级所需的实例引用（单例创建时填充）
let fileTransportsRef: DailyRotateFile[] = [];
let appLoggerRef: winston.Logger | null = null;
let fileOnlyLoggersRef: winston.Logger[] = [];
let consoleLevelRef: LogLevel = "info";

const LEVEL_VERBOSITY: Record<LogLevel, number> = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 5,
};

function moreVerbose(a: LogLevel, b: LogLevel): LogLevel {
	return LEVEL_VERBOSITY[a] >= LEVEL_VERBOSITY[b] ? a : b;
}

/**
 * 运行时调整文件日志级别（设置面板 → 立即生效，无需重启）。
 * 控制台级别不受影响。返回归一化后的实际生效级别。
 */
export function setFileLogLevel(level: unknown): LogLevel {
	const next = normalizeLogLevel(level, "info");
	for (const t of fileTransportsRef) t.level = next;
	// winston logger 自身的 level 是所有 transport 的总闸，
	// 需放宽到「控制台与文件中更详细的一档」，再由各 transport 自己过滤。
	if (appLoggerRef) appLoggerRef.level = moreVerbose(consoleLevelRef, next);
	for (const l of fileOnlyLoggersRef) l.level = next;
	return next;
}

export function createLogger(): Logger {
	if (cachedLogger) return cachedLogger;
	cachedLogger = createLoggerInstance();
	return cachedLogger;
}

function createLoggerInstance(): Logger {
	const logDir = getLogDirectory();
	try {
		fs.mkdirSync(logDir, { recursive: true });
	} catch {}

	const hourlyDirPattern = path.join(logDir, "%DATE%");
	// 使用单级目录命名 `YYYY-MM-DD-HH`，避免 datePattern 里出现 `/`。
	// 原因：file-stream-rotator@0.6.1 的 mkDirForFile 不递归 mkdir，且在 Windows
	// 上按 path.sep(`\`) 拆路径，无法处理含 `/` 的 %DATE%，会触发 ENOENT。
	const hourlyDatePattern = "YYYY-MM-DD-HH";

	const consoleLevel = normalizeLogLevel(
		process.env.LOG_CONSOLE_LEVEL,
		app.isPackaged ? "info" : "warn",
	);
	// 生产默认 info（debug 级全量落盘代价过高），开发保持 debug；
	// LOG_FILE_LEVEL 环境变量始终可覆盖。
	const fileLevel = normalizeLogLevel(
		process.env.LOG_FILE_LEVEL,
		app.isPackaged ? "info" : "debug",
	);

	const sanitizeFormat = winston.format((info) => {
		const sanitized = redactSecrets(info) as Record<string, unknown>;
		return sanitized as any;
	});

	const fileFormat = winston.format.combine(
		winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
		winston.format.errors({ stack: true }),
		sanitizeFormat(),
		winston.format.json(),
	);

	const consoleFormat = winston.format.combine(
		winston.format.timestamp({ format: "HH:mm:ss" }),
		winston.format.errors({ stack: true }),
		sanitizeFormat(),
		winston.format.printf((info) => {
			const level = String(info.level ?? "").toUpperCase();
			const ts = String((info as any).timestamp ?? "");
			const summary = toConsoleSummary(info as any);
			const line = summary ? truncateText(summary, 360) : "";
			return `[${ts}] [${level}] ${line}`;
		}),
	);

	// 日志文件轮转配置
	const fileTransport = new DailyRotateFile({
		dirname: hourlyDirPattern,
		filename: "app.log",
		datePattern: hourlyDatePattern,
		maxSize: "20m",
		maxFiles: "14d",
		level: fileLevel,
		format: fileFormat,
		auditFile: path.join(logDir, ".app-audit.json"),
	});

	// Agent SDK 专用日志文件
	const agentLogTransport = new DailyRotateFile({
		dirname: hourlyDirPattern,
		filename: "agent-sdk.log",
		datePattern: hourlyDatePattern,
		maxSize: "20m",
		maxFiles: "14d",
		level: fileLevel,
		format: fileFormat,
		auditFile: path.join(logDir, ".agent-sdk-audit.json"),
	});

	// HTTP 请求专用日志文件
	const httpLogTransport = new DailyRotateFile({
		dirname: hourlyDirPattern,
		filename: "http.log",
		datePattern: hourlyDatePattern,
		maxSize: "50m",
		maxFiles: "14d",
		level: fileLevel,
		format: fileFormat,
		auditFile: path.join(logDir, ".http-audit.json"),
	});

	const appLogger = winston.createLogger({
		level: fileLevel,
		transports: [
			new winston.transports.Console({
				level: consoleLevel,
				format: consoleFormat,
			}),
			fileTransport,
		],
	});

	// 创建专门的 agent logger
	const agentLogger = winston.createLogger({
		level: fileLevel,
		transports: [agentLogTransport],
	});

	const httpLogger = winston.createLogger({
		level: fileLevel,
		transports: [httpLogTransport],
	});

	// 填充运行时调级引用（setFileLogLevel 用）
	fileTransportsRef = [fileTransport, agentLogTransport, httpLogTransport];
	appLoggerRef = appLogger;
	fileOnlyLoggersRef = [agentLogger, httpLogger];
	consoleLevelRef = consoleLevel;

	return {
		info: (obj) => {
			if (isAgentRelated(obj)) {
				agentLogger.info({ ...obj, scope: obj.scope ?? "agent" });
				return;
			}
			if (isHttpRelated(obj)) {
				httpLogger.info({ ...obj, scope: obj.scope ?? "http" });
				return;
			}
			appLogger.info(obj);
		},
		warn: (obj) => {
			appLogger.warn(obj);
			if (isAgentRelated(obj)) {
				agentLogger.warn({ ...obj, scope: obj.scope ?? "agent" });
			}
			if (isHttpRelated(obj)) {
				httpLogger.warn({ ...obj, scope: obj.scope ?? "http" });
			}
		},
		error: (obj) => {
			appLogger.error(obj);
			if (isAgentRelated(obj)) {
				agentLogger.error({ ...obj, scope: obj.scope ?? "agent" });
			}
			if (isHttpRelated(obj)) {
				httpLogger.error({ ...obj, scope: obj.scope ?? "http" });
			}
		},
	};
}
