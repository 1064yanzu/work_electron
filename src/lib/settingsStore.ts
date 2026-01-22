import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
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

// Simple event emitter for store updates
const listeners = new Set<() => void>();

const emitChange = () => {
	listeners.forEach((l) => l());
};

// Map backend Provider to UI Provider
const findTemplateByType = (type: ProviderType): ProviderTemplate | undefined =>
	PROVIDER_TEMPLATES.find((t) => t.providerType === type);

const mapBackendToUI = (backend: BackendProvider): UIProvider => {
	const template = findTemplateByType(backend.provider_type);
	const metadata = backend.metadata ?? {};
	const templateId =
		metadata.templateId ?? metadata.template_id ?? template?.templateId;
	return {
		id: backend.id,
		templateId,
		providerType: backend.provider_type,
		name: backend.name,
		icon: template?.icon ?? Sparkles,
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

let currentProviders: UIProvider[] = [];
let backendProviders: BackendProvider[] = [];
let activeModelId = "";
let isInitialized = false;
let initPromise: Promise<void> | null = null;

const getProviderTemplateId = (
	provider: BackendProvider,
): string | undefined => {
	const metadata = provider.metadata ?? {};
	return metadata.templateId ?? metadata.template_id;
};

const matchesTemplate = (
	provider: BackendProvider,
	template: ProviderTemplate,
): boolean => {
	const metaId = getProviderTemplateId(provider);
	if (metaId) return metaId === template.templateId;
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

		const updated = {
			...provider,
			models: provider.models.filter((model) => model !== modelName),
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
			backendProviders.push(created);
			currentProviders.push(mapBackendToUI(created));
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
};

export function useSettingsStore() {
	const [providers, setProviders] = useState(settingsStore.getProviders());
	const [activeModel, setActiveModel] = useState(
		settingsStore.getActiveModel(),
	);
	const [isLoading, setIsLoading] = useState(!isInitialized);

	useEffect(() => {
		let mounted = true;

		// 【修复热重载】开发模式下强制重新加载配置
		// 即使 isInitialized 为 true，也检查数据是否为空（热重载标志）
		const needsReload =
			!isInitialized || settingsStore.getProviders().length === 0;

		if (needsReload) {
			const loadData = async () => {
				try {
					await settingsStore.reload();
					if (mounted) {
						setProviders(settingsStore.getProviders());
						setActiveModel(settingsStore.getActiveModel());
						setIsLoading(false);
					}
				} catch (error) {
					console.error("[useSettingsStore] 加载配置失败:", error);
					if (mounted) setIsLoading(false);
				}
			};
			loadData();
		}

		const unsubscribe = settingsStore.subscribe(() => {
			if (mounted) {
				setProviders(settingsStore.getProviders());
				setActiveModel(settingsStore.getActiveModel());
			}
		});

		return () => {
			mounted = false;
			unsubscribe();
		};
	}, []);

	return { providers, activeModel, settingsStore, isLoading };
}
