export type CloudExecutionTarget = "cloud" | "desktop";

export type CloudNodeRoutingMode = "cloud_only" | "prefer_desktop" | "auto";

export type AppErrorCode =
	| "DESKTOP_REQUIRED_ONLINE"
	| "CAPABILITY_NOT_AVAILABLE"
	| "VALIDATION_FAILED"
	| "TASK_TIMEOUT"
	| "NOT_FOUND";

export type CloudNodeConfig = {
	enabled: boolean;
	relayUrl: string;
	nodeId?: string;
	nodeToken?: string;
	nodeName: string;
	heartbeatSec: number;
	routingMode: CloudNodeRoutingMode;
};

export type CloudNodeRuntimeStatus = {
	enabled: boolean;
	configured: boolean;
	connected: boolean;
	relayUrl: string;
	nodeId?: string;
	nodeName: string;
	heartbeatSec: number;
	routingMode: CloudNodeRoutingMode;
	pendingRuns: number;
	lastConnectedAt?: number;
	lastHeartbeatAt?: number;
	lastError?: string;
};

export type CloudNodeBindInput = {
	relay_url: string;
	email: string;
	password: string;
	node_name?: string;
};

export type CloudNodeBindResult = {
	node_id: string;
	node_token: string;
};

export type CloudNodeIncomingMessage =
	| {
			type: "ping";
			ts?: number;
	  }
	| {
			type: "node.run.start";
			request_id: string;
			session_id: string;
			payload: {
				prompt: string;
				model?: string;
				cwd?: string;
				routing_mode?: CloudNodeRoutingMode;
			};
	  }
	| {
			type: "node.run.abort";
			request_id: string;
			run_id: string;
	  }
	| {
			type: "node.interaction.resolve";
			request_id: string;
			run_id: string;
			interaction_request_id: string;
			decision: {
				behavior: "allow" | "deny";
				message?: string;
				interrupt?: boolean;
			};
	  }
	| {
			type: "node.config.apply";
			request_id: string;
			job_id: string;
			payload: {
				scope: string;
				data: Record<string, unknown>;
			};
	  }
	| {
			type: "node.backup.start";
			request_id: string;
			job_id: string;
			payload: {
				provider: "cloud";
				mode: "backup";
			};
	  }
	| {
			type: "node.backup.restore";
			request_id: string;
			job_id: string;
			payload: {
				provider: "cloud";
				backup_id?: string;
				mode: "restore";
			};
	  }
	| {
			type: "node.migration.pull";
			request_id: string;
			job_id: string;
			migration_id: string;
			payload: {
				scope: "session" | "resource";
				session_id?: string;
			};
	  };
