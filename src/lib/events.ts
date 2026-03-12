type EventCallback = (data: any) => void;

class EventManager {
	private listeners: { [key: string]: EventCallback[] } = {};

	on(event: string, callback: EventCallback) {
		if (!this.listeners[event]) {
			this.listeners[event] = [];
		}
		this.listeners[event].push(callback);
		return () => this.off(event, callback);
	}

	off(event: string, callback: EventCallback) {
		if (!this.listeners[event]) return;
		this.listeners[event] = this.listeners[event].filter(
			(cb) => cb !== callback,
		);
	}

	emit(event: string, data: any) {
		if (!this.listeners[event]) return;
		this.listeners[event].forEach((callback) => callback(data));
	}
}

export const events = new EventManager();

export const EVENTS = {
	// AI 相关
	AI_WRITE_TO_OUTPUT: "AI_WRITE_TO_OUTPUT",
	AI_REQUEST: "AI_REQUEST", // 请求 AI 处理
	REGENERATE_MESSAGE: "REGENERATE_MESSAGE", // 重新生成 AI 回复

	// 资料相关
	OPEN_SOURCE_DETAIL: "OPEN_SOURCE_DETAIL",
	SOURCE_SELECTED: "SOURCE_SELECTED", // 资料被选中（用于上下文）

	// 编辑器相关
	EDITOR_CONTENT_CHANGED: "EDITOR_CONTENT_CHANGED",
	EDITOR_SELECTION_CHANGED: "EDITOR_SELECTION_CHANGED",

	// 三栏互通
	ADD_TO_CONTEXT: "ADD_TO_CONTEXT", // 添加到 AI 上下文
	INSERT_TO_EDITOR: "INSERT_TO_EDITOR", // 插入到编辑器
	APPLY_DIFF: "APPLY_DIFF", // 应用 diff 更改

	// 深度研究相关
	RESEARCH_START: "RESEARCH_START", // 开始研究
	RESEARCH_PROGRESS: "RESEARCH_PROGRESS", // 研究进度更新
	RESEARCH_SOURCE_FOUND: "RESEARCH_SOURCE_FOUND", // 发现新资料
	RESEARCH_COMPLETE: "RESEARCH_COMPLETE", // 研究完成
	RESEARCH_ERROR: "RESEARCH_ERROR", // 研究出错

	// AI 文档编辑协议
	AI_DOC_UPDATE_START: "AI_DOC_UPDATE_START", // AI 开始修改文档
	AI_DOC_UPDATE_STREAM: "AI_DOC_UPDATE_STREAM", // AI 流式输出文档内容
	AI_DOC_UPDATE_END: "AI_DOC_UPDATE_END", // AI 完成文档修改
	AI_DOC_CREATE_START: "AI_DOC_CREATE_START", // AI 开始创建新文档
	AI_DOC_CREATE_END: "AI_DOC_CREATE_END", // AI 完成新文档创建提案

	// Agent 跨面板联动
	AGENT_FOCUS_TOOL_CALL: "AGENT_FOCUS_TOOL_CALL", // 在右侧定位某次工具调用 / 中间运行图聚焦
	OPEN_DIFF_VIEW: "OPEN_DIFF_VIEW", // 在中间面板打开 Diff 视图

	// 远程控制
	REMOTE_CHAT_INJECT: "REMOTE_CHAT_INJECT", // 远程消息注入到 UI 对话
};
