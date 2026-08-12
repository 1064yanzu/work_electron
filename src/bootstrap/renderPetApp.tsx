import React from "react";
import ReactDOM from "react-dom/client";
import { getMotionPreference } from "../lib/config";
import { installRendererErrorReporting } from "../lib/errorReporting";
import { applyMotionPreferenceToDocument } from "../lib/interaction/motionPreference";
import { initGsap } from "../lib/motion";
import { initTtsStore } from "../lib/tts";
import PetApp from "../pet/PetApp";

export function renderPetApp(rootEl: HTMLElement): void {
	document.documentElement.classList.add("pet-window");

	// 桌宠窗口只安装自己需要的最小生命周期，避免加载主窗口的聊天、斜杠命令和工作区订阅。
	installRendererErrorReporting();
	initTtsStore();
	// 桌宠是独立 React root / 独立 document，GSAP 要在这里单独初始化一次。
	initGsap();
	// 动效偏好此前只在主窗口生效，桌宠窗口完全没读过配置；补上之后
	// 「减少动效」才真正覆盖到桌宠的呼吸 / 弹跳 / 粒子。
	void getMotionPreference().then(applyMotionPreferenceToDocument);

	ReactDOM.createRoot(rootEl).render(
		<React.StrictMode>
			<PetApp />
		</React.StrictMode>,
	);
}
