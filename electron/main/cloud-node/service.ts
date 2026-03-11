import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import { CloudNodeClient } from "./client";

let cloudNodeClient: CloudNodeClient | null = null;

export function initCloudNodeClient(input: {
	db: DbContext;
	logger: Logger;
}): CloudNodeClient {
	if (!cloudNodeClient) {
		cloudNodeClient = new CloudNodeClient(input.db, input.logger);
	}
	return cloudNodeClient;
}

export function getCloudNodeClient(): CloudNodeClient {
	if (!cloudNodeClient) {
		throw new Error("CloudNodeClient not initialized");
	}
	return cloudNodeClient;
}
