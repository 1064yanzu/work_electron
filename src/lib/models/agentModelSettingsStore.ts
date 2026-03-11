/**
 * Agent Model Settings Store
 * 管理用户的Agent模型场景配置
 * 使用与chatSettingsStore相同的模式
 */
import { useEffect, useState } from "react";
import { getConfig, setConfig } from "../config";
import {
	type AgentModelSettings,
	type AgentScenario,
	type ScenarioModelConfig,
	DEFAULT_AGENT_MODEL_SETTINGS,
	getModelForScenario,
	inferScenarioFromTask,
} from "../models/agentModelConfig";

const CONFIG_KEY = "agent.model_settings";

const listeners = new Set<() => void>();

const emitChange = () => {
	listeners.forEach((l) => l());
};

let state: AgentModelSettings = { ...DEFAULT_AGENT_MODEL_SETTINGS };
let isInitialized = false;
let initPromise: Promise<void> | null = null;

export const agentModelSettingsStore = {
	async init(): Promise<void> {
		if (isInitialized) return;
		if (initPromise) return initPromise;

		initPromise = (async () => {
			try {
				const raw = await getConfig(CONFIG_KEY);
				let parsed: Partial<AgentModelSettings> = {};

				if (typeof raw === "string") {
					try {
						parsed = JSON.parse(raw);
					} catch {
						// ignore
					}
				} else if (raw && typeof raw === "object") {
					parsed = raw;
				}

				state = { ...DEFAULT_AGENT_MODEL_SETTINGS, ...parsed };
				// Normalize per-config defaults for backward compatibility.
				state = {
					...state,
					contextRuntime: {
						...(DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime || {}),
						...((state as any).contextRuntime || {}),
						contextBudget: {
							...(DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.contextBudget ||
								{}),
							...((state as any).contextRuntime?.contextBudget || {}),
						},
						teammateBudget: {
							...(DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.teammateBudget ||
								{}),
							...((state as any).contextRuntime?.teammateBudget || {}),
						},
						settingSources: Array.isArray(
							(state as any).contextRuntime?.settingSources,
						)
							? ((state as any).contextRuntime.settingSources as Array<
									"user" | "project" | "local"
								>)
							: DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.settingSources || [
									"user",
									"project",
								],
						betas: Array.isArray((state as any).contextRuntime?.betas)
							? ((state as any).contextRuntime.betas as string[])
							: [],
					},
					scenarioConfigs: Array.isArray((state as any).scenarioConfigs)
						? (state.scenarioConfigs as ScenarioModelConfig[]).map((c) => ({
								...c,
								enabled: c?.enabled !== false,
							}))
						: [],
				};
			} catch {
				state = { ...DEFAULT_AGENT_MODEL_SETTINGS };
			} finally {
				isInitialized = true;
				emitChange();
				initPromise = null;
			}
		})();

		return initPromise;
	},

	getSettings(): AgentModelSettings {
		return state;
	},

	async save(): Promise<void> {
		try {
			await setConfig(CONFIG_KEY, JSON.stringify(state));
		} catch (e) {
			console.error("[AgentModelSettings] Failed to save:", e);
		}
	},

	async refresh(): Promise<void> {
		isInitialized = false;
		await this.init();
	},

	async setDefaultModel(modelId: string, providerId: string): Promise<void> {
		state = {
			...state,
			defaultModelId: modelId,
			defaultProviderId: providerId,
		};
		emitChange();
		await this.save();
	},

	async addScenarioConfig(
		config: Omit<ScenarioModelConfig, "enabled">,
	): Promise<void> {
		const newConfig: ScenarioModelConfig = { ...config, enabled: true };
		state = {
			...state,
			scenarioConfigs: [...state.scenarioConfigs, newConfig],
		};
		emitChange();
		await this.save();
	},

	async updateScenarioConfig(
		scenario: AgentScenario,
		updates: Partial<ScenarioModelConfig>,
		customName?: string,
	): Promise<void> {
		state = {
			...state,
			scenarioConfigs: state.scenarioConfigs.map((c) =>
				scenario === "custom"
					? c.scenario === "custom" && c.customName === customName
						? { ...c, ...updates }
						: c
					: c.scenario === scenario
						? { ...c, ...updates }
						: c,
			),
		};
		emitChange();
		await this.save();
	},

	async removeScenarioConfig(
		scenario: AgentScenario,
		customName?: string,
	): Promise<void> {
		state = {
			...state,
			scenarioConfigs: state.scenarioConfigs.filter((c) => {
				if (scenario === "custom") {
					return !(c.scenario === "custom" && c.customName === customName);
				}
				return c.scenario !== scenario;
			}),
		};
		emitChange();
		await this.save();
	},

	async toggleSmartScenarioSwitch(): Promise<void> {
		state = {
			...state,
			enableSmartScenarioSwitch: !state.enableSmartScenarioSwitch,
		};
		emitChange();
		await this.save();
	},

	async updateContextCompression(
		settings: Partial<NonNullable<AgentModelSettings["contextCompression"]>>,
	): Promise<void> {
		state = {
			...state,
			contextCompression: {
				enabled: false,
				threshold: 30000,
				strategy: "summary",
				...(state.contextCompression || {}),
				...settings,
			},
		};
		emitChange();
		await this.save();
	},

	async updateContextRuntime(
		settings: Partial<
			Omit<NonNullable<AgentModelSettings["contextRuntime"]>, "contextBudget">
		> & {
			contextBudget?: Partial<
				NonNullable<AgentModelSettings["contextRuntime"]>["contextBudget"]
			>;
			teammateBudget?: Partial<
				NonNullable<AgentModelSettings["contextRuntime"]>["teammateBudget"]
			>;
		},
	): Promise<void> {
		const mergedBudget = {
			maxContextChars:
				settings.contextBudget?.maxContextChars ??
				state.contextRuntime?.contextBudget?.maxContextChars ??
				DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.contextBudget
					?.maxContextChars ??
				16000,
			maxFiles:
				settings.contextBudget?.maxFiles ??
				state.contextRuntime?.contextBudget?.maxFiles ??
				DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.contextBudget?.maxFiles ??
				12,
			maxFileChars:
				settings.contextBudget?.maxFileChars ??
				state.contextRuntime?.contextBudget?.maxFileChars ??
				DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.contextBudget
					?.maxFileChars ??
				6000,
		};
		const mergedTeammateBudget = {
			maxTurns:
				settings.teammateBudget?.maxTurns ??
				state.contextRuntime?.teammateBudget?.maxTurns ??
				DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.teammateBudget
					?.maxTurns ??
				12,
			maxThinkingTokens:
				settings.teammateBudget?.maxThinkingTokens ??
				state.contextRuntime?.teammateBudget?.maxThinkingTokens ??
				DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.teammateBudget
					?.maxThinkingTokens ??
				4096,
			maxBudgetUsd:
				settings.teammateBudget?.maxBudgetUsd ??
				state.contextRuntime?.teammateBudget?.maxBudgetUsd ??
				DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.teammateBudget
					?.maxBudgetUsd,
		};
		state = {
			...state,
			contextRuntime: {
				contextPolicy:
					settings.contextPolicy ??
					state.contextRuntime?.contextPolicy ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.contextPolicy ??
					"balanced",
				subagentContextMode:
					settings.subagentContextMode ??
					state.contextRuntime?.subagentContextMode ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.subagentContextMode ??
					"capsule",
				maxTurns:
					settings.maxTurns ??
					state.contextRuntime?.maxTurns ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.maxTurns ??
					24,
				maxThinkingTokens:
					settings.maxThinkingTokens ??
					state.contextRuntime?.maxThinkingTokens ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.maxThinkingTokens ??
					8192,
				maxBudgetUsd:
					settings.maxBudgetUsd ??
					state.contextRuntime?.maxBudgetUsd ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.maxBudgetUsd,
				settingSources: settings.settingSources ??
					state.contextRuntime?.settingSources ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.settingSources ?? [
						"user",
						"project",
					],
				enableToolSearch:
					settings.enableToolSearch ??
					state.contextRuntime?.enableToolSearch ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.enableToolSearch ??
					"auto:5",
				betas:
					settings.betas ??
					state.contextRuntime?.betas ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.betas ??
					[],
				experimentalMultiAgentEnabled:
					settings.experimentalMultiAgentEnabled ??
					state.contextRuntime?.experimentalMultiAgentEnabled ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime
						?.experimentalMultiAgentEnabled ??
					false,
				multiAgentMode:
					settings.multiAgentMode ??
					state.contextRuntime?.multiAgentMode ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.multiAgentMode ??
					"hybrid",
				maxTeammates:
					settings.maxTeammates ??
					state.contextRuntime?.maxTeammates ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.maxTeammates ??
					2,
				teammateMode:
					settings.teammateMode ??
					state.contextRuntime?.teammateMode ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.teammateMode ??
					"auto",
				teammateBudget: mergedTeammateBudget,
				leaderSummaryModel:
					settings.leaderSummaryModel ??
					state.contextRuntime?.leaderSummaryModel ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.leaderSummaryModel,
				teammateExecutionModel:
					settings.teammateExecutionModel ??
					state.contextRuntime?.teammateExecutionModel ??
					DEFAULT_AGENT_MODEL_SETTINGS.contextRuntime?.teammateExecutionModel,
				contextBudget: mergedBudget,
			},
		};
		emitChange();
		await this.save();
	},

	getModelForScenario(
		scenario: AgentScenario,
		customName?: string,
	): { modelId: string; providerId: string } | null {
		return getModelForScenario(state, scenario, customName);
	},

	getModelForTask(taskDescription: string): {
		modelId: string;
		providerId: string;
		scenario: AgentScenario;
		customName?: string;
	} | null {
		if (!state.enableSmartScenarioSwitch) {
			if (state.defaultModelId && state.defaultProviderId) {
				return {
					modelId: state.defaultModelId,
					providerId: state.defaultProviderId,
					scenario: "default" as AgentScenario,
				};
			}
			return null;
		}

		const task = String(taskDescription || "");
		const lower = task.toLowerCase();

		// 1) 先用用户在场景里配置的 triggerKeywords 命中（支持 custom 场景）
		for (const config of state.scenarioConfigs) {
			if (!config?.enabled) continue;
			const keywords = Array.isArray(config.triggerKeywords)
				? config.triggerKeywords
				: [];
			const hit = keywords.some((kw) => {
				const k = String(kw || "").trim();
				if (!k) return false;
				const kl = k.toLowerCase();
				return lower.includes(kl) || task.includes(k);
			});
			if (!hit) continue;
			if (config.modelId && config.providerId) {
				return {
					modelId: config.modelId,
					providerId: config.providerId,
					scenario: config.scenario,
					customName: config.customName,
				};
			}
		}

		// 2) 再走内置的简单规则推断
		const scenario = inferScenarioFromTask(taskDescription);
		const model = getModelForScenario(state, scenario);

		if (model) {
			return { ...model, scenario };
		}

		return null;
	},

	async reset(): Promise<void> {
		state = { ...DEFAULT_AGENT_MODEL_SETTINGS };
		emitChange();
		await this.save();
	},

	subscribe(listener: () => void): () => void {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
};

export function useAgentModelSettingsStore() {
	const [settings, setSettings] = useState(
		agentModelSettingsStore.getSettings(),
	);
	const [isLoaded, setIsLoaded] = useState(isInitialized);

	useEffect(() => {
		if (!isInitialized) {
			agentModelSettingsStore.init().then(() => {
				setSettings(agentModelSettingsStore.getSettings());
				setIsLoaded(true);
			});
		}

		return agentModelSettingsStore.subscribe(() => {
			setSettings(agentModelSettingsStore.getSettings());
			setIsLoaded(isInitialized);
		});
	}, []);

	return { settings, isLoaded, store: agentModelSettingsStore };
}
