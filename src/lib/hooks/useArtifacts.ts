/**
 * useArtifacts - 产物管理 Hook
 * 处理产物的加载、预览、下载、导入资料库等操作
 */
import { useCallback, useState } from "react";
import {
    deleteArtifact,
    downloadArtifact,
    importArtifactToLibrary,
    listArtifacts,
    revealArtifact,
    type ArtifactMetadata,
} from "../api";

export interface UseArtifactsOptions {
    sessionId?: string;
    autoLoad?: boolean;
}

export interface UseArtifactsReturn {
    artifacts: ArtifactMetadata[];
    loading: boolean;
    error: string | null;
    previewArtifact: ArtifactMetadata | null;
    loadArtifacts: () => Promise<void>;
    openPreview: (artifact: ArtifactMetadata) => void;
    closePreview: () => void;
    handleDownload: (id: string) => Promise<void>;
    handleReveal: (id: string) => Promise<void>;
    handleImportToLibrary: (id: string, folderId?: string) => Promise<void>;
    handleDelete: (id: string) => Promise<void>;
}

export function useArtifacts(options: UseArtifactsOptions = {}): UseArtifactsReturn {
    const { sessionId } = options;

    const [artifacts, setArtifacts] = useState<ArtifactMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewArtifact, setPreviewArtifact] = useState<ArtifactMetadata | null>(null);

    // 加载产物列表
    const loadArtifacts = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await listArtifacts(sessionId);
            setArtifacts(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : "加载产物失败");
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    // 打开预览
    const openPreview = useCallback((artifact: ArtifactMetadata) => {
        setPreviewArtifact(artifact);
    }, []);

    // 关闭预览
    const closePreview = useCallback(() => {
        setPreviewArtifact(null);
    }, []);

    // 下载
    const handleDownload = useCallback(async (id: string) => {
        try {
            await downloadArtifact(id);
        } catch (err) {
            console.error("下载失败:", err);
        }
    }, []);

    // 在 Finder 中显示
    const handleReveal = useCallback(async (id: string) => {
        try {
            await revealArtifact(id);
        } catch (err) {
            console.error("打开文件夹失败:", err);
        }
    }, []);

    // 导入资料库
    const handleImportToLibrary = useCallback(async (id: string, folderId?: string) => {
        try {
            await importArtifactToLibrary(id, folderId);
            // 可以添加 toast 提示
        } catch (err) {
            console.error("导入资料库失败:", err);
        }
    }, []);

    // 删除
    const handleDelete = useCallback(async (id: string) => {
        try {
            await deleteArtifact(id);
            setArtifacts((prev) => prev.filter((a) => a.id !== id));
        } catch (err) {
            console.error("删除失败:", err);
        }
    }, []);

    return {
        artifacts,
        loading,
        error,
        previewArtifact,
        loadArtifacts,
        openPreview,
        closePreview,
        handleDownload,
        handleReveal,
        handleImportToLibrary,
        handleDelete,
    };
}
