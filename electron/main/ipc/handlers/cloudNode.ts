import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import { getCloudNodeClient } from "../../cloud-node/service";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createCloudNodeHandlers() {
	const cloud_node_get_status: Handler<"cloud_node_get_status"> = async () => {
		const client = getCloudNodeClient();
		return {
			config: client.getConfig(),
			status: client.getStatus(),
		};
	};

	const cloud_node_set_config: Handler<"cloud_node_set_config"> = async (
		_event,
		input,
	) => {
		await getCloudNodeClient().setConfig(input.config);
		return { success: true };
	};

	const cloud_node_bind: Handler<"cloud_node_bind"> = async (_event, input) => {
		const result = await getCloudNodeClient().bind(input);
		return {
			success: true,
			node_id: result.node_id,
		};
	};

	const cloud_node_unbind: Handler<"cloud_node_unbind"> = async () => {
		await getCloudNodeClient().unbind();
		return { success: true };
	};

	return {
		cloud_node_get_status,
		cloud_node_set_config,
		cloud_node_bind,
		cloud_node_unbind,
	};
}
