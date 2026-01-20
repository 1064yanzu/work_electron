/**
 * ArtifactSection - 产物区块组件
 * 用于在 ToolCallInline 中显示工具调用产生的文件产物
 */
import { useState } from "react";
import {
    downloadArtifact,
    importArtifactToLibrary,
    revealArtifact,
    type ArtifactMetadata,
} from "../../lib/api";
import { cn } from "../../lib/utils";
import ArtifactCard, { type ArtifactFileType } from "./ArtifactCard";
import ArtifactPreviewModal from "./ArtifactPreviewModal";

export interface ArtifactSectionProps {
    artifacts: ArtifactMetadata[];
    className?: string;
}

export default function ArtifactSection({
    artifacts,
    className,
}: ArtifactSectionProps) {
    const [previewArtifact, setPreviewArtifact] = useState<ArtifactMetadata | null>(null);

    if (!artifacts || artifacts.length === 0) return null;

    // 处理预览
    const handlePreview = (artifact: ArtifactMetadata) => {
        setPreviewArtifact(artifact);
    };

    // 处理下载
    const handleDownload = async (id: string) => {
        try {
            await downloadArtifact(id);
        } catch (err) {
            console.error("下载失败:", err);
        }
    };

    // 处理打开文件夹
    const handleReveal = async (id: string) => {
        try {
            await revealArtifact(id);
        } catch (err) {
            console.error("打开文件夹失败:", err);
        }
    };

    // 处理导入资料库
    const handleImportToLibrary = async (id: string) => {
        try {
            await importArtifactToLibrary(id);
        } catch (err) {
            console.error("导入资料库失败:", err);
        }
    };

    return (
        <>
            <div className={cn("space-y-2 mt-3", className)}>
                <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1 flex items-center gap-2">
                    <span>生成的文件</span>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                        {artifacts.length}
                    </span>
                </div>
                <div className="space-y-2">
                    {artifacts.map((artifact) => (
                        <ArtifactCard
                            key={artifact.id}
                            id={artifact.id}
                            fileName={artifact.file_name}
                            filePath={artifact.file_path}
                            fileType={artifact.file_type as ArtifactFileType}
                            fileSize={artifact.file_size}
                            createdAt={artifact.created_at}
                            description={artifact.description}
                            onPreview={() => handlePreview(artifact)}
                            onDownload={() => handleDownload(artifact.id)}
                            onReveal={() => handleReveal(artifact.id)}
                            onImportToLibrary={() => handleImportToLibrary(artifact.id)}
                        />
                    ))}
                </div>
            </div>

            {/* 预览弹窗 */}
            {previewArtifact && (
                <ArtifactPreviewModal
                    isOpen={!!previewArtifact}
                    onClose={() => setPreviewArtifact(null)}
                    fileName={previewArtifact.file_name}
                    filePath={previewArtifact.file_path}
                    fileType={previewArtifact.file_type as ArtifactFileType}
                    fileSize={previewArtifact.file_size}
                    mimeType={previewArtifact.mime_type}
                    onDownload={() => handleDownload(previewArtifact.id)}
                    onReveal={() => handleReveal(previewArtifact.id)}
                    onImportToLibrary={() => handleImportToLibrary(previewArtifact.id)}
                />
            )}
        </>
    );
}
