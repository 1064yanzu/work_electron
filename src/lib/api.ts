/**
 * Barrel re-export 入口。历史保持单文件 import；按业务域的实际定义在 `./api/*.ts` 中。
 *
 * 重构记录（2026-05-05）：原 1331 行单文件按业务域拆为 25 个子文件；
 * 现有外部 import（如 `import { X } from "../../lib/api"`）仍可直接使用。
 */

export type { FileRecord, StorageSettings, Theme } from "../types";

export * from "./api/artifacts";
export * from "./api/backup";
export * from "./api/cards";
export * from "./api/cloudNode";
export * from "./api/contentIngest";
export * from "./api/dashboard";
export * from "./api/dataAdmin";
export * from "./api/feishu";
export * from "./api/folders";
export * from "./api/harnessHub";
export * from "./api/imageGen";
export * from "./api/kb";
export * from "./api/llm";
export * from "./api/notes";
export * from "./api/output";
export * from "./api/projects";
export * from "./api/providers";
export * from "./api/remoteControl";
export * from "./api/search";
export * from "./api/sources";
export * from "./api/storage";
export * from "./api/sync";
export * from "./api/tempFiles";
export * from "./api/themes";
export * from "./api/webdav";
export * from "./api/workflow";
