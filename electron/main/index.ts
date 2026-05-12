import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 进程级错误兜底 — 必须在任何业务 import 之前注册
const _crashLogDir = process.env.APPDATA
  ? path.join(process.env.APPDATA, "IPO Workbench", "logs")
  : path.join(process.cwd(), "logs");
try {
  fs.mkdirSync(_crashLogDir, { recursive: true });
} catch {}
function _writeCrash(tag: string, err: unknown) {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const line = `[${new Date().toISOString()}] [${tag}] ${msg}\n`;
  try {
    fs.appendFileSync(path.join(_crashLogDir, "crash.log"), line);
  } catch {}
  process.stderr.write(line);
}
process.on("uncaughtException", (err) => _writeCrash("uncaughtException", err));
process.on("unhandledRejection", (err) =>
  _writeCrash("unhandledRejection", err),
);

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

const REMOTE_FEISHU_DOCX_MCP_ARG = "--remote-feishu-docx-mcp";
const preloadPath = path.join(MAIN_DIST, "index.mjs");

// 业务逻辑全部放在动态导入的 IIFE 里，确保 crash handler 先生效
(async () => {
  if (process.argv.includes(REMOTE_FEISHU_DOCX_MCP_ARG)) {
    const { startFeishuDocxMcpServerFromEnv } =
      await import("./remote-control/feishu-docx/mcpStdioServer");
    startFeishuDocxMcpServerFromEnv();
    return;
  }

  const [{ bootstrapApp }, { createMainWindow }] = await Promise.all([
    import("./app-lifecycle"),
    import("./windows/createMainWindow"),
  ]);

  const publicDir = process.env.VITE_PUBLIC ?? RENDERER_DIST;
  const createWindow = () =>
    createMainWindow({
      rendererUrl: VITE_DEV_SERVER_URL,
      rendererDist: RENDERER_DIST,
      publicDir,
      preloadPath,
    });

  await bootstrapApp({
    createWindow,
    petWindowConfig: {
      preloadPath,
      rendererUrl: VITE_DEV_SERVER_URL,
      rendererDist: RENDERER_DIST,
    },
  });
})().catch((err) => {
  _writeCrash("bootstrap", err);
  process.exit(1);
});
