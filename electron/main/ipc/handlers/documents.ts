import fs from "node:fs/promises";
import type { IpcMainInvokeEvent } from "electron";

import type { IPCSchema } from "../../../shared/ipc-schema";
import { requireAbsoluteLocalPath } from "../../utils/localPaths";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createDocumentHandlers() {
	return {
		convert_docx_to_html: (async (_event, input) => {
			const filePath = requireAbsoluteLocalPath(input.path);
			const st = await fs.stat(filePath);
			if (!st.isFile()) throw new Error("NOT_A_FILE");

			// 懒加载 mammoth，避免主进程启动时占用内存
			const mammoth = await import("mammoth");
			const result = await mammoth.default.convertToHtml({ path: filePath });
			return { html: result.value || "" };
		}) satisfies Handler<"convert_docx_to_html">,
	};
}
