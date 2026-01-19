/**
 * Session Management
 *
 * Agent 会话管理模块。
 * 支持会话保存、恢复和多目录访问。
 */

import { invoke } from "../tauriCompat";

/**
 * 会话状态
 */
export interface AgentSession {
	id: string;
	createdAt: number;
	lastActiveAt: number;
	status: "active" | "paused" | "completed" | "error";

	// 配置
	model: string;
	systemPrompt?: string;
	permissionMode: string;

	// 访问目录
	cwd: string;
	additionalDirectories?: string[];

	// 统计
	turnCount: number;
	tokenCount?: number;

	// 元数据
	title?: string;
	description?: string;
}

/**
 * 会话恢复信息
 */
export interface SessionResumeInfo {
	sessionId: string;
	lastMessageId?: string;
}

/**
 * 可访问目录配置
 */
export interface AccessiblePathsConfig {
	/** 主工作目录 */
	cwd: string;
	/** 额外可访问目录（最多 10 个） */
	additionalDirectories?: string[];
}

/**
 * 会话存储
 */
class SessionStore {
	private sessions = new Map<string, AgentSession>();
	private currentSessionId: string | null = null;
	private listeners = new Set<() => void>();

	constructor() {
		this.loadFromStorage();
	}

	/**
	 * 创建新会话
	 */
	createSession(config: {
		model: string;
		cwd: string;
		systemPrompt?: string;
		permissionMode?: string;
		additionalDirectories?: string[];
	}): AgentSession {
		const session: AgentSession = {
			id: crypto.randomUUID(),
			createdAt: Date.now(),
			lastActiveAt: Date.now(),
			status: "active",
			model: config.model,
			cwd: config.cwd,
			systemPrompt: config.systemPrompt,
			permissionMode: config.permissionMode || "acceptEdits",
			additionalDirectories: config.additionalDirectories,
			turnCount: 0,
		};

		this.sessions.set(session.id, session);
		this.currentSessionId = session.id;
		this.saveToStorage();
		this.notifyListeners();

		return session;
	}

	/**
	 * 获取当前会话
	 */
	getCurrentSession(): AgentSession | null {
		if (!this.currentSessionId) return null;
		return this.sessions.get(this.currentSessionId) || null;
	}

	/**
	 * 设置当前会话
	 */
	setCurrentSession(sessionId: string | null): void {
		this.currentSessionId = sessionId;
		this.notifyListeners();
	}

	/**
	 * 更新会话
	 */
	updateSession(sessionId: string, updates: Partial<AgentSession>): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;

		Object.assign(session, updates, { lastActiveAt: Date.now() });
		this.saveToStorage();
		this.notifyListeners();
	}

	/**
	 * 暂停会话
	 */
	pauseSession(sessionId: string): void {
		this.updateSession(sessionId, { status: "paused" });
	}

	/**
	 * 恢复会话
	 */
	async resumeSession(sessionId: string): Promise<SessionResumeInfo | null> {
		const session = this.sessions.get(sessionId);
		if (!session) return null;

		this.updateSession(sessionId, { status: "active" });
		this.currentSessionId = sessionId;

		return {
			sessionId: session.id,
		};
	}

	/**
	 * 完成会话
	 */
	completeSession(sessionId: string): void {
		this.updateSession(sessionId, { status: "completed" });
		if (this.currentSessionId === sessionId) {
			this.currentSessionId = null;
		}
	}

	/**
	 * 删除会话
	 */
	deleteSession(sessionId: string): void {
		this.sessions.delete(sessionId);
		if (this.currentSessionId === sessionId) {
			this.currentSessionId = null;
		}
		this.saveToStorage();
		this.notifyListeners();
	}

	/**
	 * 获取所有会话
	 */
	getAllSessions(): AgentSession[] {
		return Array.from(this.sessions.values()).sort(
			(a, b) => b.lastActiveAt - a.lastActiveAt,
		);
	}

	/**
	 * 获取可恢复的会话
	 */
	getResumableSessions(): AgentSession[] {
		return this.getAllSessions().filter(
			(s) => s.status === "active" || s.status === "paused",
		);
	}

	/**
	 * 增加对话轮次
	 */
	incrementTurnCount(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.turnCount++;
			session.lastActiveAt = Date.now();
			this.saveToStorage();
		}
	}

	/**
	 * 保存到本地存储
	 */
	private saveToStorage(): void {
		try {
			const data = {
				sessions: Array.from(this.sessions.values()),
				currentSessionId: this.currentSessionId,
			};
			localStorage.setItem("agent_sessions", JSON.stringify(data));
		} catch (e) {
			console.error("Failed to save sessions to storage:", e);
		}
	}

	/**
	 * 从本地存储加载
	 */
	private loadFromStorage(): void {
		try {
			const data = localStorage.getItem("agent_sessions");
			if (data) {
				const parsed = JSON.parse(data);
				if (Array.isArray(parsed.sessions)) {
					for (const session of parsed.sessions) {
						this.sessions.set(session.id, session);
					}
				}
				this.currentSessionId = parsed.currentSessionId || null;
			}
		} catch (e) {
			console.error("Failed to load sessions from storage:", e);
		}
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
	 * 清理过期会话（超过 7 天的已完成会话）
	 */
	cleanupOldSessions(): void {
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

		for (const [id, session] of this.sessions) {
			if (
				session.status === "completed" &&
				session.lastActiveAt < sevenDaysAgo
			) {
				this.sessions.delete(id);
			}
		}

		this.saveToStorage();
		this.notifyListeners();
	}
}

// 单例实例
export const sessionStore = new SessionStore();

/**
 * 验证目录路径
 */
export async function validateDirectory(
	path: string,
): Promise<{ valid: boolean; error?: string }> {
	try {
		const exists = await invoke<boolean>("path_exists", { path });
		if (!exists) {
			return { valid: false, error: "目录不存在" };
		}

		const isDir = await invoke<boolean>("is_directory", { path });
		if (!isDir) {
			return { valid: false, error: "路径不是目录" };
		}

		return { valid: true };
	} catch (e) {
		return { valid: false, error: String(e) };
	}
}

/**
 * 构建多目录访问配置
 */
export function buildAccessiblePaths(
	cwd: string,
	additionalDirectories?: string[],
): AccessiblePathsConfig {
	const config: AccessiblePathsConfig = { cwd };

	if (additionalDirectories && additionalDirectories.length > 0) {
		// 最多 10 个额外目录
		config.additionalDirectories = additionalDirectories.slice(0, 10);
	}

	return config;
}
