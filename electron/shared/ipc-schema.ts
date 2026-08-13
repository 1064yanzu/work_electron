/**
 * IPC Schema —— 类型安全的 IPC 契约（barrel）。
 *
 * 真正的定义按域拆在 `electron/shared/ipc/` 下，本文件只做两件事：
 *
 * 1. 把各域的 schema 合并成单一的 `IPCSchema`；
 * 2. 原样再导出 `ipc/common.ts` 里的全部辅助类型，让历史上
 *    `import type { XxxRow } from ".../ipc-schema"` 的调用点零改动。
 *
 * 新增 / 修改命令：改对应的 `ipc/<域>.ts`，然后跑 `npm run generate:ipc`
 * 同步 preload 的 channel 白名单（`npm run check:ipc` 会在漂移时报错）。
 */
export * from "./ipc/common";

import type { AgentIpcSchema } from "./ipc/agent";
import type { AgentSdkIpcSchema } from "./ipc/agentSdk";
import type { ArtifactsIpcSchema } from "./ipc/artifacts";
import type { BackupIpcSchema } from "./ipc/backup";
import type { CardsIpcSchema } from "./ipc/cards";
import type { ChatHistoryIpcSchema } from "./ipc/chatHistory";
import type { FilesIpcSchema } from "./ipc/files";
import type { FoldersIpcSchema } from "./ipc/folders";
import type { HarnessIpcSchema } from "./ipc/harness";
import type { KbIpcSchema } from "./ipc/kb";
import type { LlmIpcSchema } from "./ipc/llm";
import type { LogsIpcSchema } from "./ipc/logs";
import type { McpIpcSchema } from "./ipc/mcp";
import type { NotesIpcSchema } from "./ipc/notes";
import type { OutputsIpcSchema } from "./ipc/outputs";
import type { PerfIpcSchema } from "./ipc/perf";
import type { PetIpcSchema } from "./ipc/pet";
import type { ProjectsIpcSchema } from "./ipc/projects";
import type { ProvidersIpcSchema } from "./ipc/providers";
import type { ReaderIpcSchema } from "./ipc/reader";
import type { RemoteControlIpcSchema } from "./ipc/remoteControl";
import type { SkillsIpcSchema } from "./ipc/skills";
import type { SourcesIpcSchema } from "./ipc/sources";
import type { StyleIpcSchema } from "./ipc/style";
import type { SystemIpcSchema } from "./ipc/system";
import type { TerminalIpcSchema } from "./ipc/terminal";
import type { ThemeIpcSchema } from "./ipc/theme";
import type { TtsIpcSchema } from "./ipc/tts";
import type { UpdateIpcSchema } from "./ipc/update";
import type { WebContentIpcSchema } from "./ipc/webContent";
export type { AgentIpcSchema } from "./ipc/agent";
export type { AgentSdkIpcSchema } from "./ipc/agentSdk";
export type { ArtifactsIpcSchema } from "./ipc/artifacts";
export type { BackupIpcSchema } from "./ipc/backup";
export type { CardsIpcSchema } from "./ipc/cards";
export type { ChatHistoryIpcSchema } from "./ipc/chatHistory";
export type { FilesIpcSchema } from "./ipc/files";
export type { FoldersIpcSchema } from "./ipc/folders";
export type { HarnessIpcSchema } from "./ipc/harness";
export type { KbIpcSchema } from "./ipc/kb";
export type { LlmIpcSchema } from "./ipc/llm";
export type { LogsIpcSchema } from "./ipc/logs";
export type { McpIpcSchema } from "./ipc/mcp";
export type { NotesIpcSchema } from "./ipc/notes";
export type { OutputsIpcSchema } from "./ipc/outputs";
export type { PerfIpcSchema } from "./ipc/perf";
export type { PetIpcSchema } from "./ipc/pet";
export type { ProjectsIpcSchema } from "./ipc/projects";
export type { ProvidersIpcSchema } from "./ipc/providers";
export type { ReaderIpcSchema } from "./ipc/reader";
export type { RemoteControlIpcSchema } from "./ipc/remoteControl";
export type { SkillsIpcSchema } from "./ipc/skills";
export type { SourcesIpcSchema } from "./ipc/sources";
export type { StyleIpcSchema } from "./ipc/style";
export type { SystemIpcSchema } from "./ipc/system";
export type { TerminalIpcSchema } from "./ipc/terminal";
export type { ThemeIpcSchema } from "./ipc/theme";
export type { TtsIpcSchema } from "./ipc/tts";
export type { UpdateIpcSchema } from "./ipc/update";
export type { WebContentIpcSchema } from "./ipc/webContent";
/**
 * 全部 IPC 命令的输入输出契约。
 *
 * 用 interface extends 而不是交叉类型：重名成员会在编译期直接报错，
 * 交叉类型只会悄悄合成一个 `never`，到运行时才暴露。
 */
export interface IPCSchema
	extends AgentIpcSchema,
		AgentSdkIpcSchema,
		ArtifactsIpcSchema,
		BackupIpcSchema,
		CardsIpcSchema,
		ChatHistoryIpcSchema,
		FilesIpcSchema,
		FoldersIpcSchema,
		HarnessIpcSchema,
		KbIpcSchema,
		LlmIpcSchema,
		LogsIpcSchema,
		McpIpcSchema,
		NotesIpcSchema,
		OutputsIpcSchema,
		PerfIpcSchema,
		PetIpcSchema,
		ProjectsIpcSchema,
		ProvidersIpcSchema,
		ReaderIpcSchema,
		RemoteControlIpcSchema,
		SkillsIpcSchema,
		SourcesIpcSchema,
		StyleIpcSchema,
		SystemIpcSchema,
		TerminalIpcSchema,
		ThemeIpcSchema,
		TtsIpcSchema,
		UpdateIpcSchema,
		WebContentIpcSchema {}

export type IPCChannel = keyof IPCSchema;
