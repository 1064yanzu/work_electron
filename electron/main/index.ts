import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapApp } from "./app-lifecycle";
import { startFeishuDocxMcpServerFromEnv } from "./remote-control/feishu-docx/mcpStdioServer";
import { createMainWindow } from "./windows/createMainWindow";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 进程级错误兜底：在 logger 初始化之前捕获任何同步/异步异常，写到 stderr + crash.log
// Why：生产环境进程静默退出时，用户完全看不到任何信息
const _crashLogDir = process.env.APPDATA
	? path.join(process.env.APPDATA, "IPO Workbench", "logs")
	: path.join(process.cwd(), "logs");
try {
	fs.mkdirSync(_crashLogDir, { recursive: true });
} catch {}
function _writeCrash(tag: string, err: unknown) {
	const msg = err instanceof Error ? err.stack ?? err.message : String(err);
	const line = `[${new Date().toISOString()}] [${tag}] ${msg}\n`;
	try {
		fs.appendFileSync(path.join(_crashLogDir, "crash.log"), line);
	} catch {}
	process.stderr.write(line);
}
process.on("uncaughtException", (err) => _writeCrash("uncaughtException", err));
process.on("unhandledRejection", (err) => _writeCrash("unhandledRejection", err));

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
	? path.join(process.env.APP_ROOT, "public")
	: RENDERER_DIST;

const REMOTE_FEISHU_DOCX_MCP_ARG = "--remote-feishu-docx-mcp";

const preloadPath = path.join(MAIN_DIST, "index.mjs");

const createWindow = () => {
	const publicDir = process.env.VITE_PUBLIC ?? RENDERER_DIST;
	createMainWindow({
		rendererUrl: VITE_DEV_SERVER_URL,
		rendererDist: RENDERER_DIST,
		publicDir,
		preloadPath,
	});
};

if (process.argv.includes(REMOTE_FEISHU_DOCX_MCP_ARG)) {
	startFeishuDocxMcpServerFromEnv();
} else {
	bootstrapApp({
		createWindow,
		petWindowConfig: {
			preloadPath,
			rendererUrl: VITE_DEV_SERVER_URL,
			rendererDist: RENDERER_DIST,
		},
	}).catch((err) => {
		_writeCrash("bootstrapApp", err);
	});
}
