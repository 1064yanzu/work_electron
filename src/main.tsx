// Inter 本地字体（替代 Google Fonts CDN，消除离线 FOUT）
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./index.css";

const rootEl = document.getElementById("root")!;

// 哈希路由：#/pet → 桌面宠物独立窗口
if (location.hash === "#/pet") {
	// 在最顶层 html 上加标记，让 index.css 切到"宠物窗口模式"：
	// 透明 body / 透明 root / 不裁剪溢出阴影。
	// 必须在 React 渲染前就打上，避免首帧奶油色背景闪过。
	document.documentElement.classList.add("pet-window");
	void import("./bootstrap/renderPetApp").then(({ renderPetApp }) => {
		renderPetApp(rootEl);
	});
} else {
	void import("./bootstrap/renderMainApp").then(({ renderMainApp }) => {
		renderMainApp(rootEl);
	});
}
