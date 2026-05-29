import React from "react";
import ReactDOM from "react-dom/client";
import { installRendererErrorReporting } from "../lib/errorReporting";
import { initTtsStore } from "../lib/tts";
import PetApp from "../pet/PetApp";

export function renderPetApp(rootEl: HTMLElement): void {
	document.documentElement.classList.add("pet-window");

	// 桌宠窗口只安装自己需要的最小生命周期，避免加载主窗口的聊天、斜杠命令和工作区订阅。
	installRendererErrorReporting();
	initTtsStore();

	ReactDOM.createRoot(rootEl).render(
		<React.StrictMode>
			<PetApp />
		</React.StrictMode>,
	);
}
