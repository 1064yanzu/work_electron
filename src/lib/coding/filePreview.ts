import { inferLanguage } from "../utils/diffUtils";
import { codingWorkspaceStore } from "../stores/codingWorkspaceStore";
import { invoke } from "../tauriCompat";

export interface CodingFilePreviewResult {
	path: string;
	content: string;
	truncated: boolean;
	language: string;
}

export async function readCodingFilePreview(
	filePath: string,
): Promise<CodingFilePreviewResult> {
	const result = await invoke<{ content: string; truncated: boolean }>(
		"coding_read_file",
		{
			path: filePath,
		},
	);
	return {
		path: filePath,
		content: result.content,
		truncated: result.truncated,
		language: inferLanguage(filePath),
	};
}

export async function openCodingFilePreview(filePath: string): Promise<void> {
	codingWorkspaceStore.setSelectedFile(filePath);
	// 在中间面板打开文件 Tab（代码查看器）
	codingWorkspaceStore.openCenterTab(filePath);
	try {
		const result = await readCodingFilePreview(filePath);
		codingWorkspaceStore.setSelectedFilePreview({
			path: result.path,
			content: result.content,
			truncated: result.truncated,
		});
	} catch (error) {
		codingWorkspaceStore.setSelectedFilePreviewError(
			filePath,
			error instanceof Error ? error.message : String(error),
		);
	}
}
