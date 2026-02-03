import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import {
	ingestUploadedFileContent,
	ingestUrlContent,
	importLocalFilesToSources,
} from "../../services/contentIngest";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createContentIngestHandlers(db: DbContext) {
	return {
		fetch_url_content: (async (_event, input) => {
			const { source } = await ingestUrlContent(db, input);
			return source;
		}) satisfies Handler<"fetch_url_content">,

		upload_file_content: (async (_event, input) => {
			const { source } = await ingestUploadedFileContent(db, input);
			return source;
		}) satisfies Handler<"upload_file_content">,

		import_local_files: (async (_event, input) => {
			const results = await importLocalFilesToSources(db, input);
			return results;
		}) satisfies Handler<"import_local_files">,
	};
}
