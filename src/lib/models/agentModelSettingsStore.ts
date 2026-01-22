/**
 * Agent Model Settings Store
 * 管理用户的Agent模型场景配置
 * 使用与chatSettingsStore相同的模式
 */
import { useEffect, useState } from 'react';
import { getConfig, setConfig } from '../config';
import {
    type AgentModelSettings,
    type AgentScenario,
    type ScenarioModelConfig,
    DEFAULT_AGENT_MODEL_SETTINGS,
    getModelForScenario,
    inferScenarioFromTask,
} from '../models/agentModelConfig';

const CONFIG_KEY = 'agent.model_settings';

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

                if (typeof raw === 'string') {
                    try {
                        parsed = JSON.parse(raw);
                    } catch {
                        // ignore
                    }
                } else if (raw && typeof raw === 'object') {
                    parsed = raw;
                }

                state = { ...DEFAULT_AGENT_MODEL_SETTINGS, ...parsed };
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
            console.error('[AgentModelSettings] Failed to save:', e);
        }
    },

    async refresh(): Promise<void> {
        isInitialized = false;
        await this.init();
    },

    async setDefaultModel(modelId: string, providerId: string): Promise<void> {
        state = { ...state, defaultModelId: modelId, defaultProviderId: providerId };
        emitChange();
        await this.save();
    },

    async addScenarioConfig(config: Omit<ScenarioModelConfig, 'enabled'>): Promise<void> {
        const newConfig: ScenarioModelConfig = { ...config, enabled: true };
        state = {
            ...state,
            scenarioConfigs: [...state.scenarioConfigs, newConfig]
        };
        emitChange();
        await this.save();
    },

    async updateScenarioConfig(scenario: AgentScenario, updates: Partial<ScenarioModelConfig>): Promise<void> {
        state = {
            ...state,
            scenarioConfigs: state.scenarioConfigs.map((c) =>
                c.scenario === scenario ? { ...c, ...updates } : c
            )
        };
        emitChange();
        await this.save();
    },

    async removeScenarioConfig(scenario: AgentScenario, customName?: string): Promise<void> {
        state = {
            ...state,
            scenarioConfigs: state.scenarioConfigs.filter((c) => {
                if (scenario === 'custom') {
                    return !(c.scenario === 'custom' && c.customName === customName);
                }
                return c.scenario !== scenario;
            })
        };
        emitChange();
        await this.save();
    },

    async toggleSmartScenarioSwitch(): Promise<void> {
        state = {
            ...state,
            enableSmartScenarioSwitch: !state.enableSmartScenarioSwitch
        };
        emitChange();
        await this.save();
    },

    async updateContextCompression(settings: Partial<NonNullable<AgentModelSettings['contextCompression']>>): Promise<void> {
        state = {
            ...state,
            contextCompression: {
                enabled: false,
                threshold: 30000,
                strategy: 'summary',
                ...(state.contextCompression || {}),
                ...settings
            }
        };
        emitChange();
        await this.save();
    },

    getModelForScenario(scenario: AgentScenario, customName?: string): { modelId: string; providerId: string } | null {
        return getModelForScenario(state, scenario, customName);
    },

    getModelForTask(taskDescription: string): { modelId: string; providerId: string; scenario: AgentScenario } | null {
        if (!state.enableSmartScenarioSwitch) {
            if (state.defaultModelId && state.defaultProviderId) {
                return {
                    modelId: state.defaultModelId,
                    providerId: state.defaultProviderId,
                    scenario: 'default' as AgentScenario
                };
            }
            return null;
        }

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
