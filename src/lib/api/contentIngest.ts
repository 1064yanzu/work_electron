import type {
	FetchUrlPayload,
	ImportLocalFilesPayload,
	Source,
	SourceDetail,
	UploadFilePayload,
	Uuid,
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

export interface ParseHtmlPayload {
	url: string;
	html: string;
	title?: string;
	tags?: string[];
	project_id?: Uuid;
}

export async function parseHtmlContent(
	payload: ParseHtmlPayload,
): Promise<Source> {
	return await safeInvoke("parse_html_content", { payload });
}
