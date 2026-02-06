/**
 * 图像生成 IPC Handlers
 */
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import {
	generateImage,
	getImageGenConfig,
	saveImageGenConfig,
} from "../../services/imageGeneration";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createImageGenHandlers(db: DbContext) {
	const get_image_gen_config: Handler<"get_image_gen_config"> = async () => {
		return await getImageGenConfig(db);
	};

	const set_image_gen_config: Handler<"set_image_gen_config"> = async (
		_event,
		input,
	) => {
		await saveImageGenConfig(db, input);
		return { success: true };
	};

	const generate_image_for_text: Handler<"generate_image_for_text"> = async (
		_event,
		input,
	) => {
		return await generateImage(db, {
			text: input.text,
			overrides: input.overrides,
		});
	};

	return {
		get_image_gen_config,
		set_image_gen_config,
		generate_image_for_text,
	};
}
