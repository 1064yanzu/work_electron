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
			console.log(
				`[wiki_generate] Starting generation for scope: ${input.scope_path}`,
			);
			const pageIds = await generateWikiFromSources(
				db,
				input.scope_path,
				mainWindowRef.current,
				input.model,
			);
			console.log(
				`[wiki_generate] Completed. Generated ${pageIds.length} pages`,
			);
			return {
				success: pageIds.length > 0,
				generated_pages: pageIds.length,
			};
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			console.error("[wiki_generate] Generation failed:", errMsg);
			// 也通过进度事件通知前端
			const { setGenerationStatus, getGenerationStatus: getStatus } =
				await import("../../kb/wikiGeneration");
			setGenerationStatus({
				is_generating: false,
				error: `生成失败: ${errMsg}`,
			});
			mainWindowRef.current?.webContents.send(
				"wiki_generation_progress",
				getStatus(),
			);
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
