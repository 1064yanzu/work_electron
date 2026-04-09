// 编辑器状态管理 - 文档编辑、多标签、AI 审查等

import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";
import type {
	AIReviewState,
	ActiveFileSession,
	DocCacheItem,
	EditorState,
} from "./types";

function createDocCacheItem(params: {
	docId: string;
	title: string;
	content: string;
	kind: DocCacheItem["kind"];
	snapshot?: string;
}): DocCacheItem {
	return {
		id: params.docId,
		title: params.title,
		content: params.content,
		kind: params.kind,
		filePath: params.kind === "project_file" ? params.docId : undefined,
		dirty: false,
		lastSynced: Date.now(),
		snapshot: params.snapshot,
	};
}

function createActiveFileSession(
	docId: string,
	title: string,
	content: string,
): ActiveFileSession {
	return {
		path: docId,
		title,
		content,
		openedAt: Date.now(),
	};
}

const initialAIReview: AIReviewState = {
	isReviewing: false,
	docId: null,
	originalContent: "",
	suggestedContent: "",
	type: "update",
};

const initialEditorState: EditorState = {
	editorContent: "",
	editorSelection: "",
	openedDocs: [],
	activeDocId: null,
	docCache: {},
	activeFileSession: null,
	aiReview: initialAIReview,
};

const store = createStore<EditorState>(initialEditorState);

// === 操作方法 ===

function setEditorContent(content: string) {
	store.setState((state) => ({ ...state, editorContent: content }));
}

function setEditorSelection(selection: string) {
	store.setState((state) => ({ ...state, editorSelection: selection }));
}

// 打开文档（添加到标签栏）
function openDoc(docId: string, title: string, content: string) {
	store.setState((state) => {
		const isAlreadyOpen = state.openedDocs.includes(docId);
		const newOpenedDocs = isAlreadyOpen
			? state.openedDocs
			: [...state.openedDocs, docId];
		const existingDoc = state.docCache[docId];
		const nextDocCacheItem =
			existingDoc && existingDoc.dirty
				? {
						...existingDoc,
						title,
					}
				: createDocCacheItem({
						docId,
						title,
						content,
						kind: "output",
						snapshot: existingDoc?.snapshot,
					});

		const newDocCache = {
			...state.docCache,
			[docId]: nextDocCacheItem,
		};

		return {
			...state,
			openedDocs: newOpenedDocs,
			activeDocId: docId,
			editorContent: nextDocCacheItem.content,
			docCache: newDocCache,
			activeFileSession: null,
		};
	});
}

function openProjectFile(filePath: string, title: string, content: string) {
	store.setState((state) => {
		const isAlreadyOpen = state.openedDocs.includes(filePath);
		const newOpenedDocs = isAlreadyOpen
			? state.openedDocs
			: [...state.openedDocs, filePath];
		const existingDoc = state.docCache[filePath];
		const nextDocCacheItem =
			existingDoc && existingDoc.dirty
				? {
						...existingDoc,
						title,
					}
				: createDocCacheItem({
						docId: filePath,
						title,
						content,
						kind: "project_file",
						snapshot: existingDoc?.snapshot,
					});

		return {
			...state,
			openedDocs: newOpenedDocs,
			activeDocId: filePath,
			editorContent: nextDocCacheItem.content,
			docCache: {
				...state.docCache,
				[filePath]: nextDocCacheItem,
			},
			activeFileSession: createActiveFileSession(
				filePath,
				title,
				nextDocCacheItem.content,
			),
		};
	});
}

// 关闭文档
function closeDoc(docId: string) {
	store.setState((state) => {
		const newOpenedDocs = state.openedDocs.filter((id) => id !== docId);
		const { [docId]: removed, ...newDocCache } = state.docCache;

		// 如果关闭的是当前激活文档，切换到最后一个
		let newActiveDocId = state.activeDocId;
		if (state.activeDocId === docId) {
			newActiveDocId =
				newOpenedDocs.length > 0
					? newOpenedDocs[newOpenedDocs.length - 1]
					: null;
		}
		const nextActiveDoc = newActiveDocId ? newDocCache[newActiveDocId] : null;

		return {
			...state,
			openedDocs: newOpenedDocs,
			activeDocId: newActiveDocId,
			editorContent: nextActiveDoc?.content || "",
			docCache: newDocCache,
			activeFileSession:
				nextActiveDoc?.kind === "project_file" && newActiveDocId
					? createActiveFileSession(
							newActiveDocId,
							nextActiveDoc.title,
							nextActiveDoc.content,
						)
					: null,
		};
	});
}

// 切换激活文档
function setActiveDoc(docId: string) {
	store.setState((state) => {
		const targetDoc = state.docCache[docId];
		return {
			...state,
			activeDocId: docId,
			editorContent: targetDoc?.content || state.editorContent,
			activeFileSession:
				targetDoc?.kind === "project_file"
					? createActiveFileSession(docId, targetDoc.title, targetDoc.content)
					: null,
		};
	});
}

// 重排文档标签顺序（拖拽排序）
function reorderDocs(fromIndex: number, toIndex: number) {
	store.setState((state) => {
		if (
			fromIndex < 0 ||
			fromIndex >= state.openedDocs.length ||
			toIndex < 0 ||
			toIndex >= state.openedDocs.length ||
			fromIndex === toIndex
		) {
			return state;
		}
		const newDocs = [...state.openedDocs];
		const [moved] = newDocs.splice(fromIndex, 1);
		newDocs.splice(toIndex, 0, moved);
		return { ...state, openedDocs: newDocs };
	});
}

// 更新文档缓存内容
function updateDocCache(docId: string, content: string, dirty = true) {
	store.setState((state) => {
		if (!state.docCache[docId]) return state;
		return {
			...state,
			docCache: {
				...state.docCache,
				[docId]: {
					...state.docCache[docId],
					content,
					dirty,
				},
			},
			editorContent:
				state.activeDocId === docId ? content : state.editorContent,
			activeFileSession:
				state.activeFileSession?.path === docId
					? {
							...state.activeFileSession,
							content,
						}
					: state.activeFileSession,
		};
	});
}

function markDocDirty(docId: string) {
	store.setState((state) => {
		const doc = state.docCache[docId];
		if (!doc || doc.dirty) return state;
		return {
			...state,
			docCache: {
				...state.docCache,
				[docId]: {
					...doc,
					dirty: true,
				},
			},
		};
	});
}

// 标记文档已保存
function markDocSaved(docId: string) {
	store.setState((state) => {
		if (!state.docCache[docId]) return state;
		return {
			...state,
			docCache: {
				...state.docCache,
				[docId]: {
					...state.docCache[docId],
					dirty: false,
					lastSynced: Date.now(),
				},
			},
		};
	});
}

// 保存快照（用于撤销 AI 修改）
function saveDocSnapshot(docId: string) {
	store.setState((state) => {
		if (!state.docCache[docId]) return state;
		return {
			...state,
			docCache: {
				...state.docCache,
				[docId]: {
					...state.docCache[docId],
					snapshot: state.docCache[docId].content,
				},
			},
		};
	});
}

// 恢复快照
function restoreDocSnapshot(docId: string) {
	store.setState((state) => {
		const doc = state.docCache[docId];
		if (!doc || !doc.snapshot) return state;
		return {
			...state,
			docCache: {
				...state.docCache,
				[docId]: {
					...doc,
					content: doc.snapshot,
					snapshot: undefined,
					dirty: true,
				},
			},
		};
	});
}

// 获取当前激活文档的内容
function getActiveDocContent(): string {
	const { activeDocId, docCache, editorContent } = store.getState();
	// 优先从 docCache 获取，如果没有则回退到 editorContent
	if (activeDocId && docCache[activeDocId]) {
		return docCache[activeDocId].content;
	}
	// 回退到旧的 editorContent 状态
	return editorContent;
}

// === AI 审查状态管理 ===

// 开始 AI 审查（update-doc）
function startAIReview(
	docId: string,
	originalContent: string,
	suggestedContent: string,
) {
	// 先保存快照
	saveDocSnapshot(docId);

	store.setState((state) => ({
		...state,
		aiReview: {
			isReviewing: true,
			docId,
			originalContent,
			suggestedContent,
			type: "update",
		},
	}));
}

// 开始 AI 新建文档提案（create-doc）
function startAICreateProposal(
	title: string,
	summary: string,
	content: string,
) {
	store.setState((state) => ({
		...state,
		aiReview: {
			isReviewing: true,
			docId: null,
			originalContent: "",
			suggestedContent: content,
			type: "create",
			title,
			summary,
		},
	}));
}

// 接受 AI 修改
function acceptAIReview() {
	store.setState((state) => {
		if (!state.aiReview.isReviewing) return state;

		// 如果是 update-doc，更新文档内容
		if (state.aiReview.type === "update" && state.aiReview.docId) {
			const docId = state.aiReview.docId;
			return {
				...state,
				docCache: {
					...state.docCache,
					[docId]: {
						...state.docCache[docId],
						content: state.aiReview.suggestedContent,
						dirty: true,
					},
				},
				aiReview: {
					isReviewing: false,
					docId: null,
					originalContent: "",
					suggestedContent: "",
					type: "update",
				},
			};
		}

		// 如果是 create-doc，清除审查状态（实际创建由外部处理）
		return {
			...state,
			aiReview: {
				isReviewing: false,
				docId: null,
				originalContent: "",
				suggestedContent: "",
				type: "update",
			},
		};
	});
}

// 拒绝 AI 修改
function rejectAIReview() {
	store.setState((state) => {
		// 如果是 update-doc，恢复快照
		if (state.aiReview.type === "update" && state.aiReview.docId) {
			const docId = state.aiReview.docId;
			const doc = state.docCache[docId];
			if (doc && doc.snapshot) {
				return {
					...state,
					docCache: {
						...state.docCache,
						[docId]: {
							...doc,
							content: doc.snapshot,
							snapshot: undefined,
						},
					},
					aiReview: {
						isReviewing: false,
						docId: null,
						originalContent: "",
						suggestedContent: "",
						type: "update",
					},
				};
			}
		}

		return {
			...state,
			aiReview: {
				isReviewing: false,
				docId: null,
				originalContent: "",
				suggestedContent: "",
				type: "update",
			},
		};
	});
}

// 检查是否有脏文档
function hasDirtyDocs(): boolean {
	return Object.values(store.getState().docCache).some((doc) => doc.dirty);
}

// 获取脏文档列表
function getDirtyDocs(): DocCacheItem[] {
	return Object.values(store.getState().docCache).filter((doc) => doc.dirty);
}

/**
 * 项目切换时重置编辑器状态（由 workspaceStore.setCurrentProject 调用）
 */
function resetOnProjectChange() {
	store.setState((state) => ({
		...state,
		openedDocs: [],
		activeDocId: null,
		docCache: {},
		activeFileSession: null,
		aiReview: initialAIReview,
	}));
}

// === 导出 ===

export const editorStore = {
	...store,
	setEditorContent,
	setEditorSelection,
	openDoc,
	openProjectFile,
	closeDoc,
	setActiveDoc,
	reorderDocs,
	updateDocCache,
	markDocDirty,
	markDocSaved,
	saveDocSnapshot,
	restoreDocSnapshot,
	getActiveDocContent,
	startAIReview,
	startAICreateProposal,
	acceptAIReview,
	rejectAIReview,
	hasDirtyDocs,
	getDirtyDocs,
	resetOnProjectChange,
};

export const useEditorStore = createUseStore(store);
export const useEditorStoreSelector = createUseStoreSelector(store);
