import type { BackendCapabilityMatrix, CodingWorkspaceProfile } from "../../../electron/shared/coding-workspace";
import { codingThreadStore } from "../stores/codingThreadStore";
import { getCodingBackendCapabilities, getWorkspaceProfile, updateWorkspaceProfile } from "./runtimeApi";
import { getAICodingSettings } from "./codingSettings";

async function getProfileAndCapability(
	projectPath: string,
): Promise<{ profile: CodingWorkspaceProfile; capability: BackendCapabilityMatrix | null }> {
	const profile = await getWorkspaceProfile(projectPath);
	let capability: BackendCapabilityMatrix | null = null;
	try {
		capability = (await getCodingBackendCapabilities(profile.defaultBackend)) as BackendCapabilityMatrix;
	} catch {
		capability = null;
	}
	return { profile, capability };
}

export async function createThreadFromWorkspaceProfile(projectPath: string) {
	let { profile, capability } = await getProfileAndCapability(projectPath);
	if (!profile.hasPersistedProfile) {
		const settings = await getAICodingSettings();
		const defaultBackend = settings.defaultBackend;
		const defaultModel =
			defaultBackend === "codex"
				? settings.codexDefaultModel
				: settings.claudeDefaultModel;
		const defaultApprovalMode =
			defaultBackend === "codex"
				? settings.codexDefaultApprovalMode
				: settings.claudeDefaultApprovalMode;
		profile = await updateWorkspaceProfile({
			projectPath,
			defaultBackend,
			defaultModel,
			defaultApprovalMode,
			memoryPolicy: settings.workspaceMemoryPolicy,
		});
		capability = (await getCodingBackendCapabilities(defaultBackend)) as BackendCapabilityMatrix;
	}
	return codingThreadStore.createThread(projectPath, {
		backend: profile.defaultBackend,
		title: profile.projectName,
		model: profile.defaultModel,
		approvalMode: profile.defaultApprovalMode,
		workspaceProfileId: profile.id,
		capabilitiesSnapshot: capability ?? undefined,
	});
}

export async function syncThreadWorkspaceProfile(threadId: string, projectPath: string) {
	const { profile, capability } = await getProfileAndCapability(projectPath);
	codingThreadStore.updateThread(threadId, {
		backend: profile.defaultBackend,
		model: profile.defaultModel,
		approvalMode: profile.defaultApprovalMode,
		workspaceProfileId: profile.id,
		capabilitiesSnapshot: capability ?? undefined,
	});
	return { profile, capability };
}
