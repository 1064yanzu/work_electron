// 文件附件卡片组件
// 在用户消息中显示附加的文件，参考现代AI IDE的设计风格

import { File, FileArchive, FileText } from "lucide-react";
import { cn } from "../../lib/utils";

interface AttachedFile {
    title: string;
    path: string;
    type?: "file" | "document";
    size?: number;
}

interface AttachmentCardProps {
    file: AttachedFile;
}

// 获取文件图标
function getFileIcon(filename: string) {
    const ext = filename.split(".").pop()?.toLowerCase();

    // 压缩文件
    if (["rar", "zip", "7z", "tar", "gz"].includes(ext || "")) {
        return <FileArchive className="w-4 h-4 text-amber-500" />;
    }

    // 文档类型
    if (["doc", "docx", "pdf", "txt", "md", "rtf"].includes(ext || "")) {
        return <FileText className="w-4 h-4 text-blue-500" />;
    }

    // 默认文件图标
    return <File className="w-4 h-4 text-zinc-400" />;
}

// 获取文件类型标签
function getFileTypeLabel(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();

    if (["rar", "zip", "7z", "tar", "gz"].includes(ext || "")) {
        return "文件";
    }

    if (["doc", "docx"].includes(ext || "")) {
        return "文档";
    }

    if (ext === "pdf") {
        return "PDF";
    }

    if (["txt", "md"].includes(ext || "")) {
        return "文本";
    }

    return "文件";
}

// 单个附件卡片
export function AttachmentCard({ file }: AttachmentCardProps) {
    const icon = getFileIcon(file.title);
    const typeLabel = getFileTypeLabel(file.title);

    return (
        <div
            className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-xl",
                "bg-white dark:bg-zinc-800",
                "border border-zinc-200 dark:border-zinc-700",
                "hover:border-zinc-300 dark:hover:border-zinc-600",
                "transition-colors duration-200",
                "cursor-default shadow-sm",
            )}
        >
            {/* 图标容器 */}
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-700">
                {icon}
            </div>

            {/* 文件信息 */}
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
                    {file.title}
                </div>
                <div className="text-xs text-zinc-400">
                    {typeLabel}
                </div>
            </div>
        </div>
    );
}

// 附件列表组件
interface AttachmentListProps {
    files: AttachedFile[];
}

export function AttachmentList({ files }: AttachmentListProps) {
    if (!files || files.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 mb-2">
            {files.map((file, index) => (
                <AttachmentCard key={`${file.path}-${index}`} file={file} />
            ))}
        </div>
    );
}
