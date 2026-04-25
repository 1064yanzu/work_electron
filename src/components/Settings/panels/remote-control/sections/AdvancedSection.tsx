/**
 * AdvancedSection — 远程控制「高级」Tab
 *
 * 合并：
 *   - 安全策略（交互超时 + 移动端网关）
 *   - 云节点（Relay URL / 节点名 / 心跳 / 路由策略 / 绑定解绑）
 *
 * 视觉上分成两个子卡片，每个子卡片有清晰的小标题和简短说明。
 */

import { Activity, CloudCog, Link2, RefreshCw, Shield } from "lucide-react";
import { Button } from "../../../../ui/Button";
import { Select } from "../../../../ui/Select";
import type {
	CloudNodeConfig,
	CloudNodeRuntimeStatus,
	RemoteControlConfig,
} from "../../../../../lib/api";
import {
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
} from "../../../ui/SettingsPrimitives";
import { StatusDot } from "../StatusDot";

const INPUT_CLASS =
	"w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 hover:border-zinc-300 dark:hover:border-zinc-600";

type CloudBindForm = {
	relay_url: string;
	email: string;
	password: string;
	node_name: string;
};

type Props = {
	config: RemoteControlConfig;
	saving: boolean;
	onSave: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => void;
	cloudNodeConfig: CloudNodeConfig | null;
	cloudNodeRuntime: CloudNodeRuntimeStatus | null;
	onSaveCloud: (updater: (draft: CloudNodeConfig) => CloudNodeConfig) => void;
	cloudBindForm: CloudBindForm;
	onCloudBindFormChange: (patch: Partial<CloudBindForm>) => void;
	busyCloudBind: boolean;
	busyCloudUnbind: boolean;
	onCloudBind: () => void;
	onCloudUnbind: () => void;
};

export function AdvancedSection({
	config,
	saving,
	onSave,
	cloudNodeConfig,
	cloudNodeRuntime,
	onSaveCloud,
	cloudBindForm,
	onCloudBindFormChange,
	busyCloudBind,
	busyCloudUnbind,
	onCloudBind,
	onCloudUnbind,
}: Props) {
	return (
		<div className="space-y-6">
			{/* 安全 & 协议预留 */}
			<SettingsSectionCard className="p-5 space-y-4">
				<div className="flex items-start gap-3">
					<div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-500/15 to-zinc-500/10">
						<Shield className="h-4.5 w-4.5 text-text-secondary" />
					</div>
					<div>
						<SettingsSectionTitle className="mb-1 text-base">
							安全与协议预留
						</SettingsSectionTitle>
						<p className="text-sm text-text-secondary leading-relaxed">
							移动端网关方法与作用域已预留；首期默认关闭，后续启用。
						</p>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<label className="space-y-1.5 text-sm">
						<span className="text-text-secondary font-medium">
							交互超时（秒）
						</span>
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
						<span className="text-text-secondary font-medium">
							移动网关 Host
						</span>
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
						<span className="text-text-secondary font-medium">
							移动网关 Port
						</span>
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

				<div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-warm-50/60 px-4 py-3 text-xs/40">
					<div className="inline-flex items-center gap-2 text-text-secondary">
						<Shield className="h-4 w-4 text-text-muted" />
						默认 scopes：
						<span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px]">
							{config.security.defaultScopes.join(", ") || "—"}
						</span>
					</div>
					<div className="inline-flex items-center gap-2 text-text-secondary">
						<Activity className="h-4 w-4 text-text-muted" />
						移动端网关：
						<span
							className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
								config.mobileGateway.enabled
									? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
									: "bg-warm-500/10 text-text-muted"
							}`}
						>
							<StatusDot
								tone={config.mobileGateway.enabled ? "emerald" : "zinc"}
								size="xs"
							/>
							{config.mobileGateway.enabled ? "启用" : "关闭"}
						</span>
					</div>
				</div>
			</SettingsSectionCard>

			{/* 云节点 */}
			{cloudNodeConfig ? (
				<SettingsSectionCard className="p-5 space-y-5">
					<div className="flex items-start justify-between gap-4">
						<div className="flex items-start gap-3">
							<div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-violet-500/15">
								<CloudCog className="h-4.5 w-4.5 text-primary" />
							</div>
							<div>
								<SettingsSectionTitle className="mb-1 text-base">
									云节点（桌面可选执行端）
								</SettingsSectionTitle>
								<p className="text-sm text-text-secondary leading-relaxed">
									桌面在线时可接入云中继作为执行节点；桌面离线不影响手机端云执行。
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<span
								className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
									cloudNodeRuntime?.connected
										? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
										: "bg-warm-500/10 text-text-muted"
								}`}
							>
								<StatusDot
									tone={cloudNodeRuntime?.connected ? "emerald" : "zinc"}
									size="xs"
									pulse={!!cloudNodeRuntime?.connected}
								/>
								{cloudNodeRuntime?.connected ? "已连接" : "未连接"}
							</span>
							<SettingsSwitch
								checked={cloudNodeConfig.enabled}
								onChange={(next) => {
									onSaveCloud((draft) => {
										draft.enabled = next;
										return draft;
									});
								}}
								disabled={saving}
							/>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<label className="space-y-1.5 text-sm">
							<span className="text-text-secondary font-medium">Relay URL</span>
							<input
								value={cloudNodeConfig.relayUrl}
								onChange={(e) => {
									const value = e.target.value;
									onSaveCloud((draft) => {
										draft.relayUrl = value;
										return draft;
									});
								}}
								className={INPUT_CLASS}
								placeholder="https://relay.example.com"
							/>
						</label>
						<label className="space-y-1.5 text-sm">
							<span className="text-text-secondary font-medium">节点名称</span>
							<input
								value={cloudNodeConfig.nodeName}
								onChange={(e) => {
									const value = e.target.value;
									onSaveCloud((draft) => {
										draft.nodeName = value;
										return draft;
									});
								}}
								className={INPUT_CLASS}
								placeholder="desktop-node"
							/>
						</label>
						<label className="space-y-1.5 text-sm">
							<span className="text-text-secondary font-medium">
								心跳间隔（秒）
							</span>
							<input
								type="number"
								min={5}
								max={120}
								value={cloudNodeConfig.heartbeatSec}
								onChange={(e) => {
									const value = Math.max(5, Number(e.target.value || 20));
									onSaveCloud((draft) => {
										draft.heartbeatSec = value;
										return draft;
									});
								}}
								className={INPUT_CLASS}
							/>
						</label>
						<div className="space-y-1.5">
							<span className="text-sm text-text-secondary font-medium">
								路由策略
							</span>
							<Select
								value={cloudNodeConfig.routingMode}
								onChange={(e) => {
									const value = e.target.value as
										| "cloud_only"
										| "prefer_desktop"
										| "auto";
									onSaveCloud((draft) => {
										draft.routingMode = value;
										return draft;
									});
								}}
								options={[
									{ label: "仅云执行", value: "cloud_only" },
									{ label: "优先桌面", value: "prefer_desktop" },
									{ label: "自动切换", value: "auto" },
								]}
							/>
						</div>
					</div>

					<div className="flex items-center justify-between rounded-xl border border-border bg-warm-50/60 px-4 py-3 text-xs/40">
						<div className="space-y-0.5">
							<div className="text-text-secondary">
								Node ID：
								<span className="font-mono text-text-primary">
									{cloudNodeConfig.nodeId || "—"}
								</span>
							</div>
							{cloudNodeRuntime?.lastError ? (
								<div className="text-rose-500 dark:text-rose-400">
									最近错误：{cloudNodeRuntime.lastError}
								</div>
							) : null}
						</div>
					</div>

					{/* 绑定表单 */}
					<div className="space-y-3 rounded-2xl border border-border/70 bg-warm-50/50 p-4/30">
						<div>
							<SettingsSectionTitle className="mb-0.5 text-base">
								绑定 / 解绑云节点
							</SettingsSectionTitle>
							<p className="text-xs text-text-secondary">
								使用账号凭证将本桌面作为一个执行节点注册到 Relay 服务。
							</p>
						</div>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							<label className="space-y-1.5 text-sm">
								<span className="text-text-secondary">Relay URL</span>
								<input
									value={cloudBindForm.relay_url}
									onChange={(e) =>
										onCloudBindFormChange({ relay_url: e.target.value })
									}
									className={INPUT_CLASS}
									placeholder="绑定用 Relay URL"
								/>
							</label>
							<label className="space-y-1.5 text-sm">
								<span className="text-text-secondary">节点名（可选）</span>
								<input
									value={cloudBindForm.node_name}
									onChange={(e) =>
										onCloudBindFormChange({ node_name: e.target.value })
									}
									className={INPUT_CLASS}
									placeholder="desktop-node"
								/>
							</label>
							<label className="space-y-1.5 text-sm">
								<span className="text-text-secondary">账号邮箱</span>
								<input
									value={cloudBindForm.email}
									onChange={(e) =>
										onCloudBindFormChange({ email: e.target.value })
									}
									className={INPUT_CLASS}
									placeholder="user@example.com"
								/>
							</label>
							<label className="space-y-1.5 text-sm">
								<span className="text-text-secondary">账号密码</span>
								<input
									type="password"
									value={cloudBindForm.password}
									onChange={(e) =>
										onCloudBindFormChange({ password: e.target.value })
									}
									className={INPUT_CLASS}
									placeholder="••••••••"
								/>
							</label>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="primary"
								size="sm"
								disabled={busyCloudBind || saving}
								onClick={onCloudBind}
							>
								{busyCloudBind ? (
									<RefreshCw className="h-3.5 w-3.5 animate-spin" />
								) : (
									<Link2 className="h-3.5 w-3.5" />
								)}
								绑定云节点
							</Button>
							<Button
								variant="ghost"
								size="sm"
								disabled={busyCloudUnbind || saving}
								onClick={onCloudUnbind}
							>
								{busyCloudUnbind ? (
									<RefreshCw className="h-3.5 w-3.5 animate-spin" />
								) : null}
								解绑节点
							</Button>
						</div>
					</div>
				</SettingsSectionCard>
			) : null}
		</div>
	);
}
