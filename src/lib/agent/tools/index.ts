// 工具导出索引

export { browserOpenTool, browserScreenshotTool } from "./browserTools";
export { codeExecuteTool } from "./codeExecute";
export { docCreateTool, docPatchTool, docUpdateTool } from "./docOps";
export { fetchUrlTool } from "./fetchUrl";
export { fileListTool, fileReadTool, fileWriteTool } from "./fileSystem";
export { kbSearchChunksTool } from "./kbSearchChunks";
export { llmCallTool } from "./llmTool";
export { mcpCallToolDef } from "./mcpCall";
export { skillInvokeTool } from "./skillInvoke";
export { webSearchTool } from "./webSearch";

import type { ToolDefinition } from "../types";
import { browserOpenTool, browserScreenshotTool } from "./browserTools";
import { codeExecuteTool } from "./codeExecute";
import { docCreateTool, docPatchTool, docUpdateTool } from "./docOps";
import { fetchUrlTool } from "./fetchUrl";
import { fileListTool, fileReadTool, fileWriteTool } from "./fileSystem";
import { kbSearchChunksTool } from "./kbSearchChunks";
import { llmCallTool } from "./llmTool";
import { mcpCallToolDef } from "./mcpCall";
import { skillInvokeTool } from "./skillInvoke";
import { webSearchTool } from "./webSearch";

// 所有内置工具
export const builtinTools: ToolDefinition[] = [
	webSearchTool,
	kbSearchChunksTool,
	fetchUrlTool,
	docCreateTool,
	docUpdateTool,
	docPatchTool,
	browserOpenTool,
	browserScreenshotTool,
	llmCallTool,
	mcpCallToolDef,
	codeExecuteTool,
	fileReadTool,
	fileWriteTool,
	fileListTool,
	skillInvokeTool,
];
