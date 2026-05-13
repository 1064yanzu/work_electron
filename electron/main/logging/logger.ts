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

function redactSecrets(value: unknown, keyHint?: string): unknown {
	if (keyHint && SENSITIVE_KEY_RE.test(keyHint)) {
		if (typeof value === "string" && value.trim().length > 0) return "***";
		return "***";
	}

	if (Array.isArray(value)) {
		return value.map((v) => redactSecrets(v));
	}

	if (value && typeof value === "object") {
		if (!isPlainObject(value)) return value;
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = redactSecrets(v, k);
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
 */
export function createLogger(): Logger {
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
	const fileLevel = normalizeLogLevel(process.env.LOG_FILE_LEVEL, "debug");

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
