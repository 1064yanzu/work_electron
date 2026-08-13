// CopilotSidebar 共享常量

export const MESSAGE_WINDOW_SIZE = 140;
export const MESSAGE_WINDOW_STEP = 120;
// 流式渲染节流：每次更新都会触发 Markdown 全文重解析 + React 树 diff，
// 16ms（每帧）在长回复尾部会明显掉帧；48ms（约 20fps）对文本流人眼无感，
// 解析成本直接降到 1/3。
export const AGENT_STREAM_UPDATE_INTERVAL_MS = 48;
