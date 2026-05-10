/**
 * Claude Code 风格斜杠命令 —— Fork 意图存储（内存态）。
 *
 * 任务：T3.7。
 *
 * 场景：
 * - 用户执行 `/fork` 时，本特性创建一条新 session 并深拷贝原消息列表；
 * - 新 session 的 `sdkSessionId` 保持 `undefined`，等用户下一次提交消息时，
 *   `useAgentHandler` 读取这里登记的 `baseSdkSessionId` 并在 `AgentStartPayload`
 *   中注入 `fork_session=true, resume_session_at=<base>`；
 * - 读取后应立即清除，保证只对"下一次提交"生效，之后回归普通提交链路。
 *
 * 约束：
 * - **内存态**：不持久化，应用关闭后丢失（与 design 的 "fork 一次性 intent" 约定一致）；
 * - 不依赖 React / DOM，可被任意层消费；
 * - 线程安全靠 JS 单线程保证，无需额外锁。
 */

// ---------------------------------------------------------------------------
// 内部 Map
// ---------------------------------------------------------------------------

/**
 * `sessionId` → `baseSdkSessionId`；
 * - `sessionId`：新创建的 fork 会话 id（`ChatSession.id`）。
 * - `baseSdkSessionId`：原会话的 `sdkSessionId`，用作 `resume_session_at` 基准。
 */
const pendingForks = new Map<string, string>();

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 登记一次 fork 意图。
 *
 * - 同一 `sessionId` 多次登记 → 覆盖为最新 `baseSdkSessionId`（极端情况下用户
 *   快速连续 `/fork`，以最新一次为准）；
 * - `baseSdkSessionId` 为空串时视作清除。
 */
export function markFork(sessionId: string, baseSdkSessionId: string): void {
	if (!sessionId) return;
	if (!baseSdkSessionId) {
		pendingForks.delete(sessionId);
		return;
	}
	pendingForks.set(sessionId, baseSdkSessionId);
}

/**
 * 取走某会话的 fork 意图；**取后即删**，保证只对下一次提交生效。
 *
 * 返回 `undefined` 表示没有登记过。
 */
export function takeFork(sessionId: string): string | undefined {
	if (!sessionId) return undefined;
	const base = pendingForks.get(sessionId);
	if (base !== undefined) pendingForks.delete(sessionId);
	return base;
}

/**
 * 仅查看而不取走；供单元测试或调试使用。
 *
 * 生产代码应当使用 {@link takeFork}，以保证"一次性"语义不被破坏。
 */
export function peekFork(sessionId: string): string | undefined {
	return pendingForks.get(sessionId);
}

/**
 * 清除某会话的 fork 意图（例如用户主动放弃该 fork）。
 */
export function clearFork(sessionId: string): void {
	pendingForks.delete(sessionId);
}

/**
 * @internal 仅供测试重置。
 */
export function __resetForkIntentForTests(): void {
	pendingForks.clear();
}
