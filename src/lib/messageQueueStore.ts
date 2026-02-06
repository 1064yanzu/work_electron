// 消息队列状态管理
// 用于管理 Agent 执行中用户发送的待处理消息

import { useSyncExternalStore } from "react";
import type { SlashCommand } from "../components/chat/SlashCommand";
import type { ContextItem } from "./workspaceStore";

// 队列中的消息
export interface QueuedMessage {
	id: string;
	content: string;
	command?: SlashCommand;
	contexts: ContextItem[];
	queuedAt: number;
}

// 消息队列状态
interface MessageQueueState {
	queue: QueuedMessage[];
}

const initialState: MessageQueueState = {
	queue: [],
};

class MessageQueueStore {
	private state: MessageQueueState = initialState;
	private listeners: Set<() => void> = new Set();

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

	private setState(updater: (state: MessageQueueState) => MessageQueueState) {
		this.state = updater(this.state);
		this.emit();
	}

	// 添加消息到队列
	enqueue(message: Omit<QueuedMessage, "id" | "queuedAt">) {
		const id = crypto.randomUUID();
		const queuedMessage: QueuedMessage = {
			...message,
			id,
			queuedAt: Date.now(),
		};

		this.setState((state) => ({
			...state,
			queue: [...state.queue, queuedMessage],
		}));

		console.log("[MessageQueue] 消息入队:", {
			id,
			content: message.content.slice(0, 50),
			queueLength: this.state.queue.length,
		});

		return id;
	}

	// 取出队首消息
	dequeue(): QueuedMessage | null {
		const first = this.state.queue[0];
		if (!first) return null;

		this.setState((state) => ({
			...state,
			queue: state.queue.slice(1),
		}));

		console.log("[MessageQueue] 消息出队:", {
			id: first.id,
			content: first.content.slice(0, 50),
			remainingLength: this.state.queue.length,
		});

		return first;
	}

	// 查看队首消息（不移除）
	peek(): QueuedMessage | null {
		return this.state.queue[0] || null;
	}

	// 移除指定消息
	remove(id: string): boolean {
		const index = this.state.queue.findIndex((m) => m.id === id);
		if (index === -1) return false;

		this.setState((state) => ({
			...state,
			queue: state.queue.filter((m) => m.id !== id),
		}));

		console.log("[MessageQueue] 消息移除:", { id });
		return true;
	}

	// 清空队列
	clear() {
		const count = this.state.queue.length;
		this.setState((state) => ({
			...state,
			queue: [],
		}));

		console.log("[MessageQueue] 队列已清空, 移除", count, "条消息");
	}

	// 获取队列长度
	get length(): number {
		return this.state.queue.length;
	}

	// 检查队列是否为空
	get isEmpty(): boolean {
		return this.state.queue.length === 0;
	}
}

// 全局单例
export const messageQueueStore = new MessageQueueStore();

// React Hook
export function useMessageQueueStore() {
	const state = useSyncExternalStore(
		messageQueueStore.subscribe,
		messageQueueStore.getState,
	);

	return {
		queue: state.queue,
		queueLength: state.queue.length,
		isEmpty: state.queue.length === 0,
		enqueue: messageQueueStore.enqueue.bind(messageQueueStore),
		dequeue: messageQueueStore.dequeue.bind(messageQueueStore),
		peek: messageQueueStore.peek.bind(messageQueueStore),
		remove: messageQueueStore.remove.bind(messageQueueStore),
		clear: messageQueueStore.clear.bind(messageQueueStore),
	};
}
