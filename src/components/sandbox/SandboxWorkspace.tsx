/**
 * SandboxWorkspace - 托管模式的沙盒工作区
 * 
 * 中间栏在托管模式下显示的内容：
 * - 左侧：文件树（按类型分组）
 * - 右侧：文件预览
 * 
 * 设计风格：Claude 高级质感
 */

import {
    ChevronDown,
    ChevronRight,
    Code2,
    Copy,
    Download,
    Eye,
    FileCode,
    FileImage,
    FileSpreadsheet,
    FileText,
    Files,
    FolderOpen,
    Home,
    Package,
    Search,
    Sparkles,
    X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
    formatFileSize,
    getFileIcon,
    groupFilesByCategory,
    useManagedModeStore,
    type SandboxFile,
} from "../../lib/managedModeStore";
import { cn } from "../../lib/utils";

// ==================== 文件树组件 ====================

interface FileCategoryGroupProps {
    files: SandboxFile[];
    title: string;
    icon: React.ReactNode;
    accentColor: string;
    isExpanded: boolean;
    onToggle: () => void;
    selectedFileId: string | null;
    onSelectFile: (fileId: string) => void;
}

function FileCategoryGroup({
    files,
    title,
    icon,
    accentColor,
    isExpanded,
    onToggle,
    selectedFileId,
    onSelectFile,
}: FileCategoryGroupProps) {
    if (files.length === 0) return null;

    return (
        <div className="mb-2">
            {/* 分组标题 */}
            <button
                type="button"
                onClick={onToggle}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/50 rounded-xl transition-all group"
            >
                <span className="text-zinc-400 dark:text-zinc-500 transition-transform group-hover:scale-110">
                    {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                    )}
                </span>
                <span className={cn("transition-colors", accentColor)}>
                    {icon}
                </span>
                <span className="flex-1 text-left">{title}</span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400">
                    {files.length}
                </span>
            </button>

            {/* 文件列表 */}
            {isExpanded && (
                <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-zinc-100 dark:border-zinc-700/50 pl-3">
                    {files.map((file) => (
                        <button
                            key={file.id}
                            type="button"
                            onClick={() => onSelectFile(file.id)}
                            className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-xl transition-all",
                                selectedFileId === file.id
                                    ? "bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/30 text-indigo-700 dark:text-indigo-300 shadow-sm ring-1 ring-indigo-200/50 dark:ring-indigo-700/30"
                                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                                file.isNew && "animate-pulse ring-2 ring-amber-400/50 ring-offset-1"
                            )}
                        >
                            <span className="text-base opacity-80">{getFileIcon(file)}</span>
                            <span className="truncate flex-1 text-left font-medium">{file.name}</span>
                            {file.isNew && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/50 dark:to-orange-900/40 text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wide">
                                    New
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ==================== 文件预览组件 ====================

interface FilePreviewProps {
    file: SandboxFile | null;
    previewMode: "preview" | "source";
    onSetPreviewMode: (mode: "preview" | "source") => void;
    onClose: () => void;
}

function FilePreview({
    file,
    previewMode,
    onSetPreviewMode,
    onClose,
}: FilePreviewProps) {
    const handleCopy = useCallback(async () => {
        if (file?.content) {
            await navigator.clipboard.writeText(file.content);
            // TODO: 显示 toast 提示
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

    // 空状态 - Claude 风格
    if (!file) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                {/* 装饰性背景 */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-br from-indigo-100/30 to-violet-100/20 dark:from-indigo-900/10 dark:to-violet-900/5 rounded-full blur-3xl" />
                    <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-gradient-to-br from-amber-100/20 to-orange-100/10 dark:from-amber-900/5 dark:to-orange-900/5 rounded-full blur-3xl" />
                </div>

                <div className="relative z-10">
                    <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-850 flex items-center justify-center shadow-lg ring-1 ring-black/5 dark:ring-white/5">
                        <Files className="w-10 h-10 text-zinc-400 dark:text-zinc-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-zinc-700 dark:text-zinc-200 mb-2">
                        选择文件预览
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-[240px]">
                        点击左侧文件树中的任意文件查看内容
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
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[repeating-conic-gradient(#f5f5f5_0%_25%,#fafafa_0%_50%)] dark:bg-[repeating-conic-gradient(#27272a_0%_25%,#18181b_0%_50%)] bg-[length:20px_20px]">
                    <img
                        src={file.path}
                        alt={file.name}
                        className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-2xl ring-1 ring-black/10"
                    />
                    <p className="mt-4 text-sm text-zinc-500 font-medium">
                        {formatFileSize(file.size)}
                    </p>
                </div>
            );
        }

        // Markdown 预览
        if (file.extension === "md" && previewMode === "preview") {
            return (
                <div className="flex-1 overflow-auto p-8 prose dark:prose-invert max-w-none prose-zinc prose-headings:font-semibold prose-a:text-indigo-600 dark:prose-a:text-indigo-400">
                    <pre className="whitespace-pre-wrap font-sans text-zinc-700 dark:text-zinc-300 leading-relaxed">{file.content}</pre>
                </div>
            );
        }

        // 代码/文本预览 - Claude 终端风格
        return (
            <div className="flex-1 overflow-auto bg-zinc-900 dark:bg-black rounded-xl m-4 shadow-inner">
                {/* 终端头部 */}
                <div className="sticky top-0 flex items-center gap-2 px-4 py-3 bg-zinc-800 dark:bg-zinc-900 border-b border-zinc-700/50">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    </div>
                    <span className="text-xs text-zinc-400 ml-2 font-mono">{file.name}</span>
                </div>
                <pre className="p-4 text-sm font-mono text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                    {file.content || "(无内容)"}
                </pre>
            </div>
        );
    };

    return (
        <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-lg ring-1 ring-black/5 dark:ring-white/5">
            {/* 文件头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-zinc-50 to-white dark:from-zinc-850 dark:to-zinc-900">
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/50 dark:to-violet-900/40 flex items-center justify-center shadow-sm ring-1 ring-indigo-200/50 dark:ring-indigo-700/30">
                        <span className="text-2xl">{getFileIcon(file)}</span>
                    </div>
                    <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">
                            {file.name}
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {formatFileSize(file.size)} • {file.extension.toUpperCase()} 文件
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* 预览/源码切换 */}
                    {file.extension === "md" && (
                        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 mr-2 ring-1 ring-black/5 dark:ring-white/5">
                            <button
                                type="button"
                                onClick={() => onSetPreviewMode("preview")}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                                    previewMode === "preview"
                                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                                        : "text-zinc-500 hover:text-zinc-700"
                                )}
                            >
                                <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onSetPreviewMode("source")}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                                    previewMode === "source"
                                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                                        : "text-zinc-500 hover:text-zinc-700"
                                )}
                            >
                                <Code2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
                    >
                        <X className="w-4 h-4 text-zinc-500" />
                    </button>
                </div>
            </div>

            {/* 文件内容 */}
            {renderContent()}

            {/* 底部操作栏 */}
            <div className="flex items-center gap-3 px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-zinc-50 to-white dark:from-zinc-850 dark:to-zinc-900">
                <button
                    type="button"
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 rounded-xl shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                >
                    <Download className="w-4 h-4" />
                    下载文件
                </button>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all shadow-sm"
                >
                    <Copy className="w-4 h-4" />
                    复制内容
                </button>
            </div>
        </div>
    );
}

// ==================== 主组件 ====================

interface SandboxWorkspaceProps {
    onExitManagedMode: () => void;
}

export default function SandboxWorkspace({
    onExitManagedMode,
}: SandboxWorkspaceProps) {
    const { files, selectedFileId, ui, store } = useManagedModeStore();
    const [searchQuery, setSearchQuery] = useState("");

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

    // 分类配置 - 带颜色
    const categories = [
        { key: "docs" as const, title: "文档", icon: <FileText className="w-4 h-4" />, color: "text-blue-500" },
        { key: "code" as const, title: "代码", icon: <FileCode className="w-4 h-4" />, color: "text-violet-500" },
        { key: "images" as const, title: "图片", icon: <FileImage className="w-4 h-4" />, color: "text-pink-500" },
        { key: "data" as const, title: "数据", icon: <FileSpreadsheet className="w-4 h-4" />, color: "text-emerald-500" },
        { key: "other" as const, title: "其他", icon: <FolderOpen className="w-4 h-4" />, color: "text-zinc-500" },
    ];

    const totalFiles = files.filter((f) => f.type === "file").length;

    return (
        <div className="flex flex-col h-full bg-gradient-to-br from-zinc-50 via-white to-zinc-50 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800">
            {/* 顶部工具栏 - Claude 风格 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/80 dark:border-zinc-700/50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={onExitManagedMode}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
                    >
                        <Home className="w-4 h-4" />
                        返回
                    </button>
                    <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
                            <Package className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                沙盒产物
                            </h2>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                {totalFiles} 个文件
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 rounded-xl shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                    >
                        <Download className="w-4 h-4" />
                        全部下载
                    </button>
                </div>
            </div>

            {/* 主体区域 */}
            <div className="flex flex-1 overflow-hidden">
                {/* 左侧文件树 */}
                <div className="w-72 flex-shrink-0 border-r border-zinc-200/80 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm overflow-y-auto">
                    {/* 搜索框 */}
                    <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                                type="text"
                                placeholder="搜索文件..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-500 transition-all placeholder:text-zinc-400"
                            />
                        </div>
                    </div>

                    {/* 文件分组 */}
                    <div className="p-3">
                        {totalFiles === 0 ? (
                            <div className="py-16 text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-850 flex items-center justify-center shadow-lg ring-1 ring-black/5 dark:ring-white/5">
                                    <Sparkles className="w-7 h-7 text-zinc-400" />
                                </div>
                                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-1">暂无文件</p>
                                <p className="text-xs text-zinc-400">等待 AI 生成产物...</p>
                            </div>
                        ) : (
                            categories.map((cat) => (
                                <FileCategoryGroup
                                    key={cat.key}
                                    files={filteredTree[cat.key]}
                                    title={cat.title}
                                    icon={cat.icon}
                                    accentColor={cat.color}
                                    isExpanded={ui.expandedFolders.has(cat.key)}
                                    onToggle={() => store.toggleFolderExpanded(cat.key)}
                                    selectedFileId={selectedFileId}
                                    onSelectFile={(id) => store.selectFile(id)}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* 右侧预览区 */}
                <div className="flex-1 flex flex-col overflow-hidden p-4 relative">
                    <FilePreview
                        file={selectedFile}
                        previewMode={ui.previewMode}
                        onSetPreviewMode={(mode) => store.setPreviewMode(mode)}
                        onClose={() => store.selectFile(null)}
                    />
                </div>
            </div>
        </div>
    );
}
