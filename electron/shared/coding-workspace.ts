export type CodingBackendId = "claude-code" | "codex";

export type ClaudeCodeApprovalMode =
	| "default"
	| "acceptEdits"
	| "bypassPermissions"
	| "dontAsk"
	| "plan";

export type CodexApprovalMode =
	| "untrusted"
	| "on-failure"
	| "on-request"
	| "never";

export type CodingApprovalMode = ClaudeCodeApprovalMode | CodexApprovalMode;

export type BackendCapabilityKey =
	| "resume"
	| "rewind"
	| "interactiveApproval"
	| "setModelWhileRunning"
	| "slashCommandSupport"
	| "workspaceMemory"
	| "toolEventGranularity";

export interface BackendCapabilityFlags {
	resume: boolean;
	rewind: boolean;
	interactiveApproval: boolean;
	setModelWhileRunning: boolean;
	slashCommandSupport: boolean;
	workspaceMemory: boolean;
	toolEventGranularity: "none" | "coarse" | "granular";
}

export interface BackendCapabilityMatrix {
	backend: CodingBackendId;
	available: boolean;
	binaryPath: string | null;
	version: string | null;
	detectedAt: number;
	capabilities: BackendCapabilityFlags;
	unsupportedReasons?: Partial<Record<BackendCapabilityKey, string>>;
	defaultModel?: string | null;
	modelCatalog?: string[];
	error?: string;
}

export interface WorkspaceInstructionSource {
	path: string;
	label: string;
	kind:
		| "repo_instruction"
		| "workspace_memory"
		| "workspace_rules"
		| "workspace_context"
		| "backend_context";
	updatedAt?: number;
}

export interface WorkspaceMemoryManifest {
	workspaceFile: string;
	memoryFile: string;
	rulesFile: string;
	commandsDir: string;
	artifactsDir: string;
	profileFile: string;
	sources: WorkspaceInstructionSource[];
}

export interface CodingWorkspaceProfile {
	id: string;
	projectPath: string;
	projectName: string;
	workspaceDir: string;
	hasPersistedProfile: boolean;
	defaultBackend: CodingBackendId;
	defaultModel: string;
	defaultApprovalMode: CodingApprovalMode;
	lastOpenedAt: number;
	updatedAt: number;
	memoryPolicy: "manual" | "always";
	manifest: WorkspaceMemoryManifest;
}

export interface WorkspaceMemoryReadResult {
	profile: CodingWorkspaceProfile;
	workspace: string;
	memory: string;
	rules: string;
	mergedInstructions: string;
	sources: WorkspaceInstructionSource[];
}

export interface WorkspaceProfileUpdateInput {
	projectPath: string;
	defaultBackend?: CodingBackendId;
	defaultModel?: string;
	defaultApprovalMode?: CodingApprovalMode;
	memoryPolicy?: "manual" | "always";
}

export interface WorkspaceMemoryWriteInput {
	projectPath: string;
	target: "workspace" | "memory" | "rules";
	content: string;
}

export type RuntimeControlAction =
	| {
			type: "set_model";
			model: string;
	  }
	| {
			type: "set_approval_mode";
			approvalMode: CodingApprovalMode;
	  }
	| {
			type: "interrupt";
	  }
	| {
			type: "resume";
			sessionId?: string;
	  }
	| {
			type: "rewind";
	  };
