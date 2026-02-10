import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import { RemoteControlOrchestrator } from "./orchestrator";

let orchestrator: RemoteControlOrchestrator | null = null;

export function initRemoteControlOrchestrator(input: {
	db: DbContext;
	logger: Logger;
}): RemoteControlOrchestrator {
	if (!orchestrator) {
		orchestrator = new RemoteControlOrchestrator(input.db, input.logger);
	}
	return orchestrator;
}

export function getRemoteControlOrchestrator(): RemoteControlOrchestrator {
	if (!orchestrator) {
		throw new Error("RemoteControlOrchestrator not initialized");
	}
	return orchestrator;
}
