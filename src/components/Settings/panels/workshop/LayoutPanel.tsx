/**
 * LayoutPanel — 创作与工具 · 工作区布局
 *
 * Phase 6 合并自：
 *   - 原 `GeneralSettings` 的「中间栏体验」（对接 `centerUxPrefs`）；
 *   - 原 `SandboxPreviewSettings` 的全部字段（响应式断点 / 自动启动 dev server /
 *     包管理器 / dev 命令模板 / 端口范围）。
 *
 * R5.1 字段合并要点：
 *   - 原 `sandboxPreview.defaultView` 的 UI **移除**；UI 统一从 `centerUxPrefs.defaultView`
 *     读写，避免两套事实源；
 *   - 为兼容历史用户偏好，本面板首次加载时若 `centerUxPrefs.defaultView` 为默认 "graph"
 *     且原 `sandbox.preview.defaultView` 存在别的值，则做一次性迁移（写回 centerUxPrefs）。
 *
 * 本文件只负责状态聚合与加载链路；具体区段由 `CenterSection` / `SandboxSection` 渲染。
 */
import { Layout } from "lucide-react";
import { useEffect, useState } from "react";
import {
	getCenterUxPrefs,
	getConfig,
	setCenterUxPrefs,
	setConfig,
	type CenterUxPrefs,
} from "../../../../lib/config";
import { toast } from "../../../ui/Toast";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import { SettingsPageContainer } from "../../ui/SettingsPrimitives";
import { CenterSection } from "./CenterSection";
import {
	SandboxSection,
	type Breakpoint,
	type PackageManager,
	type SandboxPreviewPrefs,
} from "./SandboxSection";

const DEFAULT_SANDBOX_PREFS: SandboxPreviewPrefs = {
	defaultBreakpoint: "desktop",
	autoStartDevServer: true,
	packageManager: "auto",
	devCommandTemplate: "npm run dev",
	portRangeStart: 7300,
	portRangeEnd: 7400,
};

const SANDBOX_CONFIG_KEYS = {
	defaultBreakpoint: "sandbox.preview.defaultBreakpoint",
	autoStartDevServer: "sandbox.preview.autoStartDevServer",
	packageManager: "sandbox.preview.packageManager",
	devCommandTemplate: "sandbox.preview.devCommandTemplate",
	portRangeStart: "sandbox.preview.portRangeStart",
	portRangeEnd: "sandbox.preview.portRangeEnd",
	/** R5.1 兼容：历史上 SandboxPreviewSettings 写过的 key，迁移完后不再写，只读取兜底 */
	legacyDefaultView: "sandbox.preview.defaultView",
} as const;

function normalizeBreakpoint(value: unknown): Breakpoint {
	if (
		value === "auto" ||
		value === "mobile" ||
		value === "tablet" ||
		value === "desktop"
	)
		return value;
	return DEFAULT_SANDBOX_PREFS.defaultBreakpoint;
}

function normalizePackageManager(value: unknown): PackageManager {
	if (
		value === "auto" ||
		value === "npm" ||
		value === "yarn" ||
		value === "pnpm"
	)
		return value;
	return DEFAULT_SANDBOX_PREFS.packageManager;
}

function normalizePort(value: unknown, fallback: number): number {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(1024, Math.min(65535, Math.floor(n)));
}

export function LayoutPanel() {
	const [centerUxPrefs, setCenterUxPrefsState] = useState<CenterUxPrefs>({
		defaultView: "graph",
		graphFollow: true,
		artifactClickBehavior: "select_only",
		infoDensity: "comfortable",
	});
	const [sandboxPrefs, setSandboxPrefs] = useState<SandboxPreviewPrefs>(
		DEFAULT_SANDBOX_PREFS,
	);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [
					center,
					breakpointRaw,
					autoStartRaw,
					packageManagerRaw,
					devCommandRaw,
					portStartRaw,
					portEndRaw,
					legacyDefaultView,
				] = await Promise.all([
					getCenterUxPrefs(),
					getConfig(SANDBOX_CONFIG_KEYS.defaultBreakpoint),
					getConfig(SANDBOX_CONFIG_KEYS.autoStartDevServer),
					getConfig(SANDBOX_CONFIG_KEYS.packageManager),
					getConfig(SANDBOX_CONFIG_KEYS.devCommandTemplate),
					getConfig(SANDBOX_CONFIG_KEYS.portRangeStart),
					getConfig(SANDBOX_CONFIG_KEYS.portRangeEnd),
					getConfig(SANDBOX_CONFIG_KEYS.legacyDefaultView),
				]);
				if (cancelled) return;

				setSandboxPrefs({
					defaultBreakpoint: normalizeBreakpoint(breakpointRaw),
					autoStartDevServer:
						typeof autoStartRaw === "boolean"
							? autoStartRaw
							: DEFAULT_SANDBOX_PREFS.autoStartDevServer,
					packageManager: normalizePackageManager(packageManagerRaw),
					devCommandTemplate:
						typeof devCommandRaw === "string" && devCommandRaw
							? devCommandRaw
							: DEFAULT_SANDBOX_PREFS.devCommandTemplate,
					portRangeStart: normalizePort(
						portStartRaw,
						DEFAULT_SANDBOX_PREFS.portRangeStart,
					),
					portRangeEnd: normalizePort(
						portEndRaw,
						DEFAULT_SANDBOX_PREFS.portRangeEnd,
					),
				});

				// R5.1 兼容：centerUxPrefs.defaultView 未显式设置（保持默认 graph）但
				// 历史 sandbox.preview.defaultView 是 preview 则做一次性迁移。
				if (
					center.defaultView === "graph" &&
					(legacyDefaultView === "preview" ||
						legacyDefaultView === "code" ||
						legacyDefaultView === "docs")
				) {
					try {
						const migrated = await setCenterUxPrefs({
							defaultView: "preview",
						});
						if (!cancelled) setCenterUxPrefsState(migrated);
					} catch (migrationError) {
						console.warn(
							"[LayoutPanel] 迁移 sandbox.preview.defaultView → centerUxPrefs 失败:",
							migrationError,
						);
						if (!cancelled) setCenterUxPrefsState(center);
					}
				} else {
					setCenterUxPrefsState(center);
				}
			} catch (error) {
				console.error("[LayoutPanel] 加载工作区布局设置失败:", error);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleCenterUxPrefsChange = async (updates: Partial<CenterUxPrefs>) => {
		const prev = centerUxPrefs;
		const optimistic = { ...centerUxPrefs, ...updates };
		setCenterUxPrefsState(optimistic);
		try {
			const saved = await setCenterUxPrefs(updates);
			setCenterUxPrefsState(saved);
		} catch (error) {
			console.error("[LayoutPanel] 保存中间栏体验失败:", error);
			setCenterUxPrefsState(prev);
			toast.error("保存中间栏体验失败");
		}
	};

	const handleSandboxChange = async (updates: Partial<SandboxPreviewPrefs>) => {
		const prev = sandboxPrefs;
		const next = { ...sandboxPrefs, ...updates };
		setSandboxPrefs(next);
		try {
			const writes: Array<Promise<void>> = [];
			if (updates.defaultBreakpoint !== undefined)
				writes.push(
					setConfig(
						SANDBOX_CONFIG_KEYS.defaultBreakpoint,
						next.defaultBreakpoint,
					),
				);
			if (updates.autoStartDevServer !== undefined)
				writes.push(
					setConfig(
						SANDBOX_CONFIG_KEYS.autoStartDevServer,
						next.autoStartDevServer,
					),
				);
			if (updates.packageManager !== undefined)
				writes.push(
					setConfig(SANDBOX_CONFIG_KEYS.packageManager, next.packageManager),
				);
			if (updates.devCommandTemplate !== undefined)
				writes.push(
					setConfig(
						SANDBOX_CONFIG_KEYS.devCommandTemplate,
						next.devCommandTemplate,
					),
				);
			if (updates.portRangeStart !== undefined)
				writes.push(
					setConfig(SANDBOX_CONFIG_KEYS.portRangeStart, next.portRangeStart),
				);
			if (updates.portRangeEnd !== undefined)
				writes.push(
					setConfig(SANDBOX_CONFIG_KEYS.portRangeEnd, next.portRangeEnd),
				);
			await Promise.all(writes);
		} catch (error) {
			console.error("[LayoutPanel] 保存沙盒预览偏好失败:", error);
			setSandboxPrefs(prev);
			toast.error("保存沙盒预览偏好失败");
		}
	};

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
			<SettingsPanelHeader
				icon={Layout}
				title="工作区布局"
				description="中间栏默认视图、产物节点交互、沙盒预览服务器与响应式断点。"
			/>

			<CenterSection
				prefs={centerUxPrefs}
				onChange={handleCenterUxPrefsChange}
			/>

			<SandboxSection prefs={sandboxPrefs} onChange={handleSandboxChange} />
		</SettingsPageContainer>
	);
}
