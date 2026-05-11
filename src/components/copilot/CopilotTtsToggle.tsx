/**
 * CopilotTtsToggle — 侧边栏头部的「对话朗读」快速开关。
 *
 * 三态：
 *  - 关闭 / 未启用场景 → 灰色 VolumeX 图标
 *  - 已启用但未在播 → 主色 Volume2 图标
 *  - 正在播 → 动效 + 点击立即静音（stop 并关 auto）
 *
 * 点击行为：
 *  - 关闭 → 打开 scene_chat_enabled + scene_chat_auto
 *  - 已开启 → 关闭 scene_chat_auto（保留"场景可朗读"，方便手动点朗读按钮）
 *    并立即 stopTts / cancelChatAutoSpeak，实现"一键静音"
 */

import { Volume2, VolumeX } from "lucide-react";
import { useCallback } from "react";
import {
	cancelChatAutoSpeak,
	updateTtsSettings,
	useTtsStoreSelector,
} from "../../lib/tts";
import { IconButton } from "../ui/Button";

export function CopilotTtsToggle() {
	const settings = useTtsStoreSelector((s) => s.settings);
	const status = useTtsStoreSelector((s) => s.status);
	const scope = useTtsStoreSelector((s) => s.scope);

	const enabled = !!settings?.scene_chat_enabled;
	const auto = !!settings?.scene_chat_auto;
	const isSpeaking =
		scope === "chat" && (status === "playing" || status === "loading");

	const handleClick = useCallback(() => {
		if (!settings) return;
		if (auto && enabled) {
			// 一键静音：关自动播报 + 立即停
			cancelChatAutoSpeak();
			void updateTtsSettings({ scene_chat_auto: false });
		} else {
			// 一键开启：确保场景启用 + 自动播报开
			void updateTtsSettings({
				scene_chat_enabled: true,
				scene_chat_auto: true,
			});
		}
	}, [settings, auto, enabled]);

	if (!settings) return null;

	const active = auto && enabled;
	const Icon = active ? Volume2 : VolumeX;
	const title = active
		? isSpeaking
			? "正在朗读，点击静音"
			: "对话自动朗读已开启，点击静音"
		: "对话自动朗读已关闭，点击开启";

	return (
		<IconButton
			onClick={handleClick}
			aria-label={title}
			title={title}
			variant="ghost"
			size="sm"
		>
			<Icon
				className={`w-4 h-4 ${active ? "text-text-primary" : "text-text-muted"} ${
					isSpeaking ? "animate-pulse" : ""
				}`}
				strokeWidth={1.5}
			/>
		</IconButton>
	);
}
