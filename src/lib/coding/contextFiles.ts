import { codingWorkspaceStore } from "../stores/codingWorkspaceStore";
import { invoke } from "../tauriCompat";

const MAX_CONTEXT_FILE_SIZE = 200_000;

function getFileName(filePath: string): string {
	return filePath.split(/[\\/]/).pop() || filePath;
}

export async function selectContextFiles(projectPath: string | null): Promise<string[]> {
	if (!projectPath) return [];
	const result = await invoke<{ paths: string[] }>("coding_select_files", {
		project_path: projectPath,
	});
	return Array.isArray(result?.paths) ? result.paths : [];
}

export async function attachContextFiles(paths: string[]): Promise<{
	added: number;
	skipped: number;
}> {
	let added = 0;
	let skipped = 0;

	for (const filePath of paths) {
		if (!filePath) {
			skipped += 1;
			continue;
		}
		if (
			codingWorkspaceStore
				.getState()
				.contextFiles.some((file) => file.path === filePath)
		) {
			skipped += 1;
			continue;
		}
		const result = await invoke<{ content: string; truncated: boolean }>(
			"coding_read_file",
			{
				path: filePath,
				maxSize: MAX_CONTEXT_FILE_SIZE,
			},
		);
		codingWorkspaceStore.addContextFile({
			path: filePath,
			name: getFileName(filePath),
			content: result.content,
		});
		added += 1;
	}

	return { added, skipped };
}

export async function pickAndAttachContextFiles(projectPath: string | null): Promise<{
	added: number;
	skipped: number;
}> {
	const paths = await selectContextFiles(projectPath);
	if (paths.length === 0) {
		return { added: 0, skipped: 0 };
	}
	return attachContextFiles(paths);
}
