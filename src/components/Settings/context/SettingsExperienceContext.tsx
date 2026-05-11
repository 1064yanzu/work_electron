/**
 * SettingsExperienceContext — 已废弃的体验模式上下文（Phase 7.5 起 no-op）
 *
 * 旧模型把面板分为 simple / geek 两档，配合 `showTechnicalSummaries`
 * 渲染只读摘要。重构后所有面板都直接展示完整 UI，本文件保留是为了让
 * 仍引用 `useSettingsExperience` / `SettingsExperienceProvider` 的旧代码
 * 不报错；语义上 `mode` 永远是 `geek`，`showTechnicalSummaries` 永远
 * 为 `false`。Phase 7.5 完成后下游引用会被逐步删除，本文件最终也会被
 * 整体清理。
 */
import { type ReactNode } from "react";
import type { SettingsExperienceMode } from "../types";

interface SettingsExperienceContextValue {
	mode: SettingsExperienceMode;
	setMode: (mode: SettingsExperienceMode) => void;
	technicalGroupExpanded: boolean;
	setTechnicalGroupExpanded: (expanded: boolean) => void;
	showTechnicalSummaries: boolean;
}

const NOOP_VALUE: SettingsExperienceContextValue = {
	mode: "geek",
	setMode: () => {
		/* no-op */
	},
	technicalGroupExpanded: false,
	setTechnicalGroupExpanded: () => {
		/* no-op */
	},
	showTechnicalSummaries: false,
};

export function SettingsExperienceProvider({
	children,
}: {
	children: ReactNode;
}) {
	return <>{children}</>;
}

export function useSettingsExperience(): SettingsExperienceContextValue {
	return NOOP_VALUE;
}
