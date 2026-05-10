import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { appQueryClient } from "./lib/query";
import { initTtsStore, installChatTtsLifecycle } from "./lib/tts";
import { installThreadPathSync } from "./lib/syncThreadPath";
import { registerBuiltinSlashCommands } from "./lib/slashCommands";
import "./index.css";

const rootEl = document.getElementById("root")!;

// 启动时预加载一次 TTS 设置（主窗口 / 桌宠窗口都用到）
initTtsStore();

// 将 TTS 播放与会话生命周期挂钩：切换会话 / 窗口隐藏 / 卸载时自动停
installChatTtsLifecycle();

// 把当前线程的 cwd 同步到 workspaceStore，让左边栏 FILES 面板能跟随当前线程
installThreadPathSync();

// Claude Code 斜杠命令：启动时注入内置命令（幂等，防重复）
registerBuiltinSlashCommands();

// 哈希路由：#/pet → 桌面宠物独立窗口
if (location.hash === "#/pet") {
	// 在最顶层 html 上加标记，让 index.css 切到"宠物窗口模式"：
	// 透明 body / 透明 root / 不裁剪溢出阴影。
	// 必须在 React 渲染前就打上，避免首帧奶油色背景闪过。
	document.documentElement.classList.add("pet-window");
	void import("./pet/PetApp").then(({ default: PetApp }) => {
		ReactDOM.createRoot(rootEl).render(
			<React.StrictMode>
				<PetApp />
			</React.StrictMode>,
		);
	});
} else {
	ReactDOM.createRoot(rootEl).render(
		<React.StrictMode>
			<QueryClientProvider client={appQueryClient}>
				<App />
			</QueryClientProvider>
		</React.StrictMode>,
	);
}
