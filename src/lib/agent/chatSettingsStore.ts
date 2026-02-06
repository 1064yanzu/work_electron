import { useEffect, useState } from "react";

import { getConfig, setConfig } from "../config";

export type AgentChatSettings = {
	replayEnabled: boolean;
	persistEnabled: boolean;
	persistTraceEnabled: boolean;
	replayLimit: number;
	blocksFirstEnabled: boolean;
	inlineTraceEnabled: boolean;
	thoughtPersistenceEnabled: boolean;
};

const DEFAULT_SETTINGS: AgentChatSettings = {
	replayEnabled: true,
	persistEnabled: true,
	persistTraceEnabled: true,
	replayLimit: 200,
	blocksFirstEnabled: true,
	inlineTraceEnabled: true,
	thoughtPersistenceEnabled: true,
};

const CONFIG_KEYS = {
	replayEnabled: "agent.chat.replay_enabled",
	persistEnabled: "agent.chat.persist_enabled",
	persistTraceEnabled: "agent.chat.persist_trace_enabled",
	replayLimit: "agent.chat.replay_limit",
	blocksFirstEnabled: "agent.chat.blocks_first_enabled",
	inlineTraceEnabled: "agent.chat.inline_trace_enabled",
	thoughtPersistenceEnabled: "agent.chat.thought_persistence_enabled",
} as const;

const listeners = new Set<() => void>();

const emitChange = () => {
	listeners.forEach((l) => l());
};

function coerceBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (typeof value === "string") {
		if (value === "true") return true;
		if (value === "false") return false;
		const n = Number(value);
		if (!Number.isNaN(n)) return n !== 0;
	}
	return fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const n = Number(value);
		if (Number.isFinite(n)) return n;
	}
	return fallback;
}

let state: AgentChatSettings = { ...DEFAULT_SETTINGS };
let isInitialized = false;
let initPromise: Promise<void> | null = null;

export const agentChatSettingsStore = {
	async init() {
		if (isInitialized) return;
		if (initPromise) return initPromise;

		initPromise = (async () => {
			try {
				const replayEnabled = await getConfig(CONFIG_KEYS.replayEnabled);
				const persistEnabled = await getConfig(CONFIG_KEYS.persistEnabled);
				const persistTraceEnabled = await getConfig(
					CONFIG_KEYS.persistTraceEnabled,
				);
				const replayLimit = await getConfig(CONFIG_KEYS.replayLimit);
				const blocksFirstEnabled = await getConfig(
					CONFIG_KEYS.blocksFirstEnabled,
				);
				const inlineTraceEnabled = await getConfig(
					CONFIG_KEYS.inlineTraceEnabled,
				);
				const thoughtPersistenceEnabled = await getConfig(
					CONFIG_KEYS.thoughtPersistenceEnabled,
				);

				state = {
					replayEnabled: coerceBoolean(
						replayEnabled,
						DEFAULT_SETTINGS.replayEnabled,
					),
					persistEnabled: coerceBoolean(
						persistEnabled,
						DEFAULT_SETTINGS.persistEnabled,
					),
					persistTraceEnabled: coerceBoolean(
						persistTraceEnabled,
						DEFAULT_SETTINGS.persistTraceEnabled,
					),
					replayLimit: Math.max(
						0,
						Math.min(
							5000,
							coerceNumber(replayLimit, DEFAULT_SETTINGS.replayLimit),
						),
					),
					blocksFirstEnabled: coerceBoolean(
						blocksFirstEnabled,
						DEFAULT_SETTINGS.blocksFirstEnabled,
					),
					inlineTraceEnabled: coerceBoolean(
						inlineTraceEnabled,
						DEFAULT_SETTINGS.inlineTraceEnabled,
					),
					thoughtPersistenceEnabled: coerceBoolean(
						thoughtPersistenceEnabled,
						DEFAULT_SETTINGS.thoughtPersistenceEnabled,
					),
				};
			} catch {
				state = { ...DEFAULT_SETTINGS };
			} finally {
				isInitialized = true;
				emitChange();
				initPromise = null;
			}
		})();

		return initPromise;
	},

	async setBlocksFirstEnabled(enabled: boolean): Promise<void> {
		state = { ...state, blocksFirstEnabled: enabled };
		emitChange();
		try {
			await setConfig(CONFIG_KEYS.blocksFirstEnabled, enabled);
		} catch {
			await this.refresh();
		}
	},

	async setInlineTraceEnabled(enabled: boolean): Promise<void> {
		state = { ...state, inlineTraceEnabled: enabled };
		emitChange();
		try {
			await setConfig(CONFIG_KEYS.inlineTraceEnabled, enabled);
		} catch {
			await this.refresh();
		}
	},

	async setThoughtPersistenceEnabled(enabled: boolean): Promise<void> {
		state = { ...state, thoughtPersistenceEnabled: enabled };
		emitChange();
		try {
			await setConfig(CONFIG_KEYS.thoughtPersistenceEnabled, enabled);
		} catch {
			await this.refresh();
		}
	},

	getSettings(): AgentChatSettings {
		return state;
	},

	async refresh(): Promise<void> {
		isInitialized = false;
		await this.init();
	},

	async setReplayEnabled(enabled: boolean): Promise<void> {
		state = { ...state, replayEnabled: enabled };
		emitChange();
		try {
			await setConfig(CONFIG_KEYS.replayEnabled, enabled);
		} catch {
			await this.refresh();
		}
	},

	async setPersistEnabled(enabled: boolean): Promise<void> {
		state = { ...state, persistEnabled: enabled };
		emitChange();
		try {
			await setConfig(CONFIG_KEYS.persistEnabled, enabled);
		} catch {
			await this.refresh();
		}
	},

	async setPersistTraceEnabled(enabled: boolean): Promise<void> {
		state = { ...state, persistTraceEnabled: enabled };
		emitChange();
		try {
			await setConfig(CONFIG_KEYS.persistTraceEnabled, enabled);
		} catch {
			await this.refresh();
		}
	},

	async setReplayLimit(limit: number): Promise<void> {
		const next = Math.max(0, Math.min(5000, Math.floor(limit)));
		state = { ...state, replayLimit: next };
		emitChange();
		try {
			await setConfig(CONFIG_KEYS.replayLimit, next);
		} catch {
			await this.refresh();
		}
	},

	async resetToDefaults(): Promise<void> {
		state = { ...DEFAULT_SETTINGS };
		emitChange();
		try {
			await setConfig(
				CONFIG_KEYS.replayEnabled,
				DEFAULT_SETTINGS.replayEnabled,
			);
			await setConfig(
				CONFIG_KEYS.persistEnabled,
				DEFAULT_SETTINGS.persistEnabled,
			);
			await setConfig(
				CONFIG_KEYS.persistTraceEnabled,
				DEFAULT_SETTINGS.persistTraceEnabled,
			);
			await setConfig(CONFIG_KEYS.replayLimit, DEFAULT_SETTINGS.replayLimit);
			await setConfig(
				CONFIG_KEYS.blocksFirstEnabled,
				DEFAULT_SETTINGS.blocksFirstEnabled,
			);
			await setConfig(
				CONFIG_KEYS.inlineTraceEnabled,
				DEFAULT_SETTINGS.inlineTraceEnabled,
			);
			await setConfig(
				CONFIG_KEYS.thoughtPersistenceEnabled,
				DEFAULT_SETTINGS.thoughtPersistenceEnabled,
			);
		} catch {
			await this.refresh();
		}
	},

	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
};

export function useAgentChatSettingsStore() {
	const [settings, setSettings] = useState(
		agentChatSettingsStore.getSettings(),
	);
	const [isLoading, setIsLoading] = useState(!isInitialized);

	useEffect(() => {
		if (!isInitialized) {
			agentChatSettingsStore.init().then(() => {
				setSettings(agentChatSettingsStore.getSettings());
				setIsLoading(false);
			});
		}

		return agentChatSettingsStore.subscribe(() => {
			setSettings(agentChatSettingsStore.getSettings());
			setIsLoading(!isInitialized);
		});
	}, []);

	return { settings, isLoading, agentChatSettingsStore };
}
