/**
 * Remote Chat Bridge
 *
 * 监听主进程 `remote-chat-inject` IPC 事件，
 * 将远程第三方渠道（如飞书）的消息注入到前端 UI 对话中。
 *
 * 工作原理：
 * 1. 后端 commandRouter 启动 Agent 后，通过 `webContents.send('remote-chat-inject')` 发送消息
 * 2. 本模块监听该事件，在当前会话中创建用户消息和流式助手消息
 * 3. 监听 `agent-sdk-event` IPC 事件（按 runId 过滤），实时更新前端 UI
 * 4. AgentEventMirror 在事件总线上独立镜像回复到第三方渠道（前端无需关心）
 */

import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "./tauriEventCompat";
import { chatStore } from "./chat/store";
import { createMessage } from "./chat/types";
import type { UIEvent } from "./agent/streamState";

/** 远程注入事件的载荷 */
export interface RemoteChatInjectPayload {
    runId: string;
    prompt: string;
    channelId: string;
    peerName: string;
    sessionId: string;
}

/** Agent SDK 事件载荷（简化版，仅取桥接需要的字段） */
interface AgentSdkEventPayload {
    runId?: string;
    type: string;
    events?: UIEvent[];
    result?: Record<string, unknown>;
    error?: string;
}

/**
 * useRemoteChatBridge
 *
 * 在 CopilotSidebar 中调用此钩子，即可让远程消息自动出现在 UI 中。
 * 不影响前端正常对话流程，也不影响 AgentEventMirror 的镜像行为。
 */
export function useRemoteChatBridge(): void {
    const activeRuns = useRef<Map<string, { msgId: string; textParts: string[] }>>(
        new Map(),
    );

    useEffect(() => {
        let unlistenInject: UnlistenFn | null = null;
        let unlistenSdkEvent: UnlistenFn | null = null;

        const setup = async () => {
            // 1. 监听远程消息注入
            unlistenInject = await listen<RemoteChatInjectPayload>(
                "remote-chat-inject",
                (event) => {
                    const { runId, prompt, channelId, peerName } = event.payload;
                    console.log(
                        "[RemoteChatBridge] Received remote message:",
                        { runId, channelId, peerName },
                    );

                    // 获取当前活跃会话（如果没有就创建一个）
                    let session = chatStore.getActiveSession();
                    if (!session) {
                        session = chatStore.createNewSession(`远程对话 - ${peerName}`);
                    }

                    // 创建用户消息（标注来源渠道）
                    const channelLabel = getChannelLabel(channelId);
                    const userMessage = createMessage("user", prompt, {
                        metadata: {
                            attachedFiles: [],
                        },
                    });
                    // 在内容前加上渠道标签
                    userMessage.content = `[${channelLabel} · ${peerName}] ${prompt}`;
                    chatStore.addMessage(session.id, userMessage);

                    // 创建流式助手消息
                    const assistantMsg = createMessage("assistant", "", {
                        isStreaming: true,
                    });
                    chatStore.addMessage(session.id, assistantMsg);

                    // 记录这个 runId 对应的助手消息
                    activeRuns.current.set(runId, {
                        msgId: assistantMsg.id,
                        textParts: [],
                    });
                },
            );

            // 2. 监听 Agent SDK 事件，过滤属于远程 run 的事件更新 UI
            unlistenSdkEvent = await listen<AgentSdkEventPayload>(
                "agent-sdk-event",
                (event) => {
                    const payload = event.payload;
                    if (!payload.runId) return;

                    const run = activeRuns.current.get(payload.runId);
                    if (!run) return; // 不是远程注入的 run，忽略

                    const session = chatStore.getActiveSession();
                    if (!session) return;

                    // 处理 transformed 事件（text_delta）
                    if (payload.type === "transformed" && Array.isArray(payload.events)) {
                        for (const uiEvent of payload.events) {
                            if (
                                uiEvent.type === "text_delta" &&
                                typeof uiEvent.content === "string"
                            ) {
                                run.textParts.push(uiEvent.content);
                                chatStore.updateMessage(session.id, run.msgId, {
                                    content: run.textParts.join(""),
                                    isStreaming: true,
                                });
                            }
                        }
                        return;
                    }

                    // 处理完成事件
                    if (payload.type === "done") {
                        // 尝试从 result 中提取最终文本
                        const resultText =
                            typeof payload.result?.result === "string"
                                ? (payload.result.result as string)
                                : "";

                        const finalContent = run.textParts.join("") || resultText || "（任务完成）";

                        chatStore.updateMessage(session.id, run.msgId, {
                            content: finalContent,
                            isStreaming: false,
                        });

                        activeRuns.current.delete(payload.runId);
                        return;
                    }

                    // 处理错误事件
                    if (payload.type === "error") {
                        const errorText = payload.error || "未知错误";
                        const current = run.textParts.join("");

                        chatStore.updateMessage(session.id, run.msgId, {
                            content: current
                                ? `${current}\n\n❌ 错误: ${errorText}`
                                : `❌ 远程任务出错: ${errorText}`,
                            isStreaming: false,
                        });

                        activeRuns.current.delete(payload.runId);
                        return;
                    }
                },
            );
        };

        setup().catch((err) => {
            console.error("[RemoteChatBridge] Setup failed:", err);
        });

        return () => {
            unlistenInject?.();
            unlistenSdkEvent?.();
        };
    }, []);
}

/** 渠道 ID 到中文标签的映射 */
function getChannelLabel(channelId: string): string {
    const labels: Record<string, string> = {
        feishu: "飞书",
        telegram: "Telegram",
        slack: "Slack",
        discord: "Discord",
        generic_webhook: "Webhook",
    };
    return labels[channelId] ?? channelId;
}
