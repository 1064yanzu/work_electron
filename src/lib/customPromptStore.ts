// 自定义提示词状态管理
// 用于管理用户自定义的提示词库
// 版本更新：添加显式文件夹管理

import { useSyncExternalStore } from "react";

// 自定义提示词类型
export interface CustomPrompt {
	id: string;
	name: string; // 显示名称
	shortDescription: string; // 简短描述（在列表中显示）
	content: string; // 完整提示词内容
	folderId?: string; // 所属文件夹 ID
	icon?: string; // emoji 图标
	createdAt: number;
	updatedAt: number;
}

// 文件夹类型
export interface PromptFolder {
	id: string;
	name: string;
	icon?: string;
	color?: string; // 可选的颜色标识
	createdAt: number;
}

// 提示词状态
interface CustomPromptState {
	prompts: CustomPrompt[];
	folders: PromptFolder[];
	isLoaded: boolean;
}

const STORAGE_KEY = "custom_prompts_v2";
const LEGACY_STORAGE_KEY = "custom_prompts";

// 默认文件夹
const DEFAULT_FOLDERS: Omit<PromptFolder, "id" | "createdAt">[] = [
	{ name: "开发", icon: "💻", color: "blue" },
	{ name: "写作", icon: "✍️", color: "orange" },
	{ name: "翻译", icon: "🌐", color: "green" },
];

// 默认提示词模板
const DEFAULT_PROMPTS: Omit<
	CustomPrompt,
	"id" | "createdAt" | "updatedAt" | "folderId"
>[] = [
	{
		name: "代码审查",
		shortDescription: "请帮我审查这段代码",
		content:
			"请帮我审查以下代码，检查潜在问题、代码风格、性能优化建议等：\n\n{code}",
		icon: "🔍",
	},
	{
		name: "文章润色",
		shortDescription: "帮我润色文章内容",
		content:
			"请帮我润色以下文章，优化表达、修正语法错误、提升文章质量：\n\n{content}",
		icon: "✨",
	},
	{
		name: "翻译助手",
		shortDescription: "翻译成中文/英文",
		content:
			"请将以下内容翻译成{target_language}，保持原意并使用自然流畅的表达：\n\n{text}",
		icon: "🌐",
	},
];

const initialState: CustomPromptState = {
	prompts: [],
	folders: [],
	isLoaded: false,
};

class CustomPromptStore {
	private state: CustomPromptState = initialState;
	private listeners: Set<() => void> = new Set();

	constructor() {
		this.loadFromStorage();
	}

	getState = () => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit() {
		for (const listener of this.listeners) {
			listener();
		}
	}

	private setState(updater: (state: CustomPromptState) => CustomPromptState) {
		this.state = updater(this.state);
		this.emit();
	}

	// 从本地存储加载
	private async loadFromStorage() {
		try {
			// 尝试加载新版本数据
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const data = JSON.parse(stored) as {
					prompts: CustomPrompt[];
					folders: PromptFolder[];
				};
				this.setState((state) => ({
					...state,
					prompts: data.prompts || [],
					folders: data.folders || [],
					isLoaded: true,
				}));
				return;
			}

			// 尝试迁移旧版本数据
			const legacyStored = localStorage.getItem(LEGACY_STORAGE_KEY);
			if (legacyStored) {
				const legacyPrompts = JSON.parse(legacyStored) as Array<
					CustomPrompt & { category?: string }
				>;

				// 从旧提示词中提取分类并创建文件夹
				const categorySet = new Set<string>();
				for (const p of legacyPrompts) {
					if (p.category) categorySet.add(p.category);
				}

				const now = Date.now();
				const folders: PromptFolder[] = Array.from(categorySet).map(
					(name, i) => ({
						id: `migrated-folder-${i}`,
						name,
						createdAt: now,
					}),
				);

				// 创建分类名到文件夹ID的映射
				const categoryToFolderId: Record<string, string> = {};
				folders.forEach((f) => {
					categoryToFolderId[f.name] = f.id;
				});

				// 迁移提示词，将 category 转换为 folderId
				const prompts: CustomPrompt[] = legacyPrompts.map((p) => {
					const { category, ...rest } = p;
					return {
						...rest,
						folderId: category ? categoryToFolderId[category] : undefined,
					};
				});

				this.setState((state) => ({
					...state,
					prompts,
					folders,
					isLoaded: true,
				}));

				// 保存迁移后的数据并清理旧数据
				this.saveToStorage();
				localStorage.removeItem(LEGACY_STORAGE_KEY);
				console.log("[CustomPromptStore] 已迁移旧版数据");
				return;
			}

			// 首次使用，初始化默认数据
			const now = Date.now();
			const folders = DEFAULT_FOLDERS.map((f, i) => ({
				...f,
				id: `default-folder-${i}`,
				createdAt: now,
			}));

			const folderMap: Record<string, string> = {
				开发: folders[0].id,
				写作: folders[1].id,
				翻译: folders[2].id,
			};

			const prompts = DEFAULT_PROMPTS.map((p, index) => ({
				...p,
				id: `default-${index}`,
				folderId:
					index === 0
						? folderMap["开发"]
						: index === 1
							? folderMap["写作"]
							: folderMap["翻译"],
				createdAt: now,
				updatedAt: now,
			}));

			this.setState((state) => ({
				...state,
				prompts,
				folders,
				isLoaded: true,
			}));
			this.saveToStorage();
		} catch (error) {
			console.error("[CustomPromptStore] 加载提示词失败:", error);
			this.setState((state) => ({
				...state,
				isLoaded: true,
			}));
		}
	}

	// 保存到本地存储
	private saveToStorage() {
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					prompts: this.state.prompts,
					folders: this.state.folders,
				}),
			);
		} catch (error) {
			console.error("[CustomPromptStore] 保存提示词失败:", error);
		}
	}

	// ==================== 文件夹操作 ====================

	// 添加文件夹
	addFolder(name: string, icon?: string, color?: string): string {
		const id = crypto.randomUUID();
		const newFolder: PromptFolder = {
			id,
			name,
			icon,
			color,
			createdAt: Date.now(),
		};

		this.setState((state) => ({
			...state,
			folders: [...state.folders, newFolder],
		}));

		this.saveToStorage();
		console.log("[CustomPromptStore] 添加文件夹:", name);
		return id;
	}

	// 更新文件夹
	updateFolder(
		id: string,
		updates: Partial<Omit<PromptFolder, "id" | "createdAt">>,
	) {
		this.setState((state) => ({
			...state,
			folders: state.folders.map((f) =>
				f.id === id ? { ...f, ...updates } : f,
			),
		}));

		this.saveToStorage();
		console.log("[CustomPromptStore] 更新文件夹:", id);
	}

	// 删除文件夹
	deleteFolder(id: string, deletePrompts: boolean = false) {
		this.setState((state) => ({
			...state,
			folders: state.folders.filter((f) => f.id !== id),
			// 如果 deletePrompts 为 true，删除该文件夹下的所有提示词
			// 否则将这些提示词移到"未分类"（folderId = undefined）
			prompts: deletePrompts
				? state.prompts.filter((p) => p.folderId !== id)
				: state.prompts.map((p) =>
						p.folderId === id ? { ...p, folderId: undefined } : p,
					),
		}));

		this.saveToStorage();
		console.log(
			"[CustomPromptStore] 删除文件夹:",
			id,
			deletePrompts ? "(含提示词)" : "(保留提示词)",
		);
	}

	// 获取文件夹
	getFolder(id: string): PromptFolder | undefined {
		return this.state.folders.find((f) => f.id === id);
	}

	// 移动提示词到文件夹
	movePromptToFolder(promptId: string, folderId: string | undefined) {
		this.setState((state) => ({
			...state,
			prompts: state.prompts.map((p) =>
				p.id === promptId ? { ...p, folderId, updatedAt: Date.now() } : p,
			),
		}));

		this.saveToStorage();
		console.log(
			"[CustomPromptStore] 移动提示词:",
			promptId,
			"->",
			folderId || "未分类",
		);
	}

	// ==================== 提示词操作 ====================

	// 添加提示词
	addPrompt(
		prompt: Omit<CustomPrompt, "id" | "createdAt" | "updatedAt">,
	): string {
		const id = crypto.randomUUID();
		const now = Date.now();
		const newPrompt: CustomPrompt = {
			...prompt,
			id,
			createdAt: now,
			updatedAt: now,
		};

		this.setState((state) => ({
			...state,
			prompts: [...state.prompts, newPrompt],
		}));

		this.saveToStorage();
		console.log("[CustomPromptStore] 添加提示词:", newPrompt.name);
		return id;
	}

	// 更新提示词
	updatePrompt(
		id: string,
		updates: Partial<Omit<CustomPrompt, "id" | "createdAt">>,
	) {
		this.setState((state) => ({
			...state,
			prompts: state.prompts.map((p) =>
				p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p,
			),
		}));

		this.saveToStorage();
		console.log("[CustomPromptStore] 更新提示词:", id);
	}

	// 删除提示词
	deletePrompt(id: string) {
		this.setState((state) => ({
			...state,
			prompts: state.prompts.filter((p) => p.id !== id),
		}));

		this.saveToStorage();
		console.log("[CustomPromptStore] 删除提示词:", id);
	}

	// 获取提示词
	getPrompt(id: string): CustomPrompt | undefined {
		return this.state.prompts.find((p) => p.id === id);
	}

	// 按文件夹获取提示词
	getPromptsByFolder(folderId: string | undefined): CustomPrompt[] {
		if (folderId === undefined) {
			// 返回未分类的提示词
			return this.state.prompts.filter((p) => !p.folderId);
		}
		return this.state.prompts.filter((p) => p.folderId === folderId);
	}

	// 兼容旧 API - 获取所有分类（从文件夹名称）
	getCategories(): string[] {
		return this.state.folders.map((f) => f.name);
	}

	// 兼容旧 API - 按分类获取提示词
	getPromptsByCategory(category?: string): CustomPrompt[] {
		if (!category) return this.state.prompts;
		const folder = this.state.folders.find((f) => f.name === category);
		if (!folder) return [];
		return this.state.prompts.filter((p) => p.folderId === folder.id);
	}

	// 导出提示词
	exportPrompts(): string {
		return JSON.stringify(
			{
				prompts: this.state.prompts,
				folders: this.state.folders,
			},
			null,
			2,
		);
	}

	// 导入提示词
	importPrompts(jsonStr: string): {
		success: boolean;
		count: number;
		error?: string;
	} {
		try {
			const imported = JSON.parse(jsonStr);

			// 支持新旧两种格式
			const promptsToImport = Array.isArray(imported)
				? imported
				: imported.prompts || [];
			const foldersToImport = Array.isArray(imported)
				? []
				: imported.folders || [];

			if (!Array.isArray(promptsToImport)) {
				return { success: false, count: 0, error: "格式错误：需要数组" };
			}

			const now = Date.now();

			// 导入文件夹
			const newFolders = foldersToImport.map((f: PromptFolder) => ({
				...f,
				id: crypto.randomUUID(),
				createdAt: now,
			}));

			// 导入提示词
			const newPrompts = promptsToImport.map((p: CustomPrompt) => ({
				...p,
				id: crypto.randomUUID(),
				createdAt: now,
				updatedAt: now,
			}));

			this.setState((state) => ({
				...state,
				folders: [...state.folders, ...newFolders],
				prompts: [...state.prompts, ...newPrompts],
			}));

			this.saveToStorage();
			return { success: true, count: newPrompts.length };
		} catch (error) {
			return {
				success: false,
				count: 0,
				error: error instanceof Error ? error.message : "解析失败",
			};
		}
	}
}

// 全局单例
export const customPromptStore = new CustomPromptStore();

// React Hook
export function useCustomPromptStore() {
	const state = useSyncExternalStore(
		customPromptStore.subscribe,
		customPromptStore.getState,
	);

	return {
		prompts: state.prompts,
		folders: state.folders,
		isLoaded: state.isLoaded,
		// 文件夹操作
		addFolder: customPromptStore.addFolder.bind(customPromptStore),
		updateFolder: customPromptStore.updateFolder.bind(customPromptStore),
		deleteFolder: customPromptStore.deleteFolder.bind(customPromptStore),
		getFolder: customPromptStore.getFolder.bind(customPromptStore),
		movePromptToFolder:
			customPromptStore.movePromptToFolder.bind(customPromptStore),
		// 提示词操作
		addPrompt: customPromptStore.addPrompt.bind(customPromptStore),
		updatePrompt: customPromptStore.updatePrompt.bind(customPromptStore),
		deletePrompt: customPromptStore.deletePrompt.bind(customPromptStore),
		getPrompt: customPromptStore.getPrompt.bind(customPromptStore),
		getPromptsByFolder:
			customPromptStore.getPromptsByFolder.bind(customPromptStore),
		// 兼容旧 API
		getCategories: customPromptStore.getCategories.bind(customPromptStore),
		getPromptsByCategory:
			customPromptStore.getPromptsByCategory.bind(customPromptStore),
		// 导入导出
		exportPrompts: customPromptStore.exportPrompts.bind(customPromptStore),
		importPrompts: customPromptStore.importPrompts.bind(customPromptStore),
	};
}
