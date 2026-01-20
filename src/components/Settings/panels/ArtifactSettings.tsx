/**
 * ArtifactSettings - 产物管理设置面板
 * 配置 Agent 产物的存储路径、清理策略等
 */
import {
    AlertCircle,
    Archive,
    RefreshCw,
    Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
    cleanupArtifacts,
    getArtifactSettings,
    listArtifacts,
    updateArtifactSettings,
    type ArtifactCleanupResult,
    type ArtifactMetadata,
    type ArtifactSettings as ArtifactSettingsType,
} from "../../../lib/api";

// 切换开关组件
function Toggle({
    checked,
    onChange,
    disabled,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${checked ? "bg-primary" : "bg-zinc-200"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
        >
            <span
                className={`
          inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform
          ${checked ? "translate-x-6" : "translate-x-1"}
        `}
            />
        </button>
    );
}

// 设置行组件
function SettingRow({
    label,
    description,
    value,
    action,
}: {
    label: string;
    description?: string;
    value?: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between py-4 border-b border-zinc-100 last:border-0">
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-800">{label}</div>
                {description && (
                    <div className="text-xs text-zinc-400 mt-0.5 truncate">
                        {description}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-3 ml-4">
                {value && <div className="text-sm text-zinc-500">{value}</div>}
                {action}
            </div>
        </div>
    );
}

// 分区标题组件
function SectionTitle({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <h4
            className={`text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3 ${className}`}
        >
            {children}
        </h4>
    );
}

// 分区卡片组件
function SectionCard({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`bg-white rounded-2xl ring-1 ring-black/[0.03] shadow-[0_2px_8px_rgb(0,0,0,0.04)] ${className}`}
        >
            {children}
        </div>
    );
}

// 格式化文件大小
function formatSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function ArtifactSettings() {
    const [settings, setSettings] = useState<ArtifactSettingsType | null>(null);
    const [artifacts, setArtifacts] = useState<ArtifactMetadata[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCleaning, setIsCleaning] = useState(false);
    const [cleanupResult, setCleanupResult] = useState<ArtifactCleanupResult | null>(null);

    // 加载数据
    const loadData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [settingsData, artifactsList] = await Promise.all([
                getArtifactSettings(),
                listArtifacts(),
            ]);
            setSettings(settingsData);
            setArtifacts(artifactsList);
        } catch (error) {
            console.error("加载产物设置失败:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // 保存设置
    const saveSettings = async (updates: Partial<ArtifactSettingsType>) => {
        if (!settings) return;
        const newSettings = { ...settings, ...updates };
        setSettings(newSettings);
        try {
            await updateArtifactSettings(updates);
        } catch (error) {
            console.error("保存设置失败:", error);
        }
    };

    // 清理产物
    const handleCleanup = async (force = false) => {
        const message = force
            ? "确定要清理所有产物吗？此操作不可撤销！"
            : "确定要清理过期产物吗？";
        if (!confirm(message)) return;

        setIsCleaning(true);
        try {
            const result = await cleanupArtifacts(force);
            setCleanupResult(result);
            await loadData();
            if (result.deleted_count > 0) {
                alert(`✅ 已清理 ${result.deleted_count} 个产物，释放 ${formatSize(result.freed_bytes)}`);
            } else {
                alert("没有需要清理的产物");
            }
        } catch (error) {
            alert(`清理失败: ${error}`);
        } finally {
            setIsCleaning(false);
        }
    };

    // 计算统计信息
    const totalSize = artifacts.reduce((sum, a) => sum + a.file_size, 0);
    const sessionCount = new Set(artifacts.map((a) => a.session_id)).size;

    if (isLoading || !settings) {
        return (
            <div className="flex-1 h-full bg-[#F7F7F5] flex items-center justify-center">
                <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
            </div>
        );
    }

    return (
        <div className="flex-1 h-full bg-[#F7F7F5] overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-6">
                {/* 标题 */}
                <div className="border-b border-border pb-4">
                    <h3 className="text-lg font-medium text-text-primary flex items-center gap-2">
                        <Archive className="w-5 h-5" />
                        产物管理
                    </h3>
                    <p className="text-sm text-text-secondary mt-1">
                        管理 Agent 生成的文件产物
                    </p>
                </div>

                {/* 产物统计 */}
                <SectionCard>
                    <div className="p-5">
                        <SectionTitle>产物概览</SectionTitle>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="text-center p-4 bg-zinc-50 rounded-xl">
                                <div className="text-2xl font-semibold text-zinc-800">
                                    {artifacts.length}
                                </div>
                                <div className="text-xs text-zinc-400 mt-1">产物数量</div>
                            </div>
                            <div className="text-center p-4 bg-zinc-50 rounded-xl">
                                <div className="text-2xl font-semibold text-zinc-800">
                                    {sessionCount}
                                </div>
                                <div className="text-xs text-zinc-400 mt-1">会话数</div>
                            </div>
                            <div className="text-center p-4 bg-zinc-50 rounded-xl">
                                <div className="text-2xl font-semibold text-zinc-800">
                                    {formatSize(totalSize)}
                                </div>
                                <div className="text-xs text-zinc-400 mt-1">总占用</div>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                {/* 存储设置 */}
                <SectionCard>
                    <div className="p-5">
                        <SectionTitle>存储设置</SectionTitle>
                        <SettingRow
                            label="存储路径"
                            description={settings.storage_path || "默认路径"}
                            action={
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(settings.storage_path);
                                        alert("路径已复制");
                                    }}
                                    className="text-xs text-primary hover:underline"
                                >
                                    复制路径
                                </button>
                            }
                        />
                        <SettingRow
                            label="单会话最大产物数"
                            description="每个会话最多保存的产物数量"
                            action={
                                <input
                                    type="number"
                                    value={settings.max_per_session}
                                    onChange={(e) =>
                                        saveSettings({ max_per_session: parseInt(e.target.value) || 50 })
                                    }
                                    min={1}
                                    max={500}
                                    className="w-20 px-3 py-1.5 bg-zinc-50 border-0 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary/20"
                                />
                            }
                        />
                        <SettingRow
                            label="总容量限制"
                            description="所有产物的最大总大小（MB）"
                            action={
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={Math.round(settings.max_total_size / (1024 * 1024))}
                                        onChange={(e) =>
                                            saveSettings({
                                                max_total_size: (parseInt(e.target.value) || 1024) * 1024 * 1024,
                                            })
                                        }
                                        min={100}
                                        max={10240}
                                        className="w-20 px-3 py-1.5 bg-zinc-50 border-0 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary/20"
                                    />
                                    <span className="text-xs text-zinc-400">MB</span>
                                </div>
                            }
                        />
                    </div>
                </SectionCard>

                {/* 自动清理设置 */}
                <SectionCard>
                    <div className="p-5">
                        <SectionTitle>自动清理</SectionTitle>
                        <SettingRow
                            label="启用自动清理"
                            description="自动清理过期的产物文件"
                            action={
                                <Toggle
                                    checked={settings.auto_cleanup}
                                    onChange={(v) => saveSettings({ auto_cleanup: v })}
                                />
                            }
                        />
                        {settings.auto_cleanup && (
                            <SettingRow
                                label="保留天数"
                                description="产物超过指定天数后将被清理"
                                action={
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={settings.retention_days}
                                            onChange={(e) =>
                                                saveSettings({ retention_days: parseInt(e.target.value) || 7 })
                                            }
                                            min={1}
                                            max={365}
                                            className="w-20 px-3 py-1.5 bg-zinc-50 border-0 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary/20"
                                        />
                                        <span className="text-xs text-zinc-400">天</span>
                                    </div>
                                }
                            />
                        )}
                    </div>
                </SectionCard>

                {/* 手动清理 */}
                <SectionCard className="ring-orange-100">
                    <div className="p-5">
                        <SectionTitle className="text-orange-500">手动清理</SectionTitle>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleCleanup(false)}
                                disabled={isCleaning}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {isCleaning ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )}
                                清理过期产物
                            </button>
                            <button
                                onClick={() => handleCleanup(true)}
                                disabled={isCleaning}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                <AlertCircle className="w-4 h-4" />
                                清理全部产物
                            </button>
                        </div>
                        {cleanupResult && cleanupResult.errors.length > 0 && (
                            <div className="mt-3 p-3 bg-red-50 rounded-lg text-xs text-red-600">
                                <div className="font-medium mb-1">清理过程中出现错误：</div>
                                {cleanupResult.errors.map((err, i) => (
                                    <div key={i}>• {err}</div>
                                ))}
                            </div>
                        )}
                    </div>
                </SectionCard>
            </div>
        </div>
    );
}
