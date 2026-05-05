/**
 * Barrel re-export 入口。历史保持单文件 import；实际定义在 `./config/*.ts`。
 *
 * 重构记录（2026-05-05）：原 1413 行单文件按领域拆为 8 个子文件；
 * 原先散落在末尾的远程控制函数（getRemoteControlConfig / setRemoteControlConfig /
 * getRemoteControlRuntimeStatus / listRemoteChannels / listRemotePairings /
 * approveRemotePairing / rejectRemotePairing / revokeRemotePairing /
 * listRemoteSessions / terminateRemoteSession / testRemoteChannel）
 * 均为 0 引用的死代码（被 src/lib/api/remoteControl.ts 取代），已删除。
 */

export * from "./config/browser";
export * from "./config/centerUx";
export * from "./config/core";
export * from "./config/mcp";
export * from "./config/motion";
export * from "./config/performance";
export * from "./config/search";
export * from "./config/skills";
