/**
 * docProtocol.ts - AI 文档协议解析工具函数
 *
 * 从 CopilotSidebar 中抽取的纯函数（无 UI 依赖），
 * 用于解析 AI 响应中的文档创建/更新协议和对话上下文构建。
 */

import { diffLines } from "diff";
import type { ChatMessage as ChatMessageType } from "./types";

// AI 写作标记
export const WRITE_START_MARKER = "<<<WRITE>>>";
export const WRITE_END_MARKER = "<<<END>>>";

/**
 * 解析 AI 响应中的写入内容
 */
export function parseWriteContent(content: string): {
    displayContent: string;
    writeContent: string | null;
} {
    const startIdx = content.indexOf(WRITE_START_MARKER);
    const endIdx = content.indexOf(WRITE_END_MARKER);

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const writeContent = content
            .slice(startIdx + WRITE_START_MARKER.length, endIdx)
            .trim();
        const displayContent =
            content.slice(0, startIdx) +
            content.slice(endIdx + WRITE_END_MARKER.length);
        return { displayContent: displayContent.trim(), writeContent };
    }

    return { displayContent: content, writeContent: null };
}

/**
 * 解析 AI 文档操作协议（:::update-doc 和 :::create-doc）
 */
export function parseDocProtocolFinal(
    full: string,
    options: {
        activeDocContent?: string;
        hasActiveDoc?: boolean;
        prompt: string;
    },
):
    | { kind: "none"; displayContent: string }
    | {
        kind: "update";
        displayContent: string;
        suggestedContent: string;
        fileUpdate: {
            fileName: string;
            type: "update";
            additions: number;
            deletions: number;
        };
        eventPayload: {
            originalContent: string;
            suggestedContent: string;
            prompt: string;
        };
    }
    | {
        kind: "create";
        displayContent: string;
        title: string;
        summary: string;
        content: string;
        fileUpdate: {
            fileName: string;
            type: "create";
            additions: number;
            deletions: number;
        };
        eventPayload: {
            title: string;
            summary: string;
            content: string;
            prompt: string;
        };
    } {
    const extractProtocolSection = (
        raw: string,
        marker: ":::update-doc" | ":::create-doc",
    ): {
        fullMatchText: string;
        sectionText: string;
    } | null => {
        const startIdx = raw.indexOf(marker);
        if (startIdx < 0) return null;
        const after = raw.slice(startIdx + marker.length);
        const endRel = after.indexOf(":::");
        const endIdx =
            endRel >= 0 ? startIdx + marker.length + endRel + 3 : raw.length;
        const sectionText = (endRel >= 0 ? after.slice(0, endRel) : after).trim();
        const fullMatchText = raw.slice(startIdx, endIdx);
        return { fullMatchText, sectionText };
    };

    const updateSection = extractProtocolSection(full, ":::update-doc");
    if (updateSection) {
        const suggestedContent = updateSection.sectionText;
        if (!options.hasActiveDoc) {
            const docContent = suggestedContent;
            const changes = diffLines("", docContent);
            let additions = 0;
            let deletions = 0;
            changes.forEach((part) => {
                if (part.added) additions += part.count || 0;
                if (part.removed) deletions += part.count || 0;
            });

            const title = options.prompt?.trim()
                ? options.prompt.trim().slice(0, 80)
                : "新文档";
            const summary = docContent.replace(/\s+/g, " ").trim().slice(0, 120);

            return {
                kind: "create",
                displayContent: full.replace(
                    updateSection.fullMatchText,
                    "\n<<<AI_CREATE_DONE>>>\n",
                ),
                title,
                summary,
                content: docContent,
                fileUpdate: {
                    fileName: title,
                    type: "create",
                    additions,
                    deletions,
                },
                eventPayload: {
                    title,
                    summary,
                    content: docContent,
                    prompt: options.prompt,
                },
            };
        }
        const originalContent = options.activeDocContent ?? "";
        const changes = diffLines(originalContent, suggestedContent);
        let additions = 0;
        let deletions = 0;
        changes.forEach((part) => {
            if (part.added) additions += part.count || 0;
            if (part.removed) deletions += part.count || 0;
        });

        return {
            kind: "update",
            displayContent: full.replace(
                updateSection.fullMatchText,
                "\n<<<AI_UPDATE_DONE>>>\n",
            ),
            suggestedContent,
            fileUpdate: {
                fileName: "当前文档",
                type: "update",
                additions,
                deletions,
            },
            eventPayload: {
                originalContent,
                suggestedContent,
                prompt: options.prompt,
            },
        };
    }

    const createSection = extractProtocolSection(full, ":::create-doc");
    if (createSection) {
        const docContentBuffer = createSection.sectionText;
        const lines = docContentBuffer.split("\n");
        let title = "新文档";
        let summary = "";
        let docContent = docContentBuffer;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith("标题:") || line.startsWith("标题：")) {
                title = line.replace(/^标题[:：]\s*/, "");
            } else if (line.startsWith("摘要:") || line.startsWith("摘要：")) {
                summary = line.replace(/^摘要[:：]\s*/, "");
            } else if (line.startsWith("内容:") || line.startsWith("内容：")) {
                docContent = lines
                    .slice(i + 1)
                    .join("\n")
                    .trim();
                break;
            }
        }

        const changes = diffLines("", docContent);
        let additions = 0;
        changes.forEach((part) => {
            if (part.added) additions += part.count || 0;
        });

        return {
            kind: "create",
            displayContent: full.replace(
                createSection.fullMatchText,
                "\n<<<AI_CREATE_DONE>>>\n",
            ),
            title,
            summary,
            content: docContent,
            fileUpdate: {
                fileName: title,
                type: "create",
                additions,
                deletions: 0,
            },
            eventPayload: {
                title,
                summary: docContent,
                content: docContent,
                prompt: options.prompt,
            },
        };
    }

    return { kind: "none", displayContent: full };
}

/**
 * 对文本进行分词，用于对话上下文相关性匹配
 */
export function tokenizeForRecall(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
        .split(/[^\p{L}\p{N}]+/u)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2)
        .slice(0, 10);
}

/**
 * 构建 Agent 对话上下文（带相关性召回）
 */
export function buildAgentConversationContext(
    messages: ChatMessageType[],
    currentQuery: string,
    options?: { maxLines?: number; tailKeep?: number; headRelevant?: number },
): string[] {
    const maxLines = options?.maxLines ?? 12;
    const tailKeep = options?.tailKeep ?? 8;
    const headRelevant = options?.headRelevant ?? 4;

    const filtered = messages
        .filter(
            (m) =>
                (m.role === "user" || m.role === "assistant") &&
                typeof m.content === "string" &&
                m.content.trim().length > 0,
        )
        .map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp || 0,
        }));

    if (filtered.length === 0) return [];

    const tail = filtered.slice(-tailKeep);
    const tokens = tokenizeForRecall(currentQuery);

    const tailIds = new Set(tail.map((m) => m.id));
    const scored = filtered
        .filter((m) => !tailIds.has(m.id))
        .map((m) => {
            const text = m.content.toLowerCase();
            const score = tokens.reduce(
                (acc, t) => acc + (text.includes(t) ? 1 : 0),
                0,
            );
            return { ...m, score };
        })
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score || a.timestamp - b.timestamp)
        .slice(0, headRelevant)
        .sort((a, b) => a.timestamp - b.timestamp);

    const picked = [...scored, ...tail]
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-maxLines);
    // 限制每条消息的长度，避免对话历史过长
    return picked.map((m) => {
        const truncated =
            m.content.length > 500 ? m.content.slice(0, 500) + "..." : m.content;
        return `${m.role === "user" ? "用户" : "AI"}: ${truncated}`;
    });
}

/**
 * 猜测回退搜索查询（用于当用户消息过于通用时）
 */
export function guessFallbackSearchQuery(
    messages: ChatMessageType[],
): string | null {
    const isGeneric = (t: string) => {
        const s = t.trim();
        if (!s) return true;
        return (
            s === "请你搜索" ||
            s === "再次搜索" ||
            s === "不对" ||
            s === "不对，再次搜索" ||
            s === "继续" ||
            s === "再来一次" ||
            s === "重试"
        );
    };

    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role !== "user") continue;
        const text = typeof m.content === "string" ? m.content : "";
        if (!isGeneric(text)) return text.trim();
    }
    return null;
}
