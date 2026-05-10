/**
 * 把 TTS 播放和聊天生命周期绑起来。
 *
 * 触发时机：
 *  - 切换 activeSession → 清当前播放 + 清已播集合（新会话重新开始）
 *  - 窗口隐藏（visibilitychange） → 暂停，避免后台继续念
 *  - 窗口关闭 / 卸载 → 停
 *
 * 安装一次即可，幂等。
 */

import { chatStore } from "../chat/store";
import { cancelChatAutoSpeak, resetChatAutoSpeak } from "./chatAutoSpeak";
import { pauseTts, resumeTts, ttsStore } from "./ttsStore";

let installed = false;

export function installChatTtsLifecycle(): void {
	if (installed) return;
	installed = true;

	// 1) 会话切换 → 清当前 + 清已播集合
	let lastActiveId: string | null = chatStore.getState().activeSessionId;
	chatStore.subscribe(() => {
		const nextId = chatStore.getState().activeSessionId;
		if (nextId !== lastActiveId) {
			lastActiveId = nextId;
			resetChatAutoSpeak();
		}
	});

	// 2) 窗口可见性 → 隐藏则暂停，恢复则继续（仅当之前是 playing）
	let wasPlayingBeforeHide = false;
	if (typeof document !== "undefined") {
		document.addEventListener("visibilitychange", () => {
			const status = ttsStore.getState().status;
			if (document.hidden) {
				if (status === "playing") {
					wasPlayingBeforeHide = true;
					pauseTts();
				}
			} else {
				if (wasPlayingBeforeHide) {
					wasPlayingBeforeHide = false;
					resumeTts();
				}
			}
		});
	}

	// 3) 卸载：stop 所有队列
	if (typeof window !== "undefined") {
		window.addEventListener("beforeunload", () => {
			cancelChatAutoSpeak();
		});
	}
}
