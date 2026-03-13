/**
 * 会话分叉模块
 * 深拷贝当前会话快照，创建新线程并加载快照，实现会话分叉
 */

import { codingSessionStore } from "../stores/codingSessionStore";
import { codingThreadStore } from "../stores/codingThreadStore";

export interface ForkSessionResult {
	success: boolean;
	newThreadId?: string;
	error?: string;
}

/**
 * 分叉当前会话
 * 1. 保存当前会话快照
 * 2. 深拷贝快照数据
 * 3. 创建新线程（forkedFrom = currentThreadId）
 * 4. 将快照加载到新线程
 * 5. 切换到新线程
 */
export async function forkCurrentSession(
	currentThreadId: string,
	projectPath: string,
): Promise<ForkSessionResult> {
	const currentThread = codingThreadStore.getThread(currentThreadId);
	if (!currentThread) {
		return { success: false, error: "当前线程不存在。" };
	}

	// 1. 保存当前会话快照
	codingSessionStore.saveSnapshot(currentThreadId);

	// 2. 深拷贝快照
	const snapshot = codingSessionStore.getSnapshot(currentThreadId);
	if (!snapshot) {
		return { success: false, error: "无法获取当前会话快照。" };
	}
	const clonedSnapshot = structuredClone(snapshot);

	// 重置克隆快照的运行状态，分叉后的线程应从 idle 开始
	clonedSnapshot.status = "idle";
	clonedSnapshot.streamingMessageId = null;
	clonedSnapshot.pendingPermission = null;
	clonedSnapshot.runId = null;

	// 3. 创建新线程，继承当前线程配置
	const newThread = codingThreadStore.createThread(projectPath, {
		backend: currentThread.backend,
		codingMode: currentThread.codingMode,
		title: `${currentThread.title} (分叉)`,
		model: currentThread.model,
		approvalMode: currentThread.approvalMode,
		workspaceProfileId: currentThread.workspaceProfileId,
		capabilitiesSnapshot: currentThread.capabilitiesSnapshot,
		forkedFrom: currentThreadId,
	});

	// 4. 将深拷贝的快照保存到新线程的快照位置
	// 先暂时切换 store 到新线程快照位置来写入
	codingSessionStore.saveSnapshot(currentThreadId); // 确保当前线程快照最新

	// 手动将克隆快照写入新线程
	// 通过 switchToThread 切换过去，然后设置状态
	codingSessionStore.switchToThread(currentThreadId, newThread.id);

	// switchToThread 会加载新线程快照（首次为空），所以需要手动恢复克隆数据
	// 直接用 store.setState 覆盖
	const { setState } = codingSessionStore;
	setState(() => clonedSnapshot);

	// 5. 保存新线程快照
	codingSessionStore.saveSnapshot(newThread.id);

	// 添加系统消息说明分叉来源
	codingSessionStore.addSystemMessage(
		`已从线程「${currentThread.title}」分叉创建。历史消息和上下文已继承。`,
	);

	// 再次保存（包含系统消息）
	codingSessionStore.saveSnapshot(newThread.id);

	return { success: true, newThreadId: newThread.id };
}
