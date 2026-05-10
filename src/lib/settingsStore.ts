import { Cpu } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
	CORE_PROVIDER_IDS,
	DEFAULT_PROVIDERS,
	PROVIDER_TEMPLATES,
	type ProviderTemplate,
	type Provider as UIProvider,
} from "../components/Settings/constants";
import type {
	Provider as BackendProvider,
	ProviderType,
	UpsertProviderPayload,
} from "../types";
import {
	deleteProvider as deleteProviderApi,
	getActiveModel,
	listProviders,
	setActiveModel as setActiveModelApi,
	upsertProvider,
} from "./api";
import { createUseStoreSelector } from "./stores/createStore";

// Simple event emitter for store updates
const listeners = new Set<() => void>();

const emitChange = () => {
	updateCachedSettingsSnapshot();
	listeners.forEach((l) => l());
};

// ---------------------------------------------------------------------------
// Prefs 区块 —— 通用键值偏好仓库
// ---------------------------------------------------------------------------
// 用于存放 Claude Code 风格斜杠命令、面板默认偏好等「非核心服务商」配置。
// MVP 走 localStorage，单一 key = `slashCommands.prefs` 序列化成一个对象；
// 读异常时返回空对象并 console.warn，不影响 settingsStore 主流程。
// 订阅器与上面的 providers 订阅共用同一个 `listeners` Set，写入时走 `emitChange`
// 统一广播，避免多份订阅器状态机。

const PREFS_STORAGE_KEY = "slashCommands.prefs";
const prefsListeners = new Set<() => void>();
let prefsCache: Record<string, unknown> | null = null;

function loadPrefsCache(): Record<string, unknown> {
	if (prefsCache !== null) return prefsCache;
	if (typeof window === "undefined") {
		prefsCache = {};
		return prefsCache;
	}
	try {
		const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
		if (!raw) {
			prefsCache = {};
			return prefsCache;
		}
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			prefsCache = parsed as Record<string, unknown>;
			return prefsCache;
		}
	} catch (err) {
		console.warn("[settingsStore] 读取 prefs 失败，已回退到空对象。", err);
	}
	prefsCache = {};
	return prefsCache;
}

function persistPrefs(): void {
	if (typeof window === "undefined") return;
	try {
		const cache = loadPrefsCache();
		window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(cache));
	} catch (err) {
		console.warn("[settingsStore] 持久化 prefs 失败。", err);
	}
}

function emitPrefsChange(): void {
	prefsListeners.forEach((l) => {
		try {
			l();
		} catch (err) {
			console.warn("[settingsStore] prefs 订阅器回调抛错。", err);
		}
	});
}

// Map backend Provider to UI Provider
const findTemplateByType = (type: ProviderType): ProviderTemplate | undefined =>
	PROVIDER_TEMPLATES.find((t) => t.providerType === type);

const mapBackendToUI = (backend: BackendProvider): UIProvider => {
	const template = findTemplateByType(backend.provider_type);
	const metadata = backend.metadata ?? {};
	const templateId =
		backend.template_id ??
		metadata.templateId ??
		metadata.template_id ??
		template?.templateId;
	return {
		id: backend.id,
		templateId,
		providerType: backend.provider_type,
		name: backend.name,
		icon: template?.icon ?? Cpu,
		color: template?.color ?? "bg-zinc-500",
		isEnabled: backend.is_enabled,
		apiKey: backend.api_key || "",
		apiBase: backend.api_base,
		models: backend.models,
		metadata,
	};
};

const mapBackendToPayload = (
	backend: BackendProvider,
): UpsertProviderPayload => ({
	id: backend.id,
	name: backend.name,
	provider_type: backend.provider_type,
	is_enabled: backend.is_enabled,
	api_key: backend.api_key || undefined,
	api_base: backend.api_base || undefined,
	models: backend.models,
	metadata: backend.metadata ?? {},
});

// Map UI Provider to backend payload
const mapUIToBackend = (ui: UIProvider): UpsertProviderPayload => ({
	id: ui.id,
	name: ui.name,
	provider_type: ui.providerType,
	is_enabled: ui.isEnabled,
	api_key: ui.apiKey || undefined,
	api_base: ui.apiBase || undefined,
	models: ui.models,
	metadata: {
		...(ui.metadata || {}),
		...(ui.templateId ? { templateId: ui.templateId } : {}),
	},
});

type SettingsSnapshot = {
	providers: UIProvider[];
	activeModel: string;
};

let currentProviders: UIProvider[] = [];
let backendProviders: BackendProvider[] = [];
let activeModelId = "";
let isInitialized = false;
let initPromise: Promise<void> | null = null;
let ensureLoadPromise: Promise<void> | null = null;
let cachedSettingsSnapshot: SettingsSnapshot = {
	providers: currentProviders,
	activeModel: activeModelId,
};

function updateCachedSettingsSnapshot() {
	if (
		cachedSettingsSnapshot.providers === currentProviders &&
		cachedSettingsSnapshot.activeModel === activeModelId
	) {
		return;
	}

	cachedSettingsSnapshot = {
		providers: currentProviders,
		activeModel: activeModelId,
	};
}

const getProviderTemplateId = (
	provider: BackendProvider,
): string | undefined => {
	const metadata = provider.metadata ?? {};
	return provider.template_id ?? metadata.templateId ?? metadata.template_id;
};

const matchesTemplate = (
	provider: BackendProvider,
	template: ProviderTemplate,
): boolean => {
	const metaId = getProviderTemplateId(provider);
	// 只有当 templateId 匹配 且 名称也匹配（或未自定义名称）时才算匹配
	// 这样用户自定义名称的供应商（如"反代"）不会被误判为重复
	if (metaId === template.templateId) {
		// 如果名称被用户修改过，则不算作同一模板的实例
		return provider.name === template.name;
	}
	// 没有 templateId 的情况，需要同时匹配 type 和 name
	return (
		provider.provider_type === template.providerType &&
		provider.name === template.name
	);
};

export const settingsStore = {
	async init() {
		if (isInitialized) return;
		if (initPromise) return initPromise;

		initPromise = (async () => {
			try {
				console.log("[settingsStore] 开始初始化服务商配置...");

				// Load providers from backend
				backendProviders = await listProviders();
				console.log(
					`[settingsStore] 后端已有 ${backendProviders.length} 个服务商`,
				);

				// 自动清理重复的核心服务商
				const coreTemplates = PROVIDER_TEMPLATES.filter((t) =>
					CORE_PROVIDER_IDS.includes(t.templateId),
				);

				for (const template of coreTemplates) {
					// 查找所有同模板的服务商
					const duplicates = backendProviders.filter((p) =>
						matchesTemplate(p, template),
					);

					if (duplicates.length > 1) {
						console.log(
							`[settingsStore] 发现重复的服务商 ${template.name} (${duplicates.length} 个)，开始清理...`,
						);
						// 保留第一个（优先保留已启用的）
						const sorted = duplicates.sort(
							(a, b) => (b.is_enabled ? 1 : 0) - (a.is_enabled ? 1 : 0),
						);
						const [, ...remove] = sorted;

						for (const p of remove) {
							try {
								await deleteProviderApi(p.id);
								console.log(
									`[settingsStore] 已删除重复服务商: ${p.name} (${p.id})`,
								);
							} catch (e) {
								console.error(`[settingsStore] 删除重复服务商失败:`, e);
							}
						}

						// 更新本地列表
						backendProviders = backendProviders.filter(
							(p) => !remove.find((r) => r.id === p.id),
						);
					}
				}

				// 同步已有核心服务商的默认信息（避免因旧数据导致 API Base 错乱）
				for (const template of coreTemplates) {
					const provider = backendProviders.find((p) =>
						matchesTemplate(p, template),
					);
					if (!provider) continue;

					const mismatchName = provider.name !== template.name;
					// 只有当用户没有设置 api_key 且 api_base 为空时才设置默认值
					// 这样可以保留用户自定义的 api_base
					const shouldSetDefaultApiBase =
						!!template.defaultApiBase &&
						!provider.api_base &&
						!provider.api_key;
					const shouldSeedModels =
						(!provider.models || provider.models.length === 0) &&
						template.defaultModels.length > 0;
					const missingTemplateId = !getProviderTemplateId(provider);

					if (
						mismatchName ||
						shouldSetDefaultApiBase ||
						shouldSeedModels ||
						missingTemplateId
					) {
						const payload = mapBackendToPayload(provider);
						if (mismatchName) payload.name = template.name;
						if (shouldSetDefaultApiBase)
							payload.api_base = template.defaultApiBase;
						if (shouldSeedModels) payload.models = template.defaultModels;
						payload.metadata = {
							...(provider.metadata ?? {}),
							templateId: template.templateId,
						};

						try {
							const updated = await upsertProvider(payload);
							backendProviders = backendProviders.map((p) =>
								p.id === updated.id ? updated : p,
							);
							console.log(`[settingsStore] 已同步 ${template.name} 的默认配置`);
						} catch (err) {
							console.error(
								`[settingsStore] 同步 ${template.name} 默认配置失败:`,
								err,
							);
						}
					}
				}

				// 重新检查并创建缺失的核心服务商
				for (const template of coreTemplates) {
					const exists = backendProviders.some((p) =>
						matchesTemplate(p, template),
					);

					if (!exists) {
						console.log(`[settingsStore] 自动创建核心服务商: ${template.name}`);
						try {
							const payload: UpsertProviderPayload = {
								name: template.name,
								provider_type: template.providerType,
								is_enabled: template.defaultEnabled,
								api_key: undefined,
								api_base: template.defaultApiBase,
								models: template.defaultModels,
								metadata: { templateId: template.templateId },
							};
							const created = await upsertProvider(payload);
							backendProviders.push(created);
						} catch (err) {
							console.error(
								`[settingsStore] 创建服务商 ${template.name} 失败:`,
								err,
							);
						}
					} else {
						console.log(
							`[settingsStore] 核心服务商 ${template.name} 已存在，跳过创建`,
						);
					}
				}

				currentProviders = backendProviders.map(mapBackendToUI);
				console.log(
					`[settingsStore] 最终可用服务商: ${currentProviders.length} 个`,
				);

				// Load active model
				const active = await getActiveModel();
				activeModelId = active || "";

				isInitialized = true;
				emitChange();
			} catch (error) {
				console.error("[settingsStore] 初始化失败:", error);
				// Fallback to defaults
				currentProviders = DEFAULT_PROVIDERS;
				isInitialized = true;
				emitChange();
			} finally {
				initPromise = null;
			}
		})();

		return initPromise;
	},

	/**
	 * 强制重新加载配置（用于热重载场景）
	 */
	async reload() {
		console.log("[settingsStore] 强制重新加载配置...");
		isInitialized = false;
		initPromise = null;
		await this.init();
		console.log("[settingsStore] 重新加载完成");
	},

	getProviders: () => currentProviders,

	async updateProvider(id: string, updates: Partial<UIProvider>) {
		const provider = currentProviders.find((p) => p.id === id);
		if (!provider) return;

		const updated = { ...provider, ...updates };
		const payload = mapUIToBackend(updated);

		try {
			const result = await upsertProvider(payload);
			backendProviders = backendProviders.map((b) =>
				b.id === result.id ? result : b,
			);
			currentProviders = currentProviders.map((p) =>
				p.id === id ? mapBackendToUI(result) : p,
			);
			emitChange();
		} catch (error) {
			console.error("Failed to update provider:", error);
		}
	},

	async addModel(providerId: string, modelName: string) {
		const provider = currentProviders.find((p) => p.id === providerId);
		if (!provider) return;

		const updated = { ...provider, models: [...provider.models, modelName] };
		await this.updateProvider(providerId, updated);
	},

	async removeModel(providerId: string, modelName: string) {
		const provider = currentProviders.find((p) => p.id === providerId);
		if (!provider) return;

		const metadata = { ...(provider.metadata || {}) };
		const modelEndpointTypes =
			metadata.model_endpoint_types &&
			typeof metadata.model_endpoint_types === "object" &&
			!Array.isArray(metadata.model_endpoint_types)
				? { ...(metadata.model_endpoint_types as Record<string, unknown>) }
				: {};
		delete modelEndpointTypes[modelName];
		if (Object.keys(modelEndpointTypes).length > 0) {
			metadata.model_endpoint_types = modelEndpointTypes;
		} else {
			delete metadata.model_endpoint_types;
		}

		const updated = {
			...provider,
			models: provider.models.filter((model) => model !== modelName),
			metadata,
		};
		await this.updateProvider(providerId, updated);
	},

	async createProvider(options: {
		template?: ProviderTemplate;
		name: string;
		providerType: ProviderType;
		apiKey?: string;
		apiBase?: string;
		models?: string[];
		isEnabled?: boolean;
	}) {
		const payload: UpsertProviderPayload = {
			name: options.name,
			provider_type: options.providerType,
			is_enabled: options.isEnabled ?? true,
			api_key: options.apiKey || undefined,
			api_base: options.apiBase || undefined,
			models: options.models || [],
			metadata: {
				...(options.template
					? { templateId: options.template.templateId }
					: {}),
			},
		};

		try {
			const created = await upsertProvider(payload);
			backendProviders = [...backendProviders, created];
			currentProviders = [...currentProviders, mapBackendToUI(created)];
			emitChange();
			return created;
		} catch (error) {
			console.error("Failed to create provider:", error);
			throw error;
		}
	},

	async deleteProvider(id: string) {
		try {
			await deleteProviderApi(id);
			backendProviders = backendProviders.filter((p) => p.id !== id);
			currentProviders = currentProviders.filter((p) => p.id !== id);
			emitChange();
		} catch (error) {
			console.error("Failed to delete provider:", error);
			throw error;
		}
	},

	getActiveModel: () => activeModelId,

	async setActiveModel(modelId: string) {
		try {
			await setActiveModelApi(modelId);
			activeModelId = modelId;
			emitChange();
		} catch (error) {
			console.error("Failed to set active model:", error);
		}
	},

	subscribe: (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},

	// ---------------------------------------------------------------------
	// Prefs API（斜杠命令等"非核心服务商"偏好）
	// ---------------------------------------------------------------------

	/**
	 * 读取一条用户偏好。
	 *
	 * 读取异常或未知字段 → 回退到 `defaultValue`；
	 * 不做任何类型判定（调用方自行窄化），与 `slashCommands/settingsSnapshot.ts`
	 * 的容错逻辑协同。
	 */
	getPref<T>(key: string, defaultValue: T): T {
		try {
			const cache = loadPrefsCache();
			if (Object.prototype.hasOwnProperty.call(cache, key)) {
				return cache[key] as T;
			}
		} catch (err) {
			console.warn(`[settingsStore] 读取 pref "${key}" 失败。`, err);
		}
		return defaultValue;
	},

	/**
	 * 写入一条用户偏好；立即持久化并广播给所有 `onPrefsChanged` 订阅者。
	 *
	 * 约定：传 `undefined` 视为删除该字段。返回 Promise 以便调用方等待持久化完成
	 * （当前 MVP 走 localStorage，实际为同步操作；未来可替换为异步存储而不破坏 API）。
	 */
	async setPref(key: string, value: unknown): Promise<void> {
		const cache = loadPrefsCache();
		const prev = cache[key];
		if (Object.is(prev, value)) return;
		if (value === undefined) {
			delete cache[key];
		} else {
			cache[key] = value;
		}
		persistPrefs();
		emitPrefsChange();
	},

	/** 订阅任意 pref 字段变化；返回 unsubscribe。 */
	onPrefsChanged(listener: () => void): () => void {
		prefsListeners.add(listener);
		return () => {
			prefsListeners.delete(listener);
		};
	},
};
function getSettingsSnapshot(): SettingsSnapshot {
	return cachedSettingsSnapshot;
}

const settingsSnapshotStore = {
	getState: getSettingsSnapshot,
	subscribe: settingsStore.subscribe,
};

const useSettingsSelectorBase = createUseStoreSelector(settingsSnapshotStore);

function shouldReloadSettingsStore() {
	return !isInitialized || settingsStore.getProviders().length === 0;
}

function ensureSettingsStoreLoaded() {
	if (!shouldReloadSettingsStore()) {
		return Promise.resolve();
	}

	if (!ensureLoadPromise) {
		const needsForceReload =
			isInitialized && settingsStore.getProviders().length === 0;
		ensureLoadPromise = (
			needsForceReload ? settingsStore.reload() : settingsStore.init()
		).finally(() => {
			ensureLoadPromise = null;
		});
	}

	return ensureLoadPromise;
}

function useEnsureSettingsStoreLoaded(onSettled?: () => void) {
	useEffect(() => {
		let mounted = true;

		if (!shouldReloadSettingsStore()) {
			onSettled?.();
			return () => {
				mounted = false;
			};
		}

		void ensureSettingsStoreLoaded()
			.catch((error) => {
				console.error("[useSettingsStore] 加载配置失败:", error);
			})
			.finally(() => {
				if (mounted) {
					onSettled?.();
				}
			});

		return () => {
			mounted = false;
		};
	}, [onSettled]);
}

export function useSettingsStoreSelector<T>(
	selector: (state: SettingsSnapshot) => T,
): T {
	useEnsureSettingsStoreLoaded();
	return useSettingsSelectorBase(selector);
}

export function useSettingsStore() {
	const [isLoading, setIsLoading] = useState(!isInitialized);
	const handleSettled = useCallback(() => {
		setIsLoading(false);
	}, []);
	useEnsureSettingsStoreLoaded(handleSettled);

	const { providers, activeModel } = useSyncExternalStore(
		settingsStore.subscribe,
		getSettingsSnapshot,
		getSettingsSnapshot,
	);

	return { providers, activeModel, settingsStore, isLoading };
}
