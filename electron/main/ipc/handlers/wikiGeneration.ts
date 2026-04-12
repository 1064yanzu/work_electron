/**
 * Wiki AI 生成 IPC Handlers
 */
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import {
	generateWikiFromSources,
	getGenerationStatus,
} from "../../kb/wikiGeneration";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createWikiGenerationHandlers(
	db: DbContext,
	mainWindowRef: { current: BrowserWindow | null },
) {
	const wiki_generate: Handler<"wiki_generate"> = async (_event, input) => {
		try {
			const pageIds = await generateWikiFromSources(
				db,
				input.scope_path,
				mainWindowRef.current,
				input.model,
			);
			return {
				success: true,
				generated_pages: pageIds.length,
			};
		} catch (err) {
			console.error("[wiki_generate] Generation failed:", err);
			return {
				success: false,
				generated_pages: 0,
			};
		}
	};

	const wiki_generation_status: Handler<
		"wiki_generation_status"
	> = async () => {
		return getGenerationStatus();
	};

	return {
		wiki_generate,
		wiki_generation_status,
	};
}
