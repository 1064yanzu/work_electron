/**
 * Sequential queue —— 按 key 串行执行异步任务
 * 移植自 openclaw: openclaw-main/extensions/feishu/src/sequential-queue.ts
 *
 * 用途：保证同一个会话的多个出站任务（例如 send 1, send 2, send 3）
 * 严格按顺序送达，不会因为并发而乱序。
 */

export type SequentialQueue = (
	key: string,
	task: () => Promise<void>,
) => Promise<void>;

export function createSequentialQueue(): SequentialQueue {
	const queues = new Map<string, Promise<void>>();

	return (key: string, task: () => Promise<void>): Promise<void> => {
		const previous = queues.get(key) ?? Promise.resolve();
		const next = previous.then(task, task);
		queues.set(key, next);
		const cleanup = () => {
			if (queues.get(key) === next) {
				queues.delete(key);
			}
		};
		next.then(cleanup, cleanup);
		return next;
	};
}
