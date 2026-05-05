import { safeInvoke } from "../tauriBridge";

export type CloudNodeRoutingMode = "cloud_only" | "prefer_desktop" | "auto";

export interface CloudNodeConfig {
	enabled: boolean;
	relayUrl: string;
	nodeId?: string;
	nodeToken?: string;
	nodeName: string;
	heartbeatSec: number;
	routingMode: CloudNodeRoutingMode;
}

export interface CloudNodeRuntimeStatus {
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
}

export async function getCloudNodeStatus(): Promise<{
	config: CloudNodeConfig;
	status: CloudNodeRuntimeStatus;
}> {
	return await safeInvoke("cloud_node_get_status");
}

export async function setCloudNodeConfig(config: CloudNodeConfig): Promise<{
	success: boolean;
}> {
	return await safeInvoke("cloud_node_set_config", { config });
}

export async function bindCloudNode(input: {
	relay_url: string;
	email: string;
	password: string;
	node_name?: string;
}): Promise<{ success: boolean; node_id: string }> {
	return await safeInvoke("cloud_node_bind", input);
}

export async function unbindCloudNode(): Promise<{ success: boolean }> {
	return await safeInvoke("cloud_node_unbind");
}
