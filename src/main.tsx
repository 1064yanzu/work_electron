import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { appQueryClient } from "./lib/query";
import "./index.css";

const rootEl = document.getElementById("root")!;

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
