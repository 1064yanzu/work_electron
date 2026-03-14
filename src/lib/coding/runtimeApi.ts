import type {
	BackendCapabilityMatrix,
	CodingBackendId,
	RuntimeControlAction,
	WorkspaceMemoryReadResult,
	WorkspaceMemoryWriteInput,
	WorkspaceProfileUpdateInput,
	CodingWorkspaceProfile,
} from "../../../electron/shared/coding-workspace";
import type { CliDetectionResult } from "../../../electron/shared/ipc-schema";
import { invoke } from "../tauriCompat";

export async function getWorkspaceProfile(
	projectPath: string,
): Promise<CodingWorkspaceProfile> {
	return invoke("coding_workspace_profile_get", {
		project_path: projectPath,
	});
}

export async function updateWorkspaceProfile(
	input: WorkspaceProfileUpdateInput,
): Promise<CodingWorkspaceProfile> {
	return invoke("coding_workspace_profile_update", { ...input });
}

export async function readWorkspaceMemory(
	projectPath: string,
): Promise<WorkspaceMemoryReadResult> {
	return invoke("coding_workspace_memory_read", {
		project_path: projectPath,
	});
}

export async function writeWorkspaceMemory(
	input: WorkspaceMemoryWriteInput,
): Promise<WorkspaceMemoryReadResult> {
	return invoke("coding_workspace_memory_write", { ...input });
}

export async function getCodingBackendCapabilities(
	backend?: CodingBackendId,
): Promise<
	BackendCapabilityMatrix | Record<CodingBackendId, BackendCapabilityMatrix>
> {
	return invoke("coding_backend_capabilities_get", backend ? { backend } : {});
}

export async function getCodexCapabilities(): Promise<BackendCapabilityMatrix> {
	return invoke("codex_get_capabilities", {});
}

export async function controlCodexRuntime(input: {
	runId: string;
	action: RuntimeControlAction;
}): Promise<{ success: boolean; error?: string }> {
	return invoke("codex_runtime_control", input);
}

// ─── CLI Binary Detection ─────────────────────────────────────

export async function detectCliBinary(
	backend: "claude-code" | "codex",
	userConfiguredPath?: string,
): Promise<CliDetectionResult> {
	return invoke("cli_detect_binary", { backend, userConfiguredPath });
}

export async function invalidateCliCache(
	backend?: "claude-code" | "codex",
): Promise<{ success: boolean }> {
	return invoke("cli_invalidate_cache", { backend });
}

// ─── Claude Code Auth ──────────────────────────────────────────

export async function getClaudeCodeAuthStatus(): Promise<{
	isLoggedIn: boolean;
	authMethod: "oauth" | "api_key" | "env_key" | "none";
	email?: string;
	model?: string;
	mcpServers?: Array<{
		name: string;
		command?: string;
		url?: string;
		type?: string;
	}>;
}> {
	return invoke("claude_code_auth_status", {});
}

// ─── User CLI Config Sync ──────────────────────────────────────

export interface UserCliConfig {
	claude?: {
		model?: string;
		mcpServers?: Array<{
			name: string;
			command?: string;
			url?: string;
			type?: string;
		}>;
		permissions?: string[];
	};
	codex?: {
		model?: string;
		provider?: string;
	};
}

export async function readUserCliConfig(): Promise<UserCliConfig> {
	return invoke("coding_read_user_cli_config", {});
}
