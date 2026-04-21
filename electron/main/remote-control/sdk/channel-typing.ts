/**
 * Typing indicator 接口
 *
 * 各渠道策略：
 * - feishu: message reaction「Typing」emoji（移植自 openclaw，有 backoff 熔断）
 * - telegram: sendChatAction("typing") —— 6 秒超时，每 5 秒 ping
 * - slack: 无官方 typing API；用 reactions.add 打「typing」（与 feishu 思路一致）
 * - discord: channel.sendTyping() —— 10 秒超时，每 8 秒 ping
 * - qqbot: reaction（C2C 支持不全，做降级）
 * - wechat: 不支持
 */

export interface ChannelTypingSession {
	/** 开启 typing 指示 */
	start(): Promise<void>;
	/** 心跳刷新（某些渠道 typing 有 timeout，需要定时 ping） */
	ping(): Promise<void>;
	/** 关闭 typing */
	stop(): Promise<void>;
	/** 当前是否 active */
	isActive(): boolean;
}

export type ChannelTypingFactory = {
	isEnabled(): boolean;
	/** 针对一个会话 / 一条参考消息开启 typing */
	openSession(params: {
		targetId: string;
		/** 某些渠道（feishu）需要挂在具体 message_id 上 */
		anchorMessageId?: string;
	}): ChannelTypingSession;
};

/**
 * 通用 typing keepalive 工具：间隔调用 ping，直到 stop。
 * 用于 telegram/discord 这类 typing 有 timeout 的平台。
 *
 * source: 借鉴 openclaw qqbot typing-keepalive.ts 的思路
 */
export function startTypingKeepalive(params: {
	session: ChannelTypingSession;
	intervalMs: number;
	log?: (msg: string, error?: unknown) => void;
}): () => void {
	const { session, intervalMs, log } = params;
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const schedule = () => {
		if (stopped) return;
		timer = setTimeout(() => {
			timer = null;
			if (stopped) return;
			session
				.ping()
				.catch((error) => log?.("typing ping failed", error))
				.finally(() => {
					if (!stopped) schedule();
				});
		}, intervalMs);
	};

	// 先启动，再进入心跳循环
	session
		.start()
		.then(() => {
			if (!stopped) schedule();
		})
		.catch((error) => log?.("typing start failed", error));

	return () => {
		stopped = true;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		session.stop().catch((error) => log?.("typing stop failed", error));
	};
}
