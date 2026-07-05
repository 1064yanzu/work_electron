/**
 * IPC 注册器
 * 整合所有 handlers 并注册到 ipcMain
 */
import { performance } from "node:perf_hooks";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { app, ipcMain, screen, shell } from "electron";
import type { IPCSchema } from "../../shared/ipc-schema";
import { pickPetLineFromPool } from "../../shared/petPersonality";
import type { DbContext } from "../db/client";
import type { HttpStatus } from "../http/start";
import { searchChunks } from "../kb/searchChunks";
import { recordPerfEventsBatch } from "../services/perfEvents";
import {
  invokeLlm,
  invokeLlmStream,
  invokeImageGeneration,
} from "../llm/invoke";
import { llmStreamRegistry } from "../llm/streamRegistry";
import type { Logger } from "../logging/types";
import {
  createAgentMemoryExtendedHandlers,
  createAgentMessageHandlers,
  createAgentNodeHandlers,
  createAgentSessionHandlers,
  createAgentTaskHandlers,
  createAgentToolCallHandlers,
} from "./handlers/agent";
import { createConfigHandlers } from "./handlers/config";
import { createActivityHandlers } from "./handlers/activity";
import { createBrowserSearchHandlers } from "./handlers/browserSearch";
import { createExaMcpHandlers } from "./handlers/exaMcp";
import { createCardHandlers } from "./handlers/cards";
import { createChatHistoryHandlers } from "./handlers/chatHistory";
import { createFolderHandlers } from "./handlers/folders";
import { createImportExportHandlers } from "./handlers/import-export";
import { createAgentSdkHandlers } from "./handlers/agentSdk";
import { createAgentSandboxHandlers } from "./handlers/agentSandbox";
import { createDocumentHandlers } from "./handlers/documents";
import { createContentIngestHandlers } from "./handlers/contentIngest";
import { createModelDiscoveryHandlers } from "./handlers/modelDiscovery";
import { createFsSafeHandlers } from "./handlers/fsSafe";
import { createTempFileHandlers } from "./handlers/tempFiles";
import { createKbEmbeddingHandlers } from "./handlers/kbEmbeddings";
import { createDataStatsHandlers } from "./handlers/dataStats";
import { createMcpHandlers } from "./handlers/mcp";
import { createNoteHandlers } from "./handlers/notes";
import { createOutputHandlers } from "./handlers/outputs";
import { createProjectHandlers } from "./handlers/projects";
import { createProviderHandlers } from "./handlers/providers";
import { createSkillsHandlers } from "./handlers/skills";
import { createSkillsMarketplaceHandlers } from "./handlers/skillsMarketplace";
import { createSourceHandlers } from "./handlers/sources";
import { createSyncHandlers } from "./handlers/sync";
import { createSystemHandlers } from "./handlers/system";
import { createLogsHandlers } from "./handlers/logs";
import { createPerfHandlers } from "./handlers/perf";
import { createUserDataJanitorHandlers } from "./handlers/userDataJanitor";
import { createAgentRetentionHandlers } from "./handlers/agentRetention";
import { createWebContentHandlers } from "./handlers/webContent";
import { createArtifactHandlers } from "./handlers/artifacts";
import { createAgentCheckpointHandlers } from "./handlers/agentCheckpoint";
import { createLocalBackupHandlers } from "./handlers/localBackup";
import { createImageGenHandlers } from "./handlers/imageGen";
import { createStorageHandlers } from "./handlers/storage";
import { createCacheRootHandlers } from "./handlers/cacheRoot";
import { createFileHandlers } from "./handlers/files";
import { createRemoteControlHandlers } from "./handlers/remoteControl";
import { getRemoteControlOrchestrator } from "../remote-control/core/service";
import { createCloudNodeHandlers } from "./handlers/cloudNode";
import { getCloudNodeClient } from "../cloud-node/service";
import { createTerminalHandlers } from "./handlers/terminal";
import { createWorktreeHandlers } from "./handlers/worktree";
import { createWikiHandlers } from "./handlers/wiki";
import { createWikiGenerationHandlers } from "./handlers/wikiGeneration";
import { createPetWindowHandlers } from "./handlers/petWindow";
import { createCustomMascotHandlers } from "./handlers/customMascot";
import {
  createStyleProfileCrudHandlers,
  createStyleSampleHandlers,
  createStyleAnalyzerHandlersV2,
  createStyleAnalysisCrudHandlers,
  createStyleRendererHandlersV2,
  createStyleFeedbackHandlers,
  createStyleRecipeCrudHandlers,
} from "./handlers/styleProfile";
import {
  bindMainWindowGetter,
  flingAndSnapPetWindow,
  focusMainWindow as petFocusMainWindow,
  getMascotBroadcastTargets,
  getPetWindow,
  sendChatToMainWindow as petSendChat,
  setPetWindowPosition,
} from "../services/petWindowService";
import { createPreviewServerHandlers } from "./handlers/previewServer";
import { createReaderHandlers } from "./handlers/reader";
import { createTtsHandlers } from "./handlers/tts";
import { createSlashCommandsHandlers } from "./handlers/slashCommands";
import { createUpdateHandlers } from "./handlers/update";
import {
  setFileWatcherMainWindow,
  startWatching,
  stopWatching,
} from "../services/fileWatcherService";
import { isMainWindowForeground } from "../windows/mainWindowFocusState";
import { sendToLiveWebContents } from "../utils/safeWebContentsSend";

type IpcHandler<K extends keyof IPCSchema> = (
  event: IpcMainInvokeEvent,
  input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

// 主窗口引用，用于流式输出
let mainWindowRef: BrowserWindow | null = null;
let cleanupMainWindowFocusTracking: (() => void) | null = null;

function broadcastMainWindowFocusState() {
  const payload = { focused: isMainWindowForeground(mainWindowRef) };
  for (const win of getMascotBroadcastTargets()) {
    sendToLiveWebContents(win, "main-window-focus-changed", payload);
  }
}

function bindMainWindowFocusTracking(window: BrowserWindow | null) {
  cleanupMainWindowFocusTracking?.();
  cleanupMainWindowFocusTracking = null;
  if (!window || window.isDestroyed()) {
    broadcastMainWindowFocusState();
    return;
  }

  const emitSoon = () => {
    setTimeout(broadcastMainWindowFocusState, 0);
  };
  const events = [
    "focus",
    "blur",
    "show",
    "hide",
    "minimize",
    "restore",
  ] as const;
  for (const eventName of events) {
    (window as any).on(eventName, emitSoon);
  }
  cleanupMainWindowFocusTracking = () => {
    for (const eventName of events) {
      (window as any).off(eventName, emitSoon);
    }
  };
  emitSoon();
}

export function setMainWindow(window: BrowserWindow | null) {
  mainWindowRef = window;
  // 同步传递给远程控制编排器，让远程消息可以注入到前端 UI
  try {
    getRemoteControlOrchestrator().setMainWindow(window);
  } catch {
    // orchestrator 可能尚未初始化，忽略
  }
  try {
    if (window) getCloudNodeClient();
  } catch {
    // cloud node client 可能尚未初始化，忽略
  }
  // 同步传递给文件监听服务
  setFileWatcherMainWindow(window);
  // 让 PetWindowService 能广播给主窗口
  bindMainWindowGetter(() => mainWindowRef);
  bindMainWindowFocusTracking(window);
}

// B11：IPC 统一包装层
// - 错误归一：不改变 error 本身（原样 rethrow），只在旁路加一条带 channel 前缀的日志，
//   避免改变渲染端对 error.message 的现有匹配逻辑。
// - 慢调用观测：>100ms 的调用计入内存环形缓冲区，每分钟批量 flush 到 perf_events（kind='slow_ipc'）。
const SLOW_IPC_THRESHOLD_MS = 100;
const SLOW_IPC_RING_LIMIT = 500;
const slowIpcRingBuffer: Array<{
  channel: string;
  durationMs: number;
  ts: number;
}> = [];

function recordSlowIpcCall(channel: string, durationMs: number): void {
  slowIpcRingBuffer.push({ channel, durationMs, ts: Date.now() });
  if (slowIpcRingBuffer.length > SLOW_IPC_RING_LIMIT) {
    slowIpcRingBuffer.splice(0, slowIpcRingBuffer.length - SLOW_IPC_RING_LIMIT);
  }
}

let slowIpcFlushTimer: ReturnType<typeof setInterval> | null = null;

function startSlowIpcFlush(db: DbContext, logger: Logger): void {
  if (slowIpcFlushTimer) clearInterval(slowIpcFlushTimer);
  slowIpcFlushTimer = setInterval(() => {
    if (slowIpcRingBuffer.length === 0) return;
    const batch = slowIpcRingBuffer.splice(0, slowIpcRingBuffer.length);
    void recordPerfEventsBatch(
      db,
      batch.map((entry) => ({
        ts: entry.ts,
        kind: "slow_ipc",
        name: entry.channel,
        durationMs: entry.durationMs,
      })),
      logger,
    ).catch(() => {});
  }, 60_000);
  slowIpcFlushTimer.unref?.();
}

/**
 * 替代直接调用 `ipcMain.handle()` 的包装函数（机械替换了全部 375 处调用点）。
 * 为保持与原 375 个调用点完全兼容（它们中有的传 `satisfies IpcHandler<K>` 表达式，
 * 有的直接传 handler 对象的方法引用），这里故意保持与 `ipcMain.handle` 自己的类型声明
 * 一样宽松（event + 任意参数），避免引入新的类型错误。
 */
function handle(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any,
): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: any[]) => {
    const startedAt = performance.now();
    try {
      return await fn(event, ...args);
    } catch (err) {
      registeredLogger?.error({
        msg: `[ipc:${channel}] ${err instanceof Error ? err.message : String(err)}`,
        channel,
      });
      throw err;
    } finally {
      const durationMs = performance.now() - startedAt;
      if (durationMs > SLOW_IPC_THRESHOLD_MS) {
        recordSlowIpcCall(channel, durationMs);
      }
    }
  });
}

// handle() 在模块顶层定义（被 375 个调用点引用），但需要 logger 实例；
// 用一个模块级变量持有最后一次 registerIpcHandlers() 传入的 logger（应用生命周期内只会调用一次）。
let registeredLogger: Logger | null = null;

export function registerIpcHandlers({
  logger,
  getHttpStatus,
  db,
}: {
  logger: Logger;
  getHttpStatus: () => Promise<HttpStatus>;
  db: DbContext;
}) {
  registeredLogger = logger;
  startSlowIpcFlush(db, logger);

  // ==================
  // 创建各模块 handlers
  // ==================
  const projectHandlers = createProjectHandlers(db);
  const folderHandlers = createFolderHandlers(db);
  const sourceHandlers = createSourceHandlers(db);
  const noteHandlers = createNoteHandlers(db);
  const providerHandlers = createProviderHandlers(db);
  const configHandlers = createConfigHandlers(db);
  const outputHandlers = createOutputHandlers(db);
  const mcpHandlers = createMcpHandlers(db);
  const syncHandlers = createSyncHandlers(db);
  const importExportHandlers = createImportExportHandlers(db, logger);
  const cardHandlers = createCardHandlers(db);
  const chatHistoryHandlers = createChatHistoryHandlers(db);
  const activityHandlers = createActivityHandlers(db);
  const browserSearchHandlers = createBrowserSearchHandlers();
  const exaMcpHandlers = createExaMcpHandlers();
  const webContentHandlers = createWebContentHandlers();
  const systemHandlers = createSystemHandlers();
  const logsHandlers = createLogsHandlers({ logger });
  const perfHandlers = createPerfHandlers({ db });
  const userDataJanitorHandlers = createUserDataJanitorHandlers();
  const agentRetentionHandlers = createAgentRetentionHandlers(db);
  const skillsHandlers = createSkillsHandlers(db);
  const skillsMarketplaceHandlers = createSkillsMarketplaceHandlers({
    db,
    getMainWindow: () => mainWindowRef,
  });
  const kbEmbeddingHandlers = createKbEmbeddingHandlers(db);
  const dataStatsHandlers = createDataStatsHandlers(db);
  const storageHandlers = createStorageHandlers(db);
  const cacheRootHandlers = createCacheRootHandlers();
  const fileHandlers = createFileHandlers(db);
  const fsSafeHandlers = createFsSafeHandlers();
  const tempFileHandlers = createTempFileHandlers();
  const documentHandlers = createDocumentHandlers();
  const contentIngestHandlers = createContentIngestHandlers(db);
  const modelDiscoveryHandlers = createModelDiscoveryHandlers();
  const agentSandboxHandlers = createAgentSandboxHandlers();
  const agentSdkHandlers = createAgentSdkHandlers({
    getMainWindow: () => mainWindowRef,
    getAnthropicBaseUrl: async () => {
      const httpStatus = await getHttpStatus();
      return httpStatus.anthropicProxy.baseUrl || "http://127.0.0.1:8765";
    },
    logger,
    db,
  });
  const remoteControlHandlers = createRemoteControlHandlers({ logger });
  const cloudNodeHandlers = createCloudNodeHandlers();
  getRemoteControlOrchestrator().bindAgentSdkHandlers(agentSdkHandlers);
  getCloudNodeClient().bindAgentSdkHandlers(agentSdkHandlers);

  // Agent Runtime handlers
  const agentSessionHandlers = createAgentSessionHandlers(db);
  const agentTaskHandlers = createAgentTaskHandlers(db);
  const agentNodeHandlers = createAgentNodeHandlers(db);
  const agentToolCallHandlers = createAgentToolCallHandlers(db);
  const agentMessageHandlers = createAgentMessageHandlers(db);
  const agentMemoryExtHandlers = createAgentMemoryExtendedHandlers(db);

  // Artifact handlers
  const artifactHandlers = createArtifactHandlers(db);

  // Checkpoint handlers (断点续传)
  const checkpointHandlers = createAgentCheckpointHandlers({
    db: () => db,
    logger,
  });

  // Local Backup handlers (本地备份)
  const localBackupHandlers = createLocalBackupHandlers(db);

  // Image Generation handlers (生图配置)
  const imageGenHandlers = createImageGenHandlers(db);

  // Terminal handlers (终端)
  const terminalHandlers = createTerminalHandlers({
    getMainWindow: () => mainWindowRef,
  });

  // Worktree handlers (Git Worktree 沙盒隔离)
  const worktreeHandlers = createWorktreeHandlers({ logger });

  // Wiki handlers (知识 Wiki 页面 — 文件系统驱动，不需要 db)
  const wikiHandlers = createWikiHandlers();

  // Wiki AI 生成 handlers
  const wikiGenHandlers = createWikiGenerationHandlers(db, {
    get current() {
      return mainWindowRef;
    },
  });

  // Preview Server handlers (沙盒前端预览)
  const previewServerHandlers = createPreviewServerHandlers({
    getMainWindow: () => mainWindowRef,
  });

  // Reader handlers (阅读器：电子书 / 进度 / 高亮 / 书签 / 会话 / 设置)
  const readerHandlers = createReaderHandlers(db);

  // TTS handlers (文本转语音：多 provider / 音色克隆 / 流式合成)
  const ttsHandlers = createTtsHandlers({
    db,
    getMainWindow: () => mainWindowRef,
  });

  // Claude Code 斜杠命令（扫描 / git diff / 写 CLAUDE.md）
  const slashCommandsHandlers = createSlashCommandsHandlers();

  // 应用更新 handlers
  const updateHandlers = createUpdateHandlers();

  // ==================
  // 系统命令
  // ==================
  handle("app_get_version", (async () => {
    return {
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    };
  }) satisfies IpcHandler<"app_get_version">);

  handle("health_ping", (async (_event, input) => {
    return { ts: input.ts };
  }) satisfies IpcHandler<"health_ping">);

  handle("main_window_is_focused", (async () => {
    return { focused: isMainWindowForeground(mainWindowRef) };
  }) satisfies IpcHandler<"main_window_is_focused">);

  // 目录文件监听：沙盒工作区文件树事件驱动刷新（替代渲染端高频全量重扫）
  handle("file_watch_start", (async (_event, input) => {
    return await startWatching(input.path);
  }) satisfies IpcHandler<"file_watch_start">);
  handle("file_watch_stop", (async (_event, input) => {
    return await stopWatching(input.path);
  }) satisfies IpcHandler<"file_watch_stop">);

  // 渲染端切换亮暗模式时同步 nativeTheme，原生菜单/对话框跟随应用主题
  handle("app_set_native_theme", (async (_event, input) => {
    if (!["light", "dark", "system"].includes(input.mode)) {
      return { success: false };
    }
    const { nativeTheme } = await import("electron");
    nativeTheme.themeSource = input.mode;
    return { success: true };
  }) satisfies IpcHandler<"app_set_native_theme">);

  // 渲染端主题应用后双写窗口背景色，供下次启动消除白屏闪烁
  handle("app_set_window_background", (async (_event, input) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) {
      return { success: false };
    }
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      await fs.writeFile(
        path.join(app.getPath("userData"), "window-background.json"),
        JSON.stringify({ backgroundColor: input.color }),
        "utf-8",
      );
      return { success: true };
    } catch {
      return { success: false };
    }
  }) satisfies IpcHandler<"app_set_window_background">);

  handle(
    "system_get_user_info",
    systemHandlers.get_user_info satisfies IpcHandler<"system_get_user_info">,
  );

  // 日志导出
  handle(
    "logs_get_info",
    logsHandlers.logs_get_info satisfies IpcHandler<"logs_get_info">,
  );
  handle(
    "logs_reveal",
    logsHandlers.logs_reveal satisfies IpcHandler<"logs_reveal">,
  );
  handle(
    "logs_export",
    logsHandlers.logs_export satisfies IpcHandler<"logs_export">,
  );
  handle(
    "log_renderer_event",
    logsHandlers.log_renderer_event satisfies IpcHandler<"log_renderer_event">,
  );
  handle(
    "perf_get_recent_metrics",
    perfHandlers.perf_get_recent_metrics satisfies IpcHandler<"perf_get_recent_metrics">,
  );
  handle(
    "perf_get_recent_events",
    perfHandlers.perf_get_recent_events satisfies IpcHandler<"perf_get_recent_events">,
  );
  handle(
    "perf_report_renderer_longtasks",
    perfHandlers.perf_report_renderer_longtasks satisfies IpcHandler<"perf_report_renderer_longtasks">,
  );
  handle(
    "userdata_janitor_scan",
    userDataJanitorHandlers.userdata_janitor_scan satisfies IpcHandler<"userdata_janitor_scan">,
  );
  handle(
    "userdata_janitor_execute",
    userDataJanitorHandlers.userdata_janitor_execute satisfies IpcHandler<"userdata_janitor_execute">,
  );
  handle(
    "agent_retention_scan",
    agentRetentionHandlers.agent_retention_scan satisfies IpcHandler<"agent_retention_scan">,
  );
  handle(
    "agent_retention_clean",
    agentRetentionHandlers.agent_retention_clean satisfies IpcHandler<"agent_retention_clean">,
  );

  // 应用更新
  handle(
    "update_check",
    updateHandlers.update_check satisfies IpcHandler<"update_check">,
  );
  handle(
    "update_download",
    updateHandlers.update_download satisfies IpcHandler<"update_download">,
  );
  handle(
    "update_install",
    updateHandlers.update_install satisfies IpcHandler<"update_install">,
  );
  handle(
    "update_get_state",
    updateHandlers.update_get_state satisfies IpcHandler<"update_get_state">,
  );
  handle(
    "update_reveal_pending",
    updateHandlers.update_reveal_pending satisfies IpcHandler<"update_reveal_pending">,
  );

  handle("open_external_url", (async (_event, input) => {
    try {
      const raw = String(input?.url || "").trim();
      if (!raw) return { success: false, error: "EMPTY_URL" };
      const u = new URL(raw);
      const allowed = new Set(["http:", "https:", "mailto:"]);
      if (!allowed.has(u.protocol)) {
        return { success: false, error: `UNSUPPORTED_PROTOCOL:${u.protocol}` };
      }
      await shell.openExternal(u.toString());
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }) satisfies IpcHandler<"open_external_url">);

  handle("http_get_status", (async () => {
    return getHttpStatus();
  }) satisfies IpcHandler<"http_get_status">);

  handle("open_browser_window", webContentHandlers.open_browser_window);
  handle("fetch_page_content", webContentHandlers.fetch_page_content);
  handle("browser_search", browserSearchHandlers.browser_search);
  handle("exa_mcp_search", exaMcpHandlers.exa_mcp_search);
  handle("fetch_url_content", contentIngestHandlers.fetch_url_content);
  handle("upload_file_content", contentIngestHandlers.upload_file_content);
  handle("import_local_files", contentIngestHandlers.import_local_files);
  handle("read_file_safe", fsSafeHandlers.read_file_safe);
  handle("read_file_bytes_safe", fsSafeHandlers.read_file_bytes_safe);
  handle("write_file_safe", fsSafeHandlers.write_file_safe);
  handle("list_files_safe", fsSafeHandlers.list_files_safe);
  handle("mkdir_safe", fsSafeHandlers.mkdir_safe);
  handle("copy_file_safe", fsSafeHandlers.copy_file_safe);
  handle("move_file_safe", fsSafeHandlers.move_file_safe);
  handle("delete_file_safe", fsSafeHandlers.delete_file_safe);
  handle("reveal_file_safe", fsSafeHandlers.reveal_file_safe);
  handle("read_file_utf8", fsSafeHandlers.read_file_utf8);
  handle("save_base64_image", fsSafeHandlers.save_base64_image);
  handle("save_temp_file", tempFileHandlers.save_temp_file);
  handle("agent_get_sandbox_dir", agentSandboxHandlers.agent_get_sandbox_dir);
  handle("convert_docx_to_html", documentHandlers.convert_docx_to_html);

  // Claude Code 斜杠命令
  handle(
    "slash_commands_scan",
    slashCommandsHandlers.slash_commands_scan satisfies IpcHandler<"slash_commands_scan">,
  );
  handle(
    "slash_commands_git_diff",
    slashCommandsHandlers.slash_commands_git_diff satisfies IpcHandler<"slash_commands_git_diff">,
  );
  handle(
    "slash_commands_write_init",
    slashCommandsHandlers.slash_commands_write_init satisfies IpcHandler<"slash_commands_write_init">,
  );
  handle(
    "slash_commands_pick_directory",
    slashCommandsHandlers.slash_commands_pick_directory satisfies IpcHandler<"slash_commands_pick_directory">,
  );
  handle(
    "slash_commands_save_dialog",
    slashCommandsHandlers.slash_commands_save_dialog satisfies IpcHandler<"slash_commands_save_dialog">,
  );
  handle(
    "slash_commands_export_session_md",
    slashCommandsHandlers.slash_commands_export_session_md satisfies IpcHandler<"slash_commands_export_session_md">,
  );
  // ==================
  // Projects
  // ==================
  handle("list_projects", projectHandlers.list_projects);
  handle("get_project", projectHandlers.get_project);
  handle("create_project", projectHandlers.create_project);
  handle("update_project", projectHandlers.update_project);
  handle("delete_project", projectHandlers.delete_project);
  handle("get_recent_projects", projectHandlers.get_recent_projects);
  handle("record_project_visit", projectHandlers.record_project_visit);

  // ==================
  // Folders
  // ==================
  handle("list_folders", folderHandlers.list_folders);
  handle("create_folder", folderHandlers.create_folder);
  handle("update_folder", folderHandlers.update_folder);
  handle("delete_folder", folderHandlers.delete_folder);
  handle("move_sources_to_folder", folderHandlers.move_sources_to_folder);

  // ==================
  // Sources
  // ==================
  handle("list_sources", sourceHandlers.list_sources);
  handle("get_source", sourceHandlers.get_source);
  handle("get_source_detail", sourceHandlers.get_source_detail);
  handle("create_source", sourceHandlers.create_source);
  handle("update_source", sourceHandlers.update_source);
  handle("delete_source", sourceHandlers.delete_source);
  handle("search_sources", sourceHandlers.search_sources);

  // ==================
  // Notes
  // ==================
  handle("list_notes", noteHandlers.list_notes);
  handle("create_note", noteHandlers.create_note);
  handle("update_note", noteHandlers.update_note);
  handle("delete_note", noteHandlers.delete_note);

  // ==================
  // Chat 历史（SQLite 后端，F2）
  // ==================
  handle(
    "chat_history_list_sessions",
    chatHistoryHandlers.chat_history_list_sessions,
  );
  handle(
    "chat_history_get_messages",
    chatHistoryHandlers.chat_history_get_messages,
  );
  handle(
    "chat_history_save_messages",
    chatHistoryHandlers.chat_history_save_messages,
  );
  handle(
    "chat_history_upsert_session",
    chatHistoryHandlers.chat_history_upsert_session,
  );
  handle(
    "chat_history_delete_session",
    chatHistoryHandlers.chat_history_delete_session,
  );
  handle(
    "chat_history_migrate_import",
    chatHistoryHandlers.chat_history_migrate_import,
  );
  handle("chat_history_search", chatHistoryHandlers.chat_history_search);

  // ==================
  // Knowledge Base
  // ==================
  handle("kb_search_chunks", (async (_event, input) => {
    logger.info({ msg: "kb_search_chunks called", query: input.query });
    return searchChunks(db, input);
  }) satisfies IpcHandler<"kb_search_chunks">);

  handle("kb_chunk_rebuild", noteHandlers.kb_chunk_rebuild);
  handle("kb_get_embedding_stats", kbEmbeddingHandlers.kb_get_embedding_stats);
  handle("kb_embeddings_rebuild", kbEmbeddingHandlers.kb_embeddings_rebuild);

  // ==================
  // Agent Skills
  // ==================
  handle("list_skills", skillsHandlers.list_skills);
  handle("import_skill", skillsHandlers.import_skill);
  handle("delete_skill", skillsHandlers.delete_skill);
  handle("set_skill_enabled", skillsHandlers.set_skill_enabled);

  // Skills Marketplace
  handle(
    "skills_marketplace_list_sources",
    skillsMarketplaceHandlers.skills_marketplace_list_sources,
  );
  handle(
    "skills_marketplace_set_sources",
    skillsMarketplaceHandlers.skills_marketplace_set_sources,
  );
  handle(
    "skills_marketplace_search",
    skillsMarketplaceHandlers.skills_marketplace_search,
  );
  handle(
    "skills_marketplace_install",
    skillsMarketplaceHandlers.skills_marketplace_install,
  );
  handle(
    "skills_marketplace_uninstall",
    skillsMarketplaceHandlers.skills_marketplace_uninstall,
  );
  handle(
    "skills_marketplace_check_updates",
    skillsMarketplaceHandlers.skills_marketplace_check_updates,
  );
  handle(
    "skills_marketplace_test_mirror",
    skillsMarketplaceHandlers.skills_marketplace_test_mirror,
  );
  handle(
    "skills_marketplace_preview",
    skillsMarketplaceHandlers.skills_marketplace_preview,
  );

  // 启动后异步检查 skill 更新（不阻塞 IPC 注册）
  setTimeout(() => {
    (async () => {
      try {
        const fakeEvent = {} as IpcMainInvokeEvent;
        await skillsMarketplaceHandlers.skills_marketplace_check_updates(
          fakeEvent,
          {},
        );
      } catch (e) {
        logger.warn({
          msg: "skills_marketplace_check_updates failed at startup",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  }, 8_000);

  // ==================
  // Providers
  // ==================
  handle("list_providers", providerHandlers.list_providers);
  handle("upsert_provider", providerHandlers.upsert_provider);
  handle("delete_provider", providerHandlers.delete_provider);
  handle("check_provider_api_key", providerHandlers.check_provider_api_key);
  handle("reset_core_providers", providerHandlers.reset_core_providers);
  handle("provider_fetch_models", modelDiscoveryHandlers.provider_fetch_models);

  // ==================
  // Config
  // ==================
  handle("get_config", configHandlers.get_config);
  handle("set_config", configHandlers.set_config);
  handle("set_log_file_level", configHandlers.set_log_file_level);
  handle("app_get_close_behavior", configHandlers.app_get_close_behavior);
  handle("app_set_close_behavior", configHandlers.app_set_close_behavior);
  handle(
    "get_remote_control_config",
    remoteControlHandlers.get_remote_control_config,
  );
  handle(
    "set_remote_control_config",
    remoteControlHandlers.set_remote_control_config,
  );
  handle(
    "get_remote_control_runtime_status",
    remoteControlHandlers.get_remote_control_runtime_status,
  );
  handle("list_remote_channels", remoteControlHandlers.list_remote_channels);
  handle(
    "list_remote_channel_capabilities",
    remoteControlHandlers.list_remote_channel_capabilities,
  );
  handle("list_remote_pairings", remoteControlHandlers.list_remote_pairings);
  handle(
    "approve_remote_pairing",
    remoteControlHandlers.approve_remote_pairing,
  );
  handle("reject_remote_pairing", remoteControlHandlers.reject_remote_pairing);
  handle("revoke_remote_pairing", remoteControlHandlers.revoke_remote_pairing);
  handle("list_remote_sessions", remoteControlHandlers.list_remote_sessions);
  handle(
    "terminate_remote_session",
    remoteControlHandlers.terminate_remote_session,
  );
  handle(
    "remote_terminal_list_sessions",
    remoteControlHandlers.remote_terminal_list_sessions,
  );
  handle(
    "remote_terminal_terminate_session",
    remoteControlHandlers.remote_terminal_terminate_session,
  );
  handle("test_remote_channel", remoteControlHandlers.test_remote_channel);
  handle(
    "list_remote_event_logs",
    remoteControlHandlers.list_remote_event_logs,
  );
  handle(
    "feishu_begin_app_registration",
    remoteControlHandlers.feishu_begin_app_registration,
  );
  handle(
    "feishu_poll_app_registration",
    remoteControlHandlers.feishu_poll_app_registration,
  );
  handle("cloud_node_get_status", cloudNodeHandlers.cloud_node_get_status);
  handle("cloud_node_set_config", cloudNodeHandlers.cloud_node_set_config);
  handle("cloud_node_bind", cloudNodeHandlers.cloud_node_bind);
  handle("cloud_node_unbind", cloudNodeHandlers.cloud_node_unbind);
  handle("get_all_configs", configHandlers.get_all_configs);
  handle("get_active_model", configHandlers.get_active_model);
  handle("set_active_model", configHandlers.set_active_model);

  // ==================
  // LLM
  // ==================
  handle("invoke_llm", (async (_event, input) => {
    logger.info({ msg: "invoke_llm called", model: input.model });
    return invokeLlm(db, input);
  }) satisfies IpcHandler<"invoke_llm">);

  handle("invoke_llm_stream", (async (_event, input) => {
    logger.info({ msg: "invoke_llm_stream called", model: input.model });
    return invokeLlmStream(db, mainWindowRef, input);
  }) satisfies IpcHandler<"invoke_llm_stream">);

  handle("invoke_llm_stream_cancel", (async (_event, input) => {
    if (input?.cancelAll) {
      const count = llmStreamRegistry.cancelAll("user-cancel-all");
      logger.info({ msg: "invoke_llm_stream_cancel: cancelAll", count });
      return { cancelled: count > 0, count };
    }
    const streamId = input?.streamId;
    if (!streamId) {
      return { cancelled: false, count: 0 };
    }
    const ok = llmStreamRegistry.cancel(streamId, "user-cancelled");
    logger.info({
      msg: "invoke_llm_stream_cancel",
      streamId,
      cancelled: ok,
    });
    return { cancelled: ok, count: ok ? 1 : 0 };
  }) satisfies IpcHandler<"invoke_llm_stream_cancel">);

  handle("invoke_image_generation", (async (_event, input) => {
    logger.info({ msg: "invoke_image_generation called", model: input.model });
    return invokeImageGeneration(db, input);
  }) satisfies IpcHandler<"invoke_image_generation">);

  // ==================
  // 生图配置
  // ==================
  handle("get_image_gen_config", imageGenHandlers.get_image_gen_config);
  handle("set_image_gen_config", imageGenHandlers.set_image_gen_config);
  handle("generate_image_for_text", imageGenHandlers.generate_image_for_text);

  // ==================
  // Output Assets
  // ==================
  handle("list_output_assets", outputHandlers.list_output_assets);
  handle("create_output_asset", outputHandlers.create_output_asset);
  handle("update_output_asset", outputHandlers.update_output_asset);
  handle("delete_output_asset", outputHandlers.delete_output_asset);

  // ==================
  // Dashboard
  // ==================
  handle("dashboard_stats", outputHandlers.dashboard_stats);
  handle("get_daily_activity", activityHandlers.get_daily_activity);

  // ==================
  // Cards
  // ==================
  handle("list_cards", cardHandlers.list_cards);
  handle("get_card", cardHandlers.get_card);
  handle("delete_card", cardHandlers.delete_card);
  handle("get_card_image_path", cardHandlers.get_card_image_path);

  // ==================
  // MCP Servers
  // ==================
  handle("list_mcp_servers", mcpHandlers.list_mcp_servers);
  handle("get_mcp_server", mcpHandlers.get_mcp_server);
  handle("create_mcp_server", mcpHandlers.create_mcp_server);
  handle("update_mcp_server", mcpHandlers.update_mcp_server);
  handle("delete_mcp_server", mcpHandlers.delete_mcp_server);
  handle("toggle_mcp_server", mcpHandlers.toggle_mcp_server);
  handle("mcp_check_env", mcpHandlers.mcp_check_env);
  handle("mcp_list_tools", mcpHandlers.mcp_list_tools);
  handle("mcp_call_tool", mcpHandlers.mcp_call_tool);
  handle("mcp_stop_server", mcpHandlers.mcp_stop_server);

  // ==================
  // Data Stats & Management
  // ==================
  handle("get_data_stats", dataStatsHandlers.get_data_stats);
  handle("get_data_directory", dataStatsHandlers.get_data_directory);
  handle("get_database_path", dataStatsHandlers.get_database_path);
  handle("clear_cache", dataStatsHandlers.clear_cache);
  handle("clear_all_data", dataStatsHandlers.clear_all_data);

  // ==================
  // Storage / Vault
  // ==================
  handle("storage_get_settings", storageHandlers.storage_get_settings);
  handle("storage_update_settings", storageHandlers.storage_update_settings);
  handle("storage_pick_directory", storageHandlers.storage_pick_directory);
  handle("system_pick_directory", storageHandlers.system_pick_directory);
  handle(
    "storage_reveal_vault_root",
    storageHandlers.storage_reveal_vault_root,
  );
  handle("project_reveal_directory", storageHandlers.project_reveal_directory);
  // 缓存根目录
  handle("cache_root_get", cacheRootHandlers.cache_root_get);
  handle("cache_root_pick", cacheRootHandlers.cache_root_pick);
  handle("cache_root_update", cacheRootHandlers.cache_root_update);
  handle("file_list", fileHandlers.file_list);
  handle("file_move", fileHandlers.file_move);
  handle("file_delete", fileHandlers.file_delete);
  handle("file_restore", fileHandlers.file_restore);
  handle("file_reveal_in_finder", fileHandlers.file_reveal_in_finder);
  handle("file_set_scope", fileHandlers.file_set_scope);
  handle("file_set_tags", fileHandlers.file_set_tags);
  handle("theme_list", fileHandlers.theme_list);
  handle("theme_create", fileHandlers.theme_create);
  handle("theme_rename", fileHandlers.theme_rename);
  handle("theme_delete", fileHandlers.theme_delete);

  // ==================
  // Sync & Backup
  // ==================
  handle("get_sync_config", syncHandlers.get_sync_config);
  handle("update_sync_config", syncHandlers.update_sync_config);
  handle("list_backup_history", syncHandlers.list_backup_history);
  handle("create_backup_record", syncHandlers.create_backup_record);
  handle("clean_old_backups", syncHandlers.clean_old_backups);
  // WebDAV 操作
  handle("backup_to_webdav", syncHandlers.backup_to_webdav);
  handle("restore_from_webdav", syncHandlers.restore_from_webdav);
  handle("list_webdav_backups", syncHandlers.list_webdav_backups);
  handle("delete_webdav_backup", syncHandlers.delete_webdav_backup);
  handle("test_webdav_connection", syncHandlers.test_webdav_connection);

  // ==================
  // Import / Export
  // ==================
  handle("export_all_data", importExportHandlers.export_all_data);
  handle("export_all_data_to_file", importExportHandlers.export_all_data_to_file);
  handle("export_project", importExportHandlers.export_project);
  handle("import_data", importExportHandlers.import_data);
  handle("import_data_from_json", importExportHandlers.import_data_from_json);

  // ==================
  // Agent Sessions
  // ==================
  handle("agent_create_session", agentSessionHandlers.agent_create_session);
  handle("agent_get_session", agentSessionHandlers.agent_get_session);
  handle("agent_list_sessions", agentSessionHandlers.agent_list_sessions);
  handle("agent_update_session", agentSessionHandlers.agent_update_session);
  handle("agent_delete_session", agentSessionHandlers.agent_delete_session);

  // ==================
  // Agent Tasks
  // ==================
  handle("agent_create_task", agentTaskHandlers.agent_create_task);
  handle("agent_get_task", agentTaskHandlers.agent_get_task);
  handle("agent_list_tasks", agentTaskHandlers.agent_list_tasks);
  handle("agent_update_task", agentTaskHandlers.agent_update_task);

  // ==================
  // Agent Nodes
  // ==================
  handle("agent_create_node", agentNodeHandlers.agent_create_node);
  handle("agent_list_nodes", agentNodeHandlers.agent_list_nodes);
  handle("agent_update_node", agentNodeHandlers.agent_update_node);

  // ==================
  // Agent Tool Calls
  // ==================
  handle(
    "agent_create_tool_call",
    agentToolCallHandlers.agent_create_tool_call,
  );
  handle("agent_list_tool_calls", agentToolCallHandlers.agent_list_tool_calls);
  handle(
    "agent_update_tool_call",
    agentToolCallHandlers.agent_update_tool_call,
  );

  // ==================
  // Claude Agent SDK Runner
  // ==================
  handle("agent_sdk_start", agentSdkHandlers.agent_sdk_start);
  handle("agent_sdk_abort", agentSdkHandlers.agent_sdk_abort);
  handle(
    "agent_sdk_resolve_interaction",
    agentSdkHandlers.agent_sdk_resolve_interaction,
  );
  handle("agent_sdk_control", agentSdkHandlers.agent_sdk_control);
  handle("agent_sdk_send_followup", agentSdkHandlers.agent_sdk_send_followup);
  handle("agent_sdk_check_alive", agentSdkHandlers.agent_sdk_check_alive);

  // ==================
  // Agent Checkpoints (断点续传)
  // ==================
  handle("agent_checkpoint_save", checkpointHandlers.agent_checkpoint_save);
  handle("agent_checkpoint_get", checkpointHandlers.agent_checkpoint_get);
  handle("agent_checkpoint_delete", checkpointHandlers.agent_checkpoint_delete);
  handle(
    "agent_checkpoint_cleanup",
    checkpointHandlers.agent_checkpoint_cleanup,
  );

  // ==================
  // Agent Messages & Artifacts & Audit
  // ==================
  handle("agent_create_message", agentMessageHandlers.agent_create_message);
  handle("agent_list_messages", agentMessageHandlers.agent_list_messages);
  handle("agent_create_artifact", agentMessageHandlers.agent_create_artifact);
  handle("agent_list_artifacts", agentMessageHandlers.agent_list_artifacts);
  handle("agent_create_audit_log", agentMessageHandlers.agent_create_audit_log);
  handle("agent_list_audit_logs", agentMessageHandlers.agent_list_audit_logs);

  // ==================
  // Agent Memory（Markdown 文件式）
  // ==================
  handle(
    "agent_get_memory_stats",
    agentMemoryExtHandlers.agent_get_memory_stats,
  );
  handle(
    "agent_get_memory_context",
    agentMemoryExtHandlers.agent_get_memory_context,
  );
  handle(
    "agent_clear_all_memories",
    agentMemoryExtHandlers.agent_clear_all_memories,
  );
  handle(
    "agent_memory_read_file",
    agentMemoryExtHandlers.agent_memory_read_file,
  );
  handle(
    "agent_memory_write_file",
    agentMemoryExtHandlers.agent_memory_write_file,
  );
  handle(
    "agent_memory_list_context_files",
    agentMemoryExtHandlers.agent_memory_list_context_files,
  );
  handle(
    "agent_memory_get_snapshot",
    agentMemoryExtHandlers.agent_memory_get_snapshot,
  );
  handle(
    "agent_memory_open_folder",
    agentMemoryExtHandlers.agent_memory_open_folder,
  );
  handle(
    "agent_memory_set_active_cwd",
    agentMemoryExtHandlers.agent_memory_set_active_cwd,
  );

  // ==================
  // Artifacts (产物管理)
  // ==================
  handle("artifact_save", artifactHandlers.artifact_save);
  handle("artifact_list", artifactHandlers.artifact_list);
  handle("artifact_get", artifactHandlers.artifact_get);
  handle("artifact_delete", artifactHandlers.artifact_delete);
  handle("artifact_reveal", artifactHandlers.artifact_reveal);
  handle("artifact_download", artifactHandlers.artifact_download);
  handle(
    "artifact_import_to_library",
    artifactHandlers.artifact_import_to_library,
  );
  handle("artifact_cleanup", artifactHandlers.artifact_cleanup);
  handle("artifact_get_settings", artifactHandlers.artifact_get_settings);
  handle("artifact_update_settings", artifactHandlers.artifact_update_settings);

  // ==================
  // Local Backup (本地备份)
  // ==================
  handle(
    "list_local_backup_files",
    localBackupHandlers.list_local_backup_files,
  );
  handle(
    "delete_local_backup_file",
    localBackupHandlers.delete_local_backup_file,
  );
  handle("backup_to_local_dir", localBackupHandlers.backup_to_local_dir);
  handle(
    "restore_from_local_file",
    localBackupHandlers.restore_from_local_file,
  );
  handle(
    "select_backup_directory",
    localBackupHandlers.select_backup_directory,
  );

  // ==================
  // Terminal (终端)
  // ==================
  handle("terminal_create", terminalHandlers.terminal_create);
  handle("terminal_write", terminalHandlers.terminal_write);
  handle("terminal_resize", terminalHandlers.terminal_resize);
  handle("terminal_destroy", terminalHandlers.terminal_destroy);
  handle("terminal_list", terminalHandlers.terminal_list);

  // ==================
  // Git Worktree (沙盒隔离)
  // ==================
  handle("worktree_create", worktreeHandlers.worktree_create);
  handle("worktree_list", worktreeHandlers.worktree_list);
  handle("worktree_merge", worktreeHandlers.worktree_merge);
  handle("worktree_remove", worktreeHandlers.worktree_remove);
  handle("worktree_diff", worktreeHandlers.worktree_diff);

  // ==================
  // Wiki 知识页面
  // ==================
  handle("wiki_list_pages", wikiHandlers.wiki_list_pages);
  handle("wiki_get_page", wikiHandlers.wiki_get_page);
  handle("wiki_create_page", wikiHandlers.wiki_create_page);
  handle("wiki_update_page", wikiHandlers.wiki_update_page);
  handle("wiki_delete_page", wikiHandlers.wiki_delete_page);
  handle("wiki_search_pages", wikiHandlers.wiki_search_pages);
  handle("wiki_count_pages", wikiHandlers.wiki_count_pages);
  handle("wiki_is_enabled", wikiHandlers.wiki_is_enabled);
  handle("wiki_enable", wikiHandlers.wiki_enable);
  handle("wiki_disable", wikiHandlers.wiki_disable);
  handle("wiki_rebuild", wikiHandlers.wiki_rebuild);
  handle("wiki_get_page_file_path", wikiHandlers.wiki_get_page_file_path);
  handle("wiki_schema_stats", wikiHandlers.wiki_schema_stats);
  handle("wiki_reset_skipped_sources", wikiHandlers.wiki_reset_skipped_sources);
  handle(
    "wiki_reset_processed_sources",
    wikiHandlers.wiki_reset_processed_sources,
  );
  handle("wiki_lint", wikiHandlers.wiki_lint);

  // Wiki AI 生成
  handle("wiki_generate", wikiGenHandlers.wiki_generate);
  handle("wiki_generation_status", wikiGenHandlers.wiki_generation_status);

  // ==================
  // 桌面宠物窗口
  // ==================
  // 拖动状态：在 drag_start 时缓存"鼠标起始屏幕坐标 + 窗口起始位置"，
  // drag_move 时根据鼠标增量重新设置窗口位置，drag_end 时持久化。
  let petDragState: {
    originMouseX: number;
    originMouseY: number;
    originWinX: number;
    originWinY: number;
    moved: boolean;
  } | null = null;

  const petWindowHandlers = createPetWindowHandlers({
    focusMainWindow: () => petFocusMainWindow(() => mainWindowRef),
    sendChatToMainWindow: (text: string) =>
      petSendChat(() => mainWindowRef, text),
    dragStart: (mouseX: number, mouseY: number) => {
      const win = getPetWindow();
      if (!win || win.isDestroyed()) return;
      const [winX, winY] = win.getPosition();
      petDragState = {
        originMouseX: mouseX,
        originMouseY: mouseY,
        originWinX: winX,
        originWinY: winY,
        moved: false,
      };
    },
    dragMove: (mouseX: number, mouseY: number) => {
      const win = getPetWindow();
      if (!win || win.isDestroyed() || !petDragState) return;
      const dx = mouseX - petDragState.originMouseX;
      const dy = mouseY - petDragState.originMouseY;
      // 5px 死区：避免点击时微小抖动也算作拖动
      if (!petDragState.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        return;
      }
      petDragState.moved = true;

      const targetX = Math.round(petDragState.originWinX + dx);
      const targetY = Math.round(petDragState.originWinY + dy);

      // 屏幕边界约束：窗口必须完全停在当前所在显示器的工作区内
      // （workArea 已经排除了 macOS 菜单栏 / Dock / Windows 任务栏）
      const [winW, winH] = win.getSize();
      const display = screen.getDisplayNearestPoint({
        x: targetX + Math.round(winW / 2),
        y: targetY + Math.round(winH / 2),
      });
      const wa = display.workArea;
      const clampedX = Math.max(
        wa.x,
        Math.min(targetX, wa.x + wa.width - winW),
      );
      const clampedY = Math.max(
        wa.y,
        Math.min(targetY, wa.y + wa.height - winH),
      );

      win.setPosition(clampedX, clampedY);
    },
    dragEnd: (vx?: number, vy?: number) => {
      const win = getPetWindow();
      if (!win || win.isDestroyed()) {
        const moved = petDragState?.moved ?? false;
        petDragState = null;
        return { moved, x: 0, y: 0 };
      }
      const [x, y] = win.getPosition();
      const moved = petDragState?.moved ?? false;
      // 仅在真正拖动后持久化新位置
      if (moved) {
        setPetWindowPosition(x, y);
        // 速度有效（>0.1 px/ms）就走惯性飞行 + 贴墙
        const speed =
          vx !== undefined && vy !== undefined
            ? Math.sqrt(vx * vx + vy * vy)
            : 0;
        if (speed > 0.1) {
          flingAndSnapPetWindow(vx ?? 0, vy ?? 0, 80);
        }
      }
      petDragState = null;
      return { moved, x, y };
    },
  });
  handle("pet_window_get_state", petWindowHandlers.pet_window_get_state);
  handle("pet_window_set_enabled", petWindowHandlers.pet_window_set_enabled);
  handle("pet_window_set_position", petWindowHandlers.pet_window_set_position);
  handle(
    "pet_window_set_through_clicks",
    petWindowHandlers.pet_window_set_through_clicks,
  );
  handle(
    "pet_window_set_mouse_ignore",
    petWindowHandlers.pet_window_set_mouse_ignore,
  );
  handle("pet_window_focus_main", petWindowHandlers.pet_window_focus_main);
  handle("pet_window_send_chat", petWindowHandlers.pet_window_send_chat);
  handle("pet_window_drag_start", petWindowHandlers.pet_window_drag_start);
  handle("pet_window_drag_move", petWindowHandlers.pet_window_drag_move);
  handle("pet_window_drag_end", petWindowHandlers.pet_window_drag_end);
  handle("pet_window_snap_to_edge", petWindowHandlers.pet_window_snap_to_edge);
  handle("pet_window_get_position", petWindowHandlers.pet_window_get_position);
  handle(
    "pet_window_set_size_preset",
    petWindowHandlers.pet_window_set_size_preset,
  );
  handle(
    "pet_window_set_dwell_preset",
    petWindowHandlers.pet_window_set_dwell_preset,
  );
  handle("pet_window_set_dnd", petWindowHandlers.pet_window_set_dnd);
  handle(
    "pet_window_set_global_shortcut_enabled",
    petWindowHandlers.pet_window_set_global_shortcut_enabled,
  );
  handle("mascot_set_id", petWindowHandlers.mascot_set_id);
  handle("mascot_get_id", petWindowHandlers.mascot_get_id);

  // 自定义桌宠（导入 / 列表 / 删除 / 编辑）
  const customMascotHandlers = createCustomMascotHandlers();
  handle("mascot_list_custom", customMascotHandlers.mascot_list_custom);
  handle("mascot_import_custom", customMascotHandlers.mascot_import_custom);
  handle(
    "mascot_import_custom_dir",
    customMascotHandlers.mascot_import_custom_dir,
  );
  handle("mascot_delete_custom", customMascotHandlers.mascot_delete_custom);
  handle(
    "mascot_update_custom_meta",
    customMascotHandlers.mascot_update_custom_meta,
  );
  handle(
    "mascot_get_custom_asset_url",
    customMascotHandlers.mascot_get_custom_asset_url,
  );

  // pet-trigger-reminder：番茄钟 / 外部驱动主动推送 reminder 的接入点（暂未实装触发器，
  // 仅作为通道开放给未来的 cron / 通知服务）。
  // - 渲染端可 invoke("pet-trigger-reminder", { kind, title, detail }) 主动测试
  // - 主进程其它模块也可以 ipcMain.emit("pet-trigger-reminder", null, payload)
  handle("pet-trigger-reminder", (async (_e, payload) => {
    const win = getPetWindow();
    if (!win || win.isDestroyed()) return { success: false };
    try {
      win.webContents.send("pet-trigger-reminder", payload);
      return { success: true };
    } catch {
      return { success: false };
    }
  }) satisfies IpcHandler<"pet-trigger-reminder">);
  ipcMain.on("pet-trigger-reminder", (_e, payload) => {
    const win = getPetWindow();
    if (!win || win.isDestroyed()) return;
    try {
      win.webContents.send("pet-trigger-reminder", payload);
    } catch {
      // noop
    }
  });

  // pet_speak：让桌宠"说一句话"——主动朗读 + 弹气泡。
  // 桌宠窗口监听 "pet-speak" 事件，由 PetApp 显示气泡 + 调 speakTts({ scope: "pet" }).
  // 启用桌宠窗口时若窗口尚未拉起，先 ensurePetWindow（避免外部 trigger 时桌宠静默被忽略）。
  handle("pet_speak", (async (_e, payload) => {
    const win = getPetWindow();
    if (!win || win.isDestroyed()) return { success: false };
    try {
      win.webContents.send("pet-speak", payload ?? {});
      return { success: true };
    } catch {
      return { success: false };
    }
  }) satisfies IpcHandler<"pet_speak">);

  // pet_generate_line：桌宠台词生成；本期只走话术池兜底，留待后续接 LLM
  handle("pet_generate_line", (async (_e, payload) => {
    const text = pickPetLineFromPool(
      payload?.event ?? "done",
      payload?.mascotId,
    );
    return { text, source: "pool" as const };
  }) satisfies IpcHandler<"pet_generate_line">);

  // ==================
  // 预览服务器（沙盒前端预览）
  // ==================
  handle("preview_server_start", previewServerHandlers.preview_server_start);
  handle("preview_server_stop", previewServerHandlers.preview_server_stop);
  handle("preview_server_status", previewServerHandlers.preview_server_status);
  handle("preview_window_open", previewServerHandlers.preview_window_open);
  handle("sandbox_save_file", previewServerHandlers.sandbox_save_file);

  // ==================
  // Reader（阅读器）
  // ==================
  handle("reader_import_files", readerHandlers.reader_import_files);
  handle("reader_list_books", readerHandlers.reader_list_books);
  handle("reader_get_book", readerHandlers.reader_get_book);
  handle("reader_open_book", readerHandlers.reader_open_book);
  handle("reader_open_from_source", readerHandlers.reader_open_from_source);
  handle("reader_delete_book", readerHandlers.reader_delete_book);
  handle("reader_get_chapter", readerHandlers.reader_get_chapter);
  handle("reader_save_progress", readerHandlers.reader_save_progress);
  handle("reader_search_in_book", readerHandlers.reader_search_in_book);
  handle("reader_search_global", readerHandlers.reader_search_global);
  handle("reader_list_highlights", readerHandlers.reader_list_highlights);
  handle("reader_create_highlight", readerHandlers.reader_create_highlight);
  handle("reader_update_highlight", readerHandlers.reader_update_highlight);
  handle("reader_delete_highlight", readerHandlers.reader_delete_highlight);
  handle("reader_list_bookmarks", readerHandlers.reader_list_bookmarks);
  handle("reader_create_bookmark", readerHandlers.reader_create_bookmark);
  handle("reader_delete_bookmark", readerHandlers.reader_delete_bookmark);
  handle("reader_session_start", readerHandlers.reader_session_start);
  handle("reader_session_end", readerHandlers.reader_session_end);
  handle("reader_list_sessions", readerHandlers.reader_list_sessions);
  handle("reader_export_highlights", readerHandlers.reader_export_highlights);
  handle("reader_get_settings", readerHandlers.reader_get_settings);
  handle("reader_update_settings", readerHandlers.reader_update_settings);
  handle("reader_list_cards", readerHandlers.reader_list_cards);
  handle("reader_list_all_cards", readerHandlers.reader_list_all_cards);
  handle("reader_list_due_cards", readerHandlers.reader_list_due_cards);
  handle("reader_list_card_tags", readerHandlers.reader_list_card_tags);
  handle("reader_create_card", readerHandlers.reader_create_card);
  handle("reader_create_draft_cards", readerHandlers.reader_create_draft_cards);
  handle("reader_accept_draft_cards", readerHandlers.reader_accept_draft_cards);
  handle("reader_reject_draft_cards", readerHandlers.reader_reject_draft_cards);
  handle("reader_update_card", readerHandlers.reader_update_card);
  handle("reader_update_card_tags", readerHandlers.reader_update_card_tags);
  handle("reader_review_card", readerHandlers.reader_review_card);
  handle("reader_delete_card", readerHandlers.reader_delete_card);
  handle("reader_delete_cards_bulk", readerHandlers.reader_delete_cards_bulk);
  handle("reader_generate_cards", readerHandlers.reader_generate_cards);

  // ==================
  // TTS（多 provider 文本转语音）
  // ==================
  handle("tts_settings_get", ttsHandlers.tts_settings_get);
  handle("tts_settings_update", ttsHandlers.tts_settings_update);
  handle("tts_list_voices", ttsHandlers.tts_list_voices);
  handle("tts_voice_preview", ttsHandlers.tts_voice_preview);
  handle("tts_clone_voice", ttsHandlers.tts_clone_voice);
  handle("tts_delete_voice", ttsHandlers.tts_delete_voice);
  handle("tts_capabilities", ttsHandlers.tts_capabilities);
  handle("tts_synthesize", ttsHandlers.tts_synthesize);
  handle("tts_synthesize_stream", ttsHandlers.tts_synthesize_stream);
  handle("tts_cancel", ttsHandlers.tts_cancel);
  handle("tts_test", ttsHandlers.tts_test);

  // ==================
  // 语言风格包
  // ==================
  const styleProfileCrudHandlers = createStyleProfileCrudHandlers(db);
  handle("style_profile_create", styleProfileCrudHandlers.style_profile_create);
  handle("style_profile_list", styleProfileCrudHandlers.style_profile_list);
  handle("style_profile_get", styleProfileCrudHandlers.style_profile_get);
  handle("style_profile_update", styleProfileCrudHandlers.style_profile_update);
  handle("style_profile_delete", styleProfileCrudHandlers.style_profile_delete);
  handle(
    "style_profile_archive",
    styleProfileCrudHandlers.style_profile_archive,
  );

  const styleSampleHandlers = createStyleSampleHandlers(db);
  handle("style_sample_add", styleSampleHandlers.style_sample_add);
  handle("style_sample_remove", styleSampleHandlers.style_sample_remove);
  handle("style_sample_list", styleSampleHandlers.style_sample_list);
  handle(
    "style_sample_parse_file",
    styleSampleHandlers.style_sample_parse_file,
  );
  handle(
    "style_sample_import_from_zip",
    styleSampleHandlers.style_sample_import_from_zip,
  );

  const styleAnalyzerHandlers = createStyleAnalyzerHandlersV2(
    db,
    () => mainWindowRef,
  );
  handle("style_analysis_start", styleAnalyzerHandlers.style_analysis_start);

  const styleAnalysisCrudHandlers = createStyleAnalysisCrudHandlers(db);
  handle("style_analysis_get", styleAnalyzerHandlers.style_analysis_get);
  handle(
    "style_analysis_update",
    styleAnalysisCrudHandlers.style_analysis_update,
  );

  const styleRendererHandlers = createStyleRendererHandlersV2(db);
  handle(
    "style_profile_render_prompt",
    styleRendererHandlers.style_profile_render_prompt,
  );
  handle(
    "style_recipe_render_prompt",
    styleRendererHandlers.style_recipe_render_prompt,
  );

  const styleFeedbackHandlers = createStyleFeedbackHandlers(db);
  handle("style_feedback_submit", styleFeedbackHandlers.style_feedback_submit);
  handle("style_feedback_list", styleFeedbackHandlers.style_feedback_list);

  // 混搭配方
  const styleRecipeCrudHandlers = createStyleRecipeCrudHandlers(db);
  handle("style_recipe_create", styleRecipeCrudHandlers.style_recipe_create);
  handle("style_recipe_list", styleRecipeCrudHandlers.style_recipe_list);
  handle("style_recipe_get", styleRecipeCrudHandlers.style_recipe_get);
  handle("style_recipe_update", styleRecipeCrudHandlers.style_recipe_update);
  handle("style_recipe_delete", styleRecipeCrudHandlers.style_recipe_delete);

  logger.info({ msg: "IPC handlers registered", count: 100 });
}
