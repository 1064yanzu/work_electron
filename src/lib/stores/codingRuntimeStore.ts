import { useSyncExternalStore } from "react";
import type {
	BackendCapabilityMatrix,
	CodingBackendId,
	WorkspaceMemoryReadResult,
	CodingWorkspaceProfile,
} from "../../../electron/shared/coding-workspace";
import {
	getCodingBackendCapabilities,
	readWorkspaceMemory,
	updateWorkspaceProfile,
	writeWorkspaceMemory,
} from "../coding/runtimeApi";
import { getAICodingSettings } from "../coding/codingSettings";

interface CodingRuntimeState {
	profile: CodingWorkspaceProfile | null;
	workspaceMemory: WorkspaceMemoryReadResult | null;
	capabilities: Record<CodingBackendId, BackendCapabilityMatrix | null>;
	loading: boolean;
	error: string | null;
}

const initialState: CodingRuntimeState = {
	profile: null,
	workspaceMemory: null,
	capabilities: {
		"claude-code": null,
		codex: null,
	},
	loading: false,
	error: null,
};

class CodingRuntimeStore {
	private state: CodingRuntimeState = initialState;
	private listeners = new Set<() => void>();

	getState = () => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit() {
		for (const listener of this.listeners) listener();
	}

	private setState(next: Partial<CodingRuntimeState>) {
		this.state = {
			...this.state,
			...next,
		};
		this.emit();
	}

	private async mergeCapabilities(
		capabilities: Record<CodingBackendId, BackendCapabilityMatrix>,
	): Promise<Record<CodingBackendId, BackendCapabilityMatrix>> {
		const settings = await getAICodingSettings();
		return {
			"claude-code": {
				...capabilities["claude-code"],
				defaultModel: settings.claudeDefaultModel,
			},
			codex: {
				...capabilities.codex,
				defaultModel: settings.codexDefaultModel,
				modelCatalog: settings.codexModelCatalog,
			},
		};
	}

	async loadProject(projectPath: string): Promise<void> {
		this.setState({ loading: true, error: null });
		try {
			const [workspaceMemory, capabilities] = await Promise.all([
				readWorkspaceMemory(projectPath),
				getCodingBackendCapabilities() as Promise<
					Record<CodingBackendId, BackendCapabilityMatrix>
				>,
			]);
			const mergedCapabilities = await this.mergeCapabilities(capabilities);
			this.setState({
				profile: workspaceMemory.profile,
				workspaceMemory,
				capabilities: mergedCapabilities,
				loading: false,
			});
		} catch (error) {
			this.setState({
				loading: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async refreshCapabilities(backend?: CodingBackendId): Promise<void> {
		try {
			if (backend) {
				const capability = (await getCodingBackendCapabilities(
					backend,
				)) as BackendCapabilityMatrix;
				const merged = await this.mergeCapabilities({
					...this.state.capabilities,
					[backend]: capability,
				} as Record<CodingBackendId, BackendCapabilityMatrix>);
				this.setState({
					capabilities: merged,
				});
				return;
			}
			const capabilityMap = (await getCodingBackendCapabilities()) as Record<
				CodingBackendId,
				BackendCapabilityMatrix
			>;
			this.setState({
				capabilities: await this.mergeCapabilities(capabilityMap),
			});
		} catch (error) {
			this.setState({
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async updateProfileDefaults(input: {
		projectPath: string;
		defaultBackend?: CodingBackendId;
		defaultModel?: string;
		defaultApprovalMode?: string;
	}): Promise<void> {
		const profile = await updateWorkspaceProfile({
			projectPath: input.projectPath,
			defaultBackend: input.defaultBackend,
			defaultModel: input.defaultModel,
			defaultApprovalMode: input.defaultApprovalMode as never,
		});
		this.setState({
			profile,
			workspaceMemory: this.state.workspaceMemory
				? {
						...this.state.workspaceMemory,
						profile,
					}
				: null,
		});
	}

	async saveWorkspaceMemory(input: {
		projectPath: string;
		target: "workspace" | "memory" | "rules";
		content: string;
	}): Promise<void> {
		const workspaceMemory = await writeWorkspaceMemory(input);
		this.setState({
			profile: workspaceMemory.profile,
			workspaceMemory,
		});
	}

	clear() {
		this.state = initialState;
		this.emit();
	}
}

export const codingRuntimeStore = new CodingRuntimeStore();

export function useCodingRuntimeSelector<T>(
	selector: (state: CodingRuntimeState) => T,
): T {
	return useSyncExternalStore(
		codingRuntimeStore.subscribe,
		() => selector(codingRuntimeStore.getState()),
		() => selector(codingRuntimeStore.getState()),
	);
}
