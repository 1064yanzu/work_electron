import os from "node:os";
import type { CloudNodeConfig } from "./types";

export const CLOUD_NODE_CONFIG_KEY = "cloud.node.config";

export const DEFAULT_CLOUD_NODE_CONFIG: CloudNodeConfig = {
	enabled: false,
	relayUrl: "http://127.0.0.1:39090",
	nodeId: "",
	nodeToken: "",
	nodeName: os.hostname() || "desktop-node",
	heartbeatSec: 20,
	routingMode: "auto",
};
