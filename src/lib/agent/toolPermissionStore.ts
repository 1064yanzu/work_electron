/**
 * Tool Permission Types and Store
 *
 * 工具权限审批相关的类型定义和状态管理。
 * 参考 Cherry Studio 的 toolPermissions.ts 设计。
 */

/**
 * 权限请求状态
 */
export type ToolPermissionStatus =
	| "pending"
	| "submitting-allow"
	| "submitting-deny"
	| "invoking";

/**
 * 工具权限请求
 */
export interface ToolPermissionRequest {
	id: string;
	runId: string;
	toolName: string;
	toolInput: Record<string, unknown>;
	description?: string;
	status: ToolPermissionStatus;
	createdAt: number;
	expiresAt: number;
}

/**
 * 权限决策
 */
export interface PermissionDecision {
	behavior: "allow" | "deny";
	message?: string;
	updatedInput?: Record<string, unknown>;
}

/**
 * 工具权限存储
 */
class ToolPermissionStore {
	private requests = new Map<string, ToolPermissionRequest>();
	private listeners = new Set<() => void>();
	private resolvers = new Map<string, (decision: PermissionDecision) => void>();

	/**
	 * 添加权限请求
	 */
	addRequest(
		request: Omit<ToolPermissionRequest, "status" | "createdAt" | "expiresAt">,
	): Promise<PermissionDecision> {
		const fullRequest: ToolPermissionRequest = {
			...request,
			status: "pending",
			createdAt: Date.now(),
			expiresAt: Date.now() + 30000, // 30 秒超时
		};

		this.requests.set(request.id, fullRequest);
		this.notifyListeners();

		// 设置超时
		setTimeout(() => {
			if (this.requests.has(request.id)) {
				this.resolveRequest(request.id, {
					behavior: "deny",
					message: "Request timed out",
				});
			}
		}, 30000);

		return new Promise<PermissionDecision>((resolve) => {
			this.resolvers.set(request.id, resolve);
		});
	}

	/**
	 * 解决权限请求
	 */
	resolveRequest(id: string, decision: PermissionDecision): void {
		const request = this.requests.get(id);
		if (!request) return;

		// 更新状态
		request.status = decision.behavior === "allow" ? "invoking" : "pending";
		this.notifyListeners();

		// 调用 resolver
		const resolver = this.resolvers.get(id);
		if (resolver) {
			resolver(decision);
			this.resolvers.delete(id);
		}

		// 清理请求
		setTimeout(() => {
			this.requests.delete(id);
			this.notifyListeners();
		}, 1000);
	}

	/**
	 * 允许请求
	 */
	allowRequest(id: string, updatedInput?: Record<string, unknown>): void {
		const request = this.requests.get(id);
		if (!request) return;

		request.status = "submitting-allow";
		this.notifyListeners();

		this.resolveRequest(id, { behavior: "allow", updatedInput });
	}

	/**
	 * 拒绝请求
	 */
	denyRequest(id: string, message?: string): void {
		const request = this.requests.get(id);
		if (!request) return;

		request.status = "submitting-deny";
		this.notifyListeners();

		this.resolveRequest(id, {
			behavior: "deny",
			message: message || "User denied",
		});
	}

	/**
	 * 获取所有待处理请求
	 */
	getPendingRequests(): ToolPermissionRequest[] {
		return Array.from(this.requests.values()).filter(
			(r) => r.status === "pending",
		);
	}

	/**
	 * 获取请求
	 */
	getRequest(id: string): ToolPermissionRequest | undefined {
		return this.requests.get(id);
	}

	/**
	 * 清理指定运行的所有请求
	 */
	clearByRunId(runId: string): void {
		for (const [id, request] of this.requests) {
			if (request.runId === runId) {
				const resolver = this.resolvers.get(id);
				if (resolver) {
					resolver({ behavior: "deny", message: "Run aborted" });
					this.resolvers.delete(id);
				}
				this.requests.delete(id);
			}
		}
		this.notifyListeners();
	}

	/**
	 * 订阅状态变化
	 */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * 通知监听器
	 */
	private notifyListeners(): void {
		this.listeners.forEach((l) => l());
	}

	/**
	 * 获取快照（用于 React）
	 */
	getSnapshot(): ToolPermissionRequest[] {
		return Array.from(this.requests.values());
	}
}

// 单例实例
export const toolPermissionStore = new ToolPermissionStore();

/**
 * React Hook: useToolPermissions
 */
export function useToolPermissions(): ToolPermissionRequest[] {
	// 在 React 中使用 useSyncExternalStore
	// 这里提供一个简单的实现，实际使用需要配合 React
	return toolPermissionStore.getSnapshot();
}
