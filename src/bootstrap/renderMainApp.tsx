import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "../App";
import { installRendererErrorReporting } from "../lib/errorReporting";
import { initGsap } from "../lib/motion";
import { installLongtaskReporting } from "../lib/perf/longtaskReporting";
import { appQueryClient } from "../lib/query";
import { registerBuiltinSlashCommands } from "../lib/slashCommands";
import { installThreadPathSync } from "../lib/syncThreadPath";
import { initTtsStore, installChatTtsLifecycle } from "../lib/tts";

export function renderMainApp(rootEl: HTMLElement): void {
	// 渲染端全局错误收口（IPC 推给主进程 winston）。生产剥除 console.log 后的兵底排查通道。
	installRendererErrorReporting();
	// M0.2：渲染端 longtask 观测，每分钟汇总一次写入 perf_events
	installLongtaskReporting();
	// GSAP 单例初始化（注册插件 / 项目 ease / ticker 兜底）。必须在任何组件
	// 建立动画之前完成，见 src/lib/motion/gsapCore.ts。
	initGsap();

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
