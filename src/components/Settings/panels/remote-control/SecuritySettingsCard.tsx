/**
 * SecuritySettingsCard — 安全与协议预留配置
 */

import { Activity, Lock, Shield } from "lucide-react";
import {
    SettingsSectionTitle,
} from "../../ui/SettingsPrimitives";
import type { RemoteControlConfig } from "../../../../lib/api";

const INPUT_CLASS =
    "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600";

type SecuritySettingsCardProps = {
    config: RemoteControlConfig;
    saving: boolean;
    onSave: (updater: (draft: RemoteControlConfig) => RemoteControlConfig) => void;
};

export function SecuritySettingsCard({
    config,
    saving,
    onSave,
}: SecuritySettingsCardProps) {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-[0_2px_8px_rgb(0,0,0,0.04)] ring-1 ring-black/[0.03] dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/[0.02]">
            {/* 顶部装饰线 */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 opacity-40" />

            <div className="p-5 space-y-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/15 to-orange-500/15 dark:from-amber-500/25 dark:to-orange-500/25">
                        <Lock className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <SettingsSectionTitle className="mb-0">
                            安全与协议预留
                        </SettingsSectionTitle>
                        <p className="text-xs text-text-secondary mt-0.5">
                            移动端网关方法与作用域已预留，首期默认关闭
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label className="space-y-1.5 text-sm">
                        <span className="text-text-secondary font-medium">交互超时（秒）</span>
                        <input
                            type="number"
                            min={10}
                            max={300}
                            value={config.security.interactionTimeoutSec}
                            onChange={(e) => {
                                const value = Math.max(10, Number(e.target.value || 55));
                                onSave((draft) => {
                                    draft.security.interactionTimeoutSec = value;
                                    return draft;
                                });
                            }}
                            className={INPUT_CLASS}
                        />
                    </label>
                    <label className="space-y-1.5 text-sm">
                        <span className="text-text-secondary font-medium">移动网关 Host</span>
                        <input
                            value={config.mobileGateway.host}
                            onChange={(e) => {
                                const value = e.target.value;
                                onSave((draft) => {
                                    draft.mobileGateway.host = value;
                                    return draft;
                                });
                            }}
                            className={INPUT_CLASS}
                        />
                    </label>
                    <label className="space-y-1.5 text-sm">
                        <span className="text-text-secondary font-medium">移动网关 Port</span>
                        <input
                            type="number"
                            min={1024}
                            max={65535}
                            value={config.mobileGateway.port}
                            onChange={(e) => {
                                const value = Math.max(1024, Number(e.target.value || 28777));
                                onSave((draft) => {
                                    draft.mobileGateway.port = value;
                                    return draft;
                                });
                            }}
                            className={INPUT_CLASS}
                        />
                    </label>
                </div>

                {/* 信息展示条 */}
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-100 bg-zinc-50/50 px-4 py-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/30">
                    <div className="inline-flex items-center gap-2 text-text-secondary">
                        <Shield className="h-3.5 w-3.5 text-text-muted" />
                        <span className="font-medium">默认 scopes：</span>
                        <span className="text-text-primary">
                            {config.security.defaultScopes.join(", ") || "—"}
                        </span>
                    </div>
                    <div className="h-3 w-px bg-zinc-200 dark:bg-zinc-700" />
                    <div className="inline-flex items-center gap-2 text-text-secondary">
                        <Activity className="h-3.5 w-3.5 text-text-muted" />
                        <span className="font-medium">移动端网关：</span>
                        <span
                            className={`font-medium ${config.mobileGateway.enabled
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-zinc-500"
                                }`}
                        >
                            {config.mobileGateway.enabled ? "已启用" : "已关闭"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
