import path from "node:path";
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

/**
 * 创建日志实例
 * - 同时输出到控制台和文件
 * - 文件日志按日期轮转,保留 14 天
 * - 包含详细时间戳
 */
export function createLogger(): Logger {
	const logDir = getLogDirectory();

	// 自定义格式:包含时间戳
	const customFormat = winston.format.combine(
		winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
		winston.format.printf(({ timestamp, level, message }) => {
			const msgStr =
				typeof message === "object" ? JSON.stringify(message) : message;
			return `[${timestamp}] [${level.toUpperCase()}] ${msgStr}`;
		}),
	);

	// 日志文件轮转配置
	const fileTransport = new DailyRotateFile({
		dirname: logDir,
		filename: "app-%DATE%.log",
		datePattern: "YYYY-MM-DD",
		maxSize: "20m",
		maxFiles: "14d",
		format: customFormat,
	});

	// Agent SDK 专用日志文件
	const agentLogTransport = new DailyRotateFile({
		dirname: logDir,
		filename: "agent-sdk-%DATE%.log",
		datePattern: "YYYY-MM-DD",
		maxSize: "20m",
		maxFiles: "14d",
		format: customFormat,
	});

	const logger = winston.createLogger({
		level: "info",
		format: winston.format.json(),
		transports: [
			new winston.transports.Console({
				format: winston.format.combine(
					winston.format.timestamp({ format: "HH:mm:ss" }),
					winston.format.json(),
				),
			}),
			fileTransport,
		],
	});

	// 创建专门的 agent logger
	const agentLogger = winston.createLogger({
		level: "debug",
		format: customFormat,
		transports: [agentLogTransport],
	});

	console.log(`[Logger] Log files will be saved to: ${logDir}`);

	return {
		info: (obj) => {
			logger.info(obj);
			// Agent 相关日志同时写入专用文件
			if (
				typeof obj === "object" &&
				obj !== null &&
				"msg" in obj &&
				typeof obj.msg === "string" &&
				(obj.msg.includes("agent") ||
					obj.msg.includes("skill") ||
					obj.msg.includes("anthropic"))
			) {
				agentLogger.info(obj);
			}
		},
		warn: (obj) => {
			logger.warn(obj);
			agentLogger.warn(obj);
		},
		error: (obj) => {
			logger.error(obj);
			agentLogger.error(obj);
		},
	};
}
