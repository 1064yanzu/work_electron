// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：artifacts（共 10 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	ArtifactCleanupResult,
	ArtifactMetadata,
	ArtifactSettings,
	Source,
} from "./common";

export interface ArtifactsIpcSchema {
	// ==================
	// Agent 产物命令
	// ==================
	artifact_save: {
		input: {
			session_id: string;
			file_name: string;
			content: string;
			encoding?: "utf-8" | "base64";
			tool_call_id?: string;
			description?: string;
		};
		output: ArtifactMetadata;
	};
	artifact_list: {
		input: { session_id?: string; limit?: number };
		output: ArtifactMetadata[];
	};
	artifact_get: {
		input: { id: string };
		output: ArtifactMetadata | null;
	};
	artifact_delete: {
		input: { id: string };
		output: { success: boolean };
	};
	artifact_reveal: {
		input: { id: string };
		output: { success: boolean };
	};
	artifact_download: {
		input: { id: string; dest_path?: string };
		output: { path: string };
	};
	artifact_import_to_library: {
		input: { id: string; folder_id?: string };
		output: Source;
	};
	artifact_cleanup: {
		input: { force?: boolean };
		output: ArtifactCleanupResult;
	};
	artifact_get_settings: {
		input: Record<string, never>;
		output: ArtifactSettings;
	};
	artifact_update_settings: {
		input: Partial<ArtifactSettings>;
		output: ArtifactSettings;
	};
}
