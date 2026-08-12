import type {
	FetchUrlPayload,
	ImportLocalFilesPayload,
	Source,
	SourceDetail,
	UploadFilePayload,
} from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function fetchUrlContent(
	payload: FetchUrlPayload,
): Promise<Source> {
	return await safeInvoke("fetch_url_content", { payload });
}

export async function uploadFileContent(
	payload: UploadFilePayload,
): Promise<Source> {
	return await safeInvoke("upload_file_content", { payload });
}

export async function importLocalFiles(
	payload: ImportLocalFilesPayload,
): Promise<SourceDetail[]> {
	return await safeInvoke("import_local_files", { payload });
}
