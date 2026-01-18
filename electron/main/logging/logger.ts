import winston from "winston";
import type { Logger } from "./types";

export function createLogger(): Logger {
	const logger = winston.createLogger({
		level: "info",
		format: winston.format.json(),
		transports: [new winston.transports.Console()],
	});

	return {
		info: (obj) => logger.info(obj),
		warn: (obj) => logger.warn(obj),
		error: (obj) => logger.error(obj),
	};
}
