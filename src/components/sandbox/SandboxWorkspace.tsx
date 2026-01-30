/**
 * SandboxWorkspace - 托管模式的沙盒工作区
 * 
 * 功能：
 * 1. 视角切换：文件视角 / 预览视角
 * 2. 可调整比例的左右面板
 * 3. 全中文界面
 */

import {
    ChevronDown,
    ChevronRight,
    Code,
    Copy,
    Download,
    Eye,
    Sparkles,
    FileCode,
    FileText,
    Database,
    Search,
    X,
    Image as ImageIcon,
    RefreshCw,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
    formatFileSize,
    groupFilesByCategory,
    useManagedModeStore,
    type SandboxFile,
} from "../../lib/managedModeStore";
import { useAgentStore } from "../../lib/agent/store";
import type { AgentTaskStatus, ToolCall } from "../../lib/agent/types";
import { cn } from "../../lib/utils";
import { getImageDataUrl } from "../../lib/agent/imageDataUrlCache";
import { useChatStore } from "../../lib/chat/store";
import { Loader2 } from "lucide-react";
import { ExecutionGraph, type ExecutionGraphSource } from "./ExecutionGraph";

// ==================== 图片预览组件 ====================

const SandboxImagePreview = memo(function SandboxImagePreview({ filePath, fileName, fileSize }: { filePath: string; fileName: string; fileSize: number }) {
    const [dataUrl, setDataUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setDataUrl(null);
        setError(null);

        getImageDataUrl(filePath)
            .then(url => {
                if (!cancelled) setDataUrl(url);
            })
            .catch(err => {
                if (!cancelled) setError(err.message || "加载失败");
            });

        return () => { cancelled = true; };
    }, [filePath]);

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-900">
                <div className="text-sm text-red-500">图片加载失败: {error}</div>
            </div>
        );
    }

    if (!dataUrl) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-900">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                <p className="mt-2 text-sm text-zinc-400">加载中...</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-900">
            <div className="bg-white dark:bg-zinc-800 p-2 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700">
                <img
                    src={dataUrl}
                    alt={fileName}
                    className="max-w-full max-h-[60vh] object-contain rounded"
                />
            </div>
            <p className="mt-3 text-xs text-zinc-500 font-mono">
                {formatFileSize(fileSize)}
            </p>
        </div>
    );
});

// ==================== 文件树组件 ====================

interface FileCategoryGroupProps {
    files: SandboxFile[];
    title: string;
    isExpanded: boolean;
    onToggle: () => void;
    selectedFileId: string | null;
    onSelectFile: (fileId: string) => void;
}

const FileCategoryGroup = memo(function FileCategoryGroup({
    files,
    title,
    isExpanded,
    onToggle,
    selectedFileId,
    onSelectFile,
}: FileCategoryGroupProps) {
    if (files.length === 0) return null;

    return (
        <div className="mb-3">
            {/* 分组标题 */}
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center gap-1.5 px-3 py-1 w-full group text-left"
            >
                <span className="text-zinc-400 transition-transform">
                    {isExpanded ? (
                        <ChevronDown className="w-3 h-3" />
                    ) : (
                        <ChevronRight className="w-3 h-3" />
                    )}
                </span>
                <span className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
                    {title}
                </span>
                <span className="text-[10px] text-zinc-400 ml-1">
                    {files.length}
                </span>
            </button>

            {/* 文件列表 */}
            {isExpanded && (
                <div className="mt-0.5 space-y-px">
                    {files.map((file) => {
                        const isSelected = selectedFileId === file.id;
                        return (
                            <button
                                key={file.id}
                                type="button"
                                onClick={() => onSelectFile(file.id)}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-1.5 text-[13px] transition-colors",
                                    isSelected
                                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                )}
                            >
                                <span className={cn("shrink-0", isSelected ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400")}>
                                    {getFileTypeIcon(file)}
                                </span>
                                <span className="truncate flex-1 text-left">{file.name}</span>
                                {file.isNew && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
});

// 缓存文件类型图标组件
const FileTypeIcons = {
    code: <FileCode className="w-3.5 h-3.5" />,
    images: <ImageIcon className="w-3.5 h-3.5" />,
    data: <Database className="w-3.5 h-3.5" />,
    docs: <FileText className="w-3.5 h-3.5" />,
    other: <FileText className="w-3.5 h-3.5" />,
} as const;

function getFileTypeIcon(file: SandboxFile) {
    return FileTypeIcons[file.category] || FileTypeIcons.other;
}

// ==================== 文件预览组件 ====================

interface FilePreviewProps {
    file: SandboxFile | null;
    previewMode: "preview" | "source";
    onSetPreviewMode: (mode: "preview" | "source") => void;
    onLoadContent: (fileId: string) => Promise<void>;
}

const FilePreview = memo(function FilePreview({ file, previewMode, onSetPreviewMode, onLoadContent }: FilePreviewProps) {
    // 懒加载文件内容
    useEffect(() => {
        if (file && file.content === undefined) {
            onLoadContent(file.id);
        }
    }, [file, onLoadContent]);
    const handleCopy = useCallback(async () => {
        if (file?.content) {
            await navigator.clipboard.writeText(file.content);
        }
    }, [file]);

    const handleDownload = useCallback(() => {
        if (!file?.content) return;
        const blob = new Blob([file.content], { type: file.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
    }, [file]);

    // 空状态
    if (!file) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-zinc-900">
                <div className="text-center space-y-2">
                    <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-300">
                        选择文件预览
                    </h3>
                    <p className="text-sm text-zinc-400">
                        点击左侧文件查看内容
                    </p>
                </div>
            </div>
        );
    }

    // 渲染预览内容
    const renderContent = () => {
        // 图片预览
        if (file.category === "images") {
            return (
                <SandboxImagePreview filePath={file.path} fileName={file.name} fileSize={file.size} />
            );
        }

        // Markdown 预览
        if (file.extension === "md" && previewMode === "preview") {
            return (
                <div className="flex-1 overflow-auto bg-white dark:bg-zinc-900 px-8 py-6">
                    <div className="max-w-3xl mx-auto prose dark:prose-invert prose-zinc">
                        <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                            {file.content}
                        </pre>
                    </div>
                </div>
            );
        }

        // 代码/文本预览
        return (
            <div className="flex-1 overflow-auto bg-zinc-900 dark:bg-black">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-800 dark:bg-zinc-900 sticky top-0">
                    <div className="flex gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-red-500/70" />
                        <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
                        <span className="w-3 h-3 rounded-full bg-green-500/70" />
                    </div>
                    <span className="text-xs text-zinc-500 font-mono ml-2">{file.name}</span>
                </div>
                <pre className="p-4 text-[13px] font-mono text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                    {file.content || ""}
                </pre>
            </div>
        );
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-900">
            {/* 头部工具栏 */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{file.name}</span>
                    <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                        {file.extension.toUpperCase()}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    {/* Markdown 预览切换 */}
                    {file.extension === "md" && (
                        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 mr-2">
                            <button
                                type="button"
                                onClick={() => onSetPreviewMode("preview")}
                                className={cn(
                                    "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                                    previewMode === "preview"
                                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                                        : "text-zinc-500 hover:text-zinc-700"
                                )}
                            >
                                预览
                            </button>
                            <button
                                type="button"
                                onClick={() => onSetPreviewMode("source")}
                                className={cn(
                                    "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                                    previewMode === "source"
                                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                                        : "text-zinc-500 hover:text-zinc-700"
                                )}
                            >
                                源码
                            </button>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleCopy}
                        className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                        title="复制"
                    >
                        <Copy className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={handleDownload}
                        className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                        title="下载"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* 内容区 */}
            {renderContent()}
        </div>
    );
});

// ==================== 产物预览组件（预览视角） ====================

interface ArtifactPreviewProps {
    file: SandboxFile | null;
}

const ArtifactPreview = memo(function ArtifactPreview({ file }: ArtifactPreviewProps) {
    if (!file) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-900">
                <div className="text-center space-y-2">
                    <h3 className="text-lg font-medium text-zinc-300">
                        暂无预览
                    </h3>
                    <p className="text-sm text-zinc-500">
                        选择一个产物开始预览
                    </p>
                </div>
            </div>
        );
    }

    // 图片预览
    if (file.category === "images") {
        return (
            <SandboxImagePreview filePath={file.path} fileName={file.name} fileSize={file.size} />
        );
    }

    // HTML/React 产物预览
    if (file.extension === "html" || file.extension === "tsx" || file.extension === "jsx") {
        return (
            <div className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-900">
                {/* 预览工具栏 */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{file.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>实时预览</span>
                    </div>
                </div>
                {/* iframe 预览内容 */}
                <div className="flex-1 bg-white">
                    <iframe
                        srcDoc={file.content}
                        className="w-full h-full border-0"
                        title="产物预览"
                        sandbox="allow-scripts"
                    />
                </div>
            </div>
        );
    }

    // Markdown 预览
    if (file.extension === "md") {
        return (
            <div className="flex-1 overflow-auto bg-white dark:bg-zinc-900 px-8 py-6">
                <div className="max-w-3xl mx-auto prose dark:prose-invert prose-zinc">
                    <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {file.content}
                    </pre>
                </div>
            </div>
        );
    }

    // 代码/文本预览 (通用)
    if (file.category === "code" || file.category === "data" || file.category === "docs") {
        return (
            <div className="flex-1 overflow-auto bg-zinc-900 dark:bg-black">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-800 dark:bg-zinc-900 sticky top-0">
                    <div className="flex gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-red-500/70" />
                        <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
                        <span className="w-3 h-3 rounded-full bg-green-500/70" />
                    </div>
                    <span className="text-xs text-zinc-500 font-mono ml-2">{file.name}</span>
                </div>
                <pre className="p-4 text-[13px] font-mono text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                    {file.content || ""}
                </pre>
            </div>
        );
    }

    // 其他类型显示提示
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-900">
            <div className="text-center space-y-2">
                <p className="text-sm text-zinc-500">
                    此文件类型不支持实时预览
                </p>
                <p className="text-xs text-zinc-400">
                    请切换到文件视角查看内容
                </p>
            </div>
        </div>
    );
});

// ==================== 主组件 ====================

interface SandboxWorkspaceProps {
    onExitManagedMode: () => void;
}

export default function SandboxWorkspace({
    onExitManagedMode,
}: SandboxWorkspaceProps) {
    const { files, selectedFileId, ui, store } = useManagedModeStore();
    const { currentTask, taskHistory, isExecuting } = useAgentStore();
    const [searchQuery, setSearchQuery] = useState("");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

    // 引入 chatStore 来监听会话切换
    const { activeSessionId, sessions } = useChatStore();
    const activeSession = sessions.find(s => s.id === activeSessionId);

    // ===== 会话绑定：画布/文件/预览都跟随 activeSession =====

    const sessionTaskId = useMemo(() => {
        if (!activeSession) return null;

        for (let i = activeSession.messages.length - 1; i >= 0; i--) {
            const msg = activeSession.messages[i];
            const metadata = msg.metadata;
            if (typeof metadata?.taskId === "string" && metadata.taskId) return metadata.taskId;
            const trace = metadata?.trace;
            if (trace?.type === "agent_task") return trace.taskId;
            if (trace?.type === "tool_call") return trace.taskId;
            if (Array.isArray(metadata?.blocks)) {
                for (let j = metadata.blocks.length - 1; j >= 0; j--) {
                    const b = metadata.blocks[j] as any;
                    if (b?.type === "agent_task" || b?.type === "task_list") return b.taskId;
                    if (b?.type === "tool_call") return b.taskId;
                }
            }
        }

        return null;
    }, [activeSession]);

    const sessionSandboxDir = useMemo(() => {
        if (!activeSession) return undefined;
        for (let i = activeSession.messages.length - 1; i >= 0; i--) {
            const msg = activeSession.messages[i];
            if (msg.metadata?.sandboxDir) return msg.metadata.sandboxDir as string;
        }
        return undefined;
    }, [activeSession]);

    const boundTask = useMemo(() => {
        if (!sessionTaskId) return null;
        if (currentTask?.id === sessionTaskId) return currentTask;
        return taskHistory.find(t => t.id === sessionTaskId) || null;
    }, [currentTask, sessionTaskId, taskHistory]);

    const sandboxDir = useMemo(() => {
        const fromTask = boundTask?.metadata?.sandboxDir as string | undefined;
        return fromTask || sessionSandboxDir;
    }, [boundTask, sessionSandboxDir]);

    const graphSource = useMemo<ExecutionGraphSource | null>(() => {
        if (boundTask) {
            return {
                id: boundTask.id,
                title: boundTask.title || "托管任务",
                subtitle: boundTask.query,
                status: boundTask.status,
                toolCalls: boundTask.toolCalls || [],
                artifacts: boundTask.artifacts || [],
            };
        }

        if (!activeSession) return null;
        if (!sessionTaskId) return null;

        // 历史会话恢复：从 blocks 中拼一个最小可用的数据源
        const normalizeToolCallStatus = (v: unknown): ToolCall["status"] => {
            switch (v) {
                case "pending":
                case "running":
                case "completed":
                case "error":
                case "cancelled":
                    return v;
                default:
                    return "completed";
            }
        };

        const order: string[] = [];
        const seen = new Set<string>();
        type ToolCallBlockLike = {
            toolCallId?: string;
            toolType?: string;
            name?: string;
            status?: unknown;
            input?: unknown;
            output?: unknown;
            error?: unknown;
        };
        const toolCallById = new Map<string, ToolCallBlockLike>();

        for (const msg of activeSession.messages) {
            const blocks = msg.metadata?.blocks;
            if (!Array.isArray(blocks)) continue;
            for (const b of blocks as any[]) {
                if (b?.type !== "tool_call") continue;
                if (b.taskId !== sessionTaskId) continue;
                const id = String(b.toolCallId || "").trim();
                if (!id) continue;
                if (!seen.has(id)) {
                    seen.add(id);
                    order.push(id);
                }
                const prev = toolCallById.get(id) || {};
                toolCallById.set(id, { ...prev, ...b } as ToolCallBlockLike);
            }
        }

        const toolCalls: ToolCall[] = order.map((id) => {
            const b = toolCallById.get(id) || {};
            const inputRaw = (b as any).input;
            const input =
                inputRaw && typeof inputRaw === "object"
                    ? (inputRaw as Record<string, any>)
                    : ({} as Record<string, any>);
            return {
                id,
                type: "custom",
                name: String((b as any).name || (b as any).toolType || "Tool"),
                input,
                output: (b as any).output,
                error: typeof (b as any).error === "string" ? (b as any).error : undefined,
                status: normalizeToolCallStatus((b as any).status),
                metadata: { toolType: (b as any).toolType },
            };
        });

        const hasRunning = toolCalls.some((t) => t.status === "running" || t.status === "pending");
        const hasError = toolCalls.some((t) => t.status === "error");
        const allCompleted = toolCalls.length > 0 && toolCalls.every((t) => t.status === "completed");
        const status: AgentTaskStatus =
            hasRunning ? "executing" : hasError ? "error" : allCompleted ? "completed" : "waiting";

        return {
            id: sessionTaskId,
            title: activeSession.title || "托管任务",
            subtitle: activeSession.messages.slice().reverse().find(m => m.role === "user")?.content,
            status,
            toolCalls,
            artifacts: [],
        };
    }, [activeSession, boundTask, sessionTaskId]);

    // 刷新文件列表
    const refreshFiles = useCallback(async () => {
        if (!sandboxDir) return;
        setIsRefreshing(true);
        try {
            await store.scanSandboxDir(sandboxDir);
        } finally {
            setIsRefreshing(false);
        }
    }, [sandboxDir, store]);

    const isLiveBoundTask =
        Boolean(isExecuting && boundTask && currentTask && boundTask.id === currentTask.id);

    // 会话切换时，清理旧的文件/选择，避免“串会话”
    useEffect(() => {
        if (refreshTimerRef.current) {
            clearInterval(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
        store.selectFile(null);
        store.clearFiles();
    }, [activeSessionId, store]);

    // 扫描沙盒目录：历史会话只扫一次；执行中会话定时刷新
    useEffect(() => {
        if (refreshTimerRef.current) {
            clearInterval(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }

        if (!sandboxDir) {
            store.clearFiles();
            return;
        }

        store.scanSandboxDir(sandboxDir);

        if (!isLiveBoundTask) return;
        refreshTimerRef.current = setInterval(() => {
            store.scanSandboxDir(sandboxDir);
        }, 5000);

        return () => {
            if (refreshTimerRef.current) {
                clearInterval(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
    }, [isLiveBoundTask, sandboxDir, store]);

    // 分组文件
    const fileTree = useMemo(() => groupFilesByCategory(files), [files]);

    // 过滤文件
    const filteredTree = useMemo(() => {
        if (!searchQuery.trim()) return fileTree;
        const query = searchQuery.toLowerCase();
        const filterFiles = (arr: SandboxFile[]) =>
            arr.filter((f) => f.name.toLowerCase().includes(query));
        return {
            docs: filterFiles(fileTree.docs),
            code: filterFiles(fileTree.code),
            images: filterFiles(fileTree.images),
            data: filterFiles(fileTree.data),
            other: filterFiles(fileTree.other),
        };
    }, [fileTree, searchQuery]);

    // 当前选中的文件
    const selectedFile = useMemo(
        () => files.find((f) => f.id === selectedFileId) || null,
        [files, selectedFileId]
    );

    // 分类配置
    const categories = [
        { key: "docs" as const, title: "文档" },
        { key: "code" as const, title: "代码" },
        { key: "images" as const, title: "图片" },
        { key: "data" as const, title: "数据" },
        { key: "other" as const, title: "其他" },
    ];

    const totalFiles = files.filter((f) => f.type === "file").length;
    const headerTitle =
        ui.centerView === "graph"
            ? "运行图"
            : ui.centerView === "preview"
                ? "产物预览"
                : "沙盒文件";
    const headerMeta =
        ui.centerView === "graph"
            ? graphSource
                ? `工具 ${graphSource.toolCalls.length} · 产物 ${graphSource.artifacts.length}`
                : `文件 ${totalFiles}`
            : `${totalFiles} 个文件`;

    const openArtifactInPreview = useCallback(
        async (filePath: string) => {
            const fileId = store.selectFileByPath(filePath);
            store.setCenterView("preview");
            if (fileId) await store.loadFileContent(fileId);
        },
        [store],
    );

    return (
        <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
            {/* 顶部工具栏 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
                <div className="flex items-center gap-3">
                    {/* 视角切换按钮 */}
                    <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                        <button
                            type="button"
                            onClick={() => store.setCenterView("graph")}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                ui.centerView === "graph"
                                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
                            )}
                            title="运行图"
                        >
                            <Sparkles className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => store.setCenterView("preview")}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                ui.centerView === "preview"
                                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            )}
                            title="预览视角"
                        >
                            <Eye className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => store.setCenterView("files")}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                ui.centerView === "files"
                                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            )}
                            title="文件视角"
                        >
                            <Code className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />

                    <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        {headerTitle}
                        <span className="ml-2 text-xs text-zinc-400 font-normal">
                            {headerMeta}
                        </span>
                    </h2>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={refreshFiles}
                        disabled={isRefreshing}
                        className={cn(
                            "p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors",
                            isRefreshing && "animate-spin"
                        )}
                        title="刷新文件列表"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onExitManagedMode}
                        className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                        title="关闭"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {ui.centerView === "graph" ? (
                <ExecutionGraph source={graphSource} onOpenArtifact={openArtifactInPreview} />
            ) : (
                /* 主体区域 - 可调整比例 */
                <PanelGroup direction="horizontal" className="flex-1">
                    {/* 左侧文件树面板 */}
                    <Panel defaultSize={25} minSize={15} maxSize={40}>
                        <div className="h-full flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                            {/* 搜索框 */}
                            <div className="p-3 border-b border-zinc-100 dark:border-zinc-800">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                                    <input
                                        type="text"
                                        placeholder="搜索文件..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 transition-all placeholder:text-zinc-400"
                                    />
                                </div>
                            </div>

                            {/* 文件树 */}
                            <div className="flex-1 overflow-y-auto py-2">
                                {totalFiles === 0 ? (
                                    <div className="px-4 py-8 text-center">
                                        <p className="text-sm text-zinc-400 mb-1">暂无文件</p>
                                        <p className="text-xs text-zinc-300">等待 AI 生成...</p>
                                    </div>
                                ) : (
                                    categories.map((cat) => (
                                        <FileCategoryGroup
                                            key={cat.key}
                                            files={filteredTree[cat.key]}
                                            title={cat.title}
                                            isExpanded={ui.expandedFolders.has(cat.key)}
                                            onToggle={() => store.toggleFolderExpanded(cat.key)}
                                            selectedFileId={selectedFileId}
                                            onSelectFile={(id) => store.selectFile(id)}
                                        />
                                    ))
                                )}
                            </div>

                            {/* 底部 */}
                            {totalFiles > 0 && (
                                <div className="p-3 border-t border-zinc-100 dark:border-zinc-800">
                                    <button className="w-full py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors">
                                        全部下载
                                    </button>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* 可拖拽分隔条 */}
                    <PanelResizeHandle className="w-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-col-resize" />

                    {/* 右侧内容面板 */}
                    <Panel defaultSize={75} minSize={40}>
                        {ui.centerView === "files" ? (
                            <FilePreview
                                file={selectedFile}
                                previewMode={ui.previewMode}
                                onSetPreviewMode={(mode) => store.setPreviewMode(mode)}
                                onLoadContent={async (fileId) => {
                                    await store.loadFileContent(fileId);
                                }}
                            />
                        ) : (
                            <ArtifactPreview file={selectedFile} />
                        )}
                    </Panel>
                </PanelGroup>
            )}
        </div>
    );
}
