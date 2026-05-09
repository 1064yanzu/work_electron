import { chatStore } from "./chat/store";
import { resolveThreadWorkingDirectory } from "./chat/threadSessions";
import { sessionStore } from "./agent/sessionManager";
import { workspaceStore } from "./workspaceStore";

let installed = false;

function pickActiveSession() {
	const state = chatStore.getState();
	if (!state.activeSessionId) return null;
	return (
		state.sessions.find((session) => session.id === state.activeSessionId) ||
		null
	);
}

function syncFromActiveSession() {
	const session = pickActiveSession();
	if (!session) {
		workspaceStore.setCurrentThreadScope(null, null);
		return;
	}
	const cwd = resolveThreadWorkingDirectory(session) ?? null;
	workspaceStore.setCurrentThreadScope(cwd, session.title ?? null);
}

/**
 * 把"当前线程的工作目录"同步到 workspaceStore.currentThreadPath。
 *
 * 触发时机：
 *  - chatStore 任何变化（含 activeSessionId、session.cwd、agentSessionId 写入）
 *  - sessionStore 变化（agentSession.cwd 兜底链）
 *
 * 这样左边栏 FILES 面板能立即跟随当前线程，不再依赖 SandboxWorkspace
 * 是否挂载或 sandboxDir 是否解析成功。
 */
export function installThreadPathSync() {
	if (installed) return;
	installed = true;

	syncFromActiveSession();
	chatStore.subscribe(syncFromActiveSession);
	sessionStore.subscribe(syncFromActiveSession);
}
