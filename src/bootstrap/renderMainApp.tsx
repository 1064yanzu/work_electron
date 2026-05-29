import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "../App";
import { installRendererErrorReporting } from "../lib/errorReporting";
import { appQueryClient } from "../lib/query";
import { registerBuiltinSlashCommands } from "../lib/slashCommands";
import { installThreadPathSync } from "../lib/syncThreadPath";
import { initTtsStore, installChatTtsLifecycle } from "../lib/tts";

export function renderMainApp(rootEl: HTMLElement): void {
	// 渲染端全局错误收口（IPC 推给主进程 winston）。生产剥离 console.log 后的兜底排查通道。
	installRendererErrorReporting();

	// 主窗口生命周期：TTS 设置预热、聊天生命周期、线程 cwd 同步、内置斜杠命令注入。
	initTtsStore();
	installChatTtsLifecycle();
	installThreadPathSync();
	registerBuiltinSlashCommands();

	ReactDOM.createRoot(rootEl).render(
		<React.StrictMode>
			<QueryClientProvider client={appQueryClient}>
				<App />
			</QueryClientProvider>
		</React.StrictMode>,
	);
}
