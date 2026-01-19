// 工具权限管理 Store
// 处理权限请求/响应/结果的状态管理

import { useSyncExternalStore } from "react";
import {
	createPermissionRequest,
	DEFAULT_PERMISSION_POLICY,
	type PermissionEvent,
	type PermissionRequest,
	type PermissionResponse,
	type PermissionResult,
	shouldRequestPermission,
	type ToolPermissionPolicy,
	type ToolType,
} from "./types";

// 权限请求状态
interface PendingPermission {
	request: PermissionRequest;
	resolve: (result: PermissionResult) => void;
	timeoutId?: ReturnType<typeof setTimeout>;
}

// 权限历史记录（用于审计）
export interface PermissionHistoryEntry {
	request: PermissionRequest;
	result: PermissionResult;
	timestamp: number;
}

// Store 状态
interface PermissionState {
	policy: ToolPermissionPolicy;
	pendingRequests: Map<string, PendingPermission>;
	sessionRemembered: Map<string, "allowed" | "denied">;
	history: PermissionHistoryEntry[];
}

const STORAGE_KEY = "agent-permission-policy";
const MAX_HISTORY_SIZE = 100;

// 从 localStorage 加载策略
function loadPolicy(): ToolPermissionPolicy {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return { ...DEFAULT_PERMISSION_POLICY, ...JSON.parse(stored) };
		}
	} catch (e) {
		console.warn("Failed to load permission policy:", e);
	}
	return DEFAULT_PERMISSION_POLICY;
}

// 保存策略到 localStorage
function savePolicy(policy: ToolPermissionPolicy) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
	} catch (e) {
		console.warn("Failed to save permission policy:", e);
	}
}

class PermissionStore {
	private state: PermissionState = {
		policy: loadPolicy(),
		pendingRequests: new Map(),
		sessionRemembered: new Map(),
		history: [],
	};

	private listeners: Set<() => void> = new Set();
	private eventListeners: Set<(event: PermissionEvent) => void> = new Set();

	getState = () => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	onEvent = (listener: (event: PermissionEvent) => void) => {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	};

	private emit() {
		this.listeners.forEach((l) => l());
	}

	private emitEvent(event: PermissionEvent) {
		this.eventListeners.forEach((l) => l(event));
	}

	private setState(updater: (state: PermissionState) => PermissionState) {
		this.state = updater(this.state);
		this.emit();
	}

	// ============ 策略管理 ============

	updatePolicy(updates: Partial<ToolPermissionPolicy>) {
		this.setState((state) => {
			const newPolicy = { ...state.policy, ...updates };
			savePolicy(newPolicy);
			return { ...state, policy: newPolicy };
		});
	}

	setToolOverride(
		toolKey: string,
		enabled: boolean,
		mode: ToolPermissionPolicy["defaultMode"],
	) {
		this.setState((state) => {
			const newPolicy = {
				...state.policy,
				toolOverrides: {
					...state.policy.toolOverrides,
					[toolKey]: { enabled, mode },
				},
			};
			savePolicy(newPolicy);
			return { ...state, policy: newPolicy };
		});
	}

	removeToolOverride(toolKey: string) {
		this.setState((state) => {
			const { [toolKey]: _, ...rest } = state.policy.toolOverrides;
			const newPolicy = { ...state.policy, toolOverrides: rest };
			savePolicy(newPolicy);
			return { ...state, policy: newPolicy };
		});
	}

	// ============ 权限请求 ============

	async requestPermission(
		toolCallId: string,
		toolName: string,
		toolType: ToolType,
		input: Record<string, unknown>,
	): Promise<PermissionResult> {
		const { policy, sessionRemembered } = this.state;

		// 检查会话级别的记住选择
		const rememberedKey = `${toolType}:${toolName}`;
		const remembered =
			sessionRemembered.get(rememberedKey) || sessionRemembered.get(toolType);
		if (remembered) {
			const request = createPermissionRequest(
				toolCallId,
				toolName,
				toolType,
				input,
				policy,
			);
			const result: PermissionResult = {
				requestId: `auto-${Date.now()}`,
				toolCallId,
				decision: remembered,
				decidedBy: "policy",
				reason: "session_remembered",
			};
			this.addToHistory(request, result);
			this.emitEvent({ type: "permission_result", result });
			return result;
		}

		// 检查策略是否需要请求权限
		const { needsPermission, autoDecision } = shouldRequestPermission(
			toolType,
			toolName,
			policy,
		);

		if (!needsPermission && autoDecision) {
			const request = createPermissionRequest(
				toolCallId,
				toolName,
				toolType,
				input,
				policy,
			);
			const result: PermissionResult = {
				requestId: `auto-${Date.now()}`,
				toolCallId,
				decision: autoDecision,
				decidedBy: "policy",
				reason:
					autoDecision === "allowed"
						? "auto_approved_by_policy"
						: "denied_by_policy",
			};
			this.addToHistory(request, result);
			this.emitEvent({ type: "permission_result", result });
			return result;
		}

		// 需要用户确认，创建权限请求
		const request = createPermissionRequest(
			toolCallId,
			toolName,
			toolType,
			input,
			policy,
		);

		return new Promise<PermissionResult>((resolve) => {
			// 设置超时
			const timeoutId = setTimeout(() => {
				const result: PermissionResult = {
					requestId: request.id,
					toolCallId,
					decision: "denied",
					decidedBy: "timeout",
					reason: `Permission request timed out after ${policy.timeoutSeconds}s`,
				};

				this.cleanupPermission(request.id);
				this.addToHistory(request, result);
				this.emitEvent({ type: "permission_result", result });
				resolve(result);
			}, policy.timeoutSeconds * 1000);

			// 存储待处理请求
			const pending: PendingPermission = {
				request,
				resolve: (result) => {
					clearTimeout(timeoutId);
					this.cleanupPermission(request.id);
					this.addToHistory(request, result);
					this.emitEvent({ type: "permission_result", result });
					resolve(result);
				},
				timeoutId,
			};

			this.setState((state) => {
				const newPending = new Map(state.pendingRequests);
				newPending.set(request.id, pending);
				return { ...state, pendingRequests: newPending };
			});

			// 发送权限请求事件
			this.emitEvent({ type: "permission_requested", request });
		});
	}

	// ============ 权限响应 ============

	respondToPermission(response: PermissionResponse) {
		const pending = this.state.pendingRequests.get(response.requestId);
		if (!pending) {
			console.warn("Permission request not found:", response.requestId);
			return;
		}

		const result: PermissionResult = {
			requestId: response.requestId,
			toolCallId: pending.request.toolCallId,
			decision: response.decision,
			decidedBy: response.decidedBy,
			reason: response.reason,
		};

		// 处理"记住选择"
		if (response.rememberForSession || response.rememberForTool) {
			const key = response.rememberForTool
				? `${pending.request.toolType}:${pending.request.toolName}`
				: pending.request.toolType;
			this.setState((state) => {
				const newRemembered = new Map(state.sessionRemembered);
				newRemembered.set(key, response.decision);
				return { ...state, sessionRemembered: newRemembered };
			});
		}

		this.emitEvent({ type: "permission_response", response });
		pending.resolve(result);
	}

	// ============ 取消权限 ============

	cancelPermission(toolCallId: string) {
		for (const [requestId, pending] of this.state.pendingRequests) {
			if (pending.request.toolCallId === toolCallId) {
				if (pending.timeoutId) {
					clearTimeout(pending.timeoutId);
				}
				const result: PermissionResult = {
					requestId,
					toolCallId,
					decision: "denied",
					decidedBy: "aborted",
					reason: "Tool call was cancelled",
				};
				this.setState((state) => {
					const newPending = new Map(state.pendingRequests);
					newPending.delete(requestId);
					return { ...state, pendingRequests: newPending };
				});
				this.addToHistory(pending.request, result);
				this.emitEvent({ type: "permission_result", result });
				break;
			}
		}
	}

	// ============ 辅助方法 ============

	private cleanupPermission(requestId: string) {
		this.setState((state) => {
			const newPending = new Map(state.pendingRequests);
			const pending = newPending.get(requestId);
			if (pending?.timeoutId) {
				clearTimeout(pending.timeoutId);
			}
			newPending.delete(requestId);
			return { ...state, pendingRequests: newPending };
		});
	}

	private addToHistory(request: PermissionRequest, result: PermissionResult) {
		this.setState((state) => ({
			...state,
			history: [
				{ request, result, timestamp: Date.now() },
				...state.history,
			].slice(0, MAX_HISTORY_SIZE),
		}));
	}

	getPendingRequests(): PermissionRequest[] {
		return Array.from(this.state.pendingRequests.values()).map(
			(p) => p.request,
		);
	}

	clearSessionRemembered() {
		this.setState((state) => ({ ...state, sessionRemembered: new Map() }));
	}

	getHistory(limit = 50): PermissionHistoryEntry[] {
		return this.state.history.slice(0, limit);
	}
}

// 单例导出
export const permissionStore = new PermissionStore();

// React Hook
export function usePermissionStore() {
	const state = useSyncExternalStore(
		permissionStore.subscribe,
		permissionStore.getState,
		permissionStore.getState,
	);

	return {
		...state,
		updatePolicy: permissionStore.updatePolicy.bind(permissionStore),
		setToolOverride: permissionStore.setToolOverride.bind(permissionStore),
		removeToolOverride:
			permissionStore.removeToolOverride.bind(permissionStore),
		requestPermission: permissionStore.requestPermission.bind(permissionStore),
		respondToPermission:
			permissionStore.respondToPermission.bind(permissionStore),
		cancelPermission: permissionStore.cancelPermission.bind(permissionStore),
		getPendingRequests:
			permissionStore.getPendingRequests.bind(permissionStore),
		clearSessionRemembered:
			permissionStore.clearSessionRemembered.bind(permissionStore),
		getHistory: permissionStore.getHistory.bind(permissionStore),
		onEvent: permissionStore.onEvent.bind(permissionStore),
	};
}

// 导出便捷函数
export const getPermissionPolicy = () => permissionStore.getState().policy;
export const requestToolPermission =
	permissionStore.requestPermission.bind(permissionStore);
export const respondToToolPermission =
	permissionStore.respondToPermission.bind(permissionStore);
export const cancelToolPermission =
	permissionStore.cancelPermission.bind(permissionStore);
