import type { SandboxFile } from "../../../lib/managedModeStore";

export type ManagedPreviewKind = "preview" | "source";

export interface ArtifactPreviewState {
	mode: ManagedPreviewKind;
	lastError?: string | null;
}

export interface ArtifactFileRef {
	id: string;
	title: string;
	path: string;
	file: SandboxFile | null;
}
