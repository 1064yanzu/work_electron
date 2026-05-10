/**
 * PetWindowSettings — 桌面宠物窗口持久化配置
 *
 * 落地到 app.getPath("userData")/pet-window.json，
 * 主进程启动时读取以决定是否恢复宠物窗口。
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

/**
 * 持久化的桌宠 id：
 * - "off" 关闭
 * - "efficiency" / "cloud" / "leisure" 内置三只
 * - 任意自定义桌宠 id（来自 userData/custom-mascots/<id>/）
 */
export type MascotIdPersisted = string;
export type SizePreset = "sm" | "md" | "lg" | "xl";
export type DwellPreset = "short" | "normal" | "long";

export interface PetWindowSettingsData {
	enabled: boolean;
	x: number;
	y: number;
	throughClicks: boolean;
	/** 当前 IP（与 localStorage 双写，主进程作为权威源以支持跨窗口广播） */
	mascotId: MascotIdPersisted;
	/** 角色尺寸档：sm=120 / md=160 / lg=180 / xl=220 */
	sizePreset: SizePreset;
	/** 通知 dwell 时长档：short(×0.7) / normal(×1) / long(×1.5) */
	dwellPreset: DwellPreset;
	/** 勿扰开始时间（"HH:MM"，null 关闭勿扰段） */
	dndStart: string | null;
	/** 勿扰结束时间（"HH:MM"，null 关闭勿扰段） */
	dndEnd: string | null;
	/** 全局热键唤醒是否启用（默认 true） */
	globalShortcutEnabled: boolean;
}

const DEFAULT_SETTINGS: PetWindowSettingsData = {
	enabled: true,
	x: -1, // -1 表示使用默认位置（右下角，由 createPetWindow 计算）
	y: -1,
	throughClicks: false,
	mascotId: "efficiency",
	sizePreset: "lg",
	dwellPreset: "normal",
	dndStart: null,
	dndEnd: null,
	globalShortcutEnabled: true,
};

function getSettingsPath(): string {
	return path.join(app.getPath("userData"), "pet-window.json");
}

let cached: PetWindowSettingsData | null = null;

export function getPetWindowSettings(): PetWindowSettingsData {
	if (cached) return cached;
	try {
		const raw = fs.readFileSync(getSettingsPath(), "utf-8");
		const parsed = JSON.parse(raw);
		cached = { ...DEFAULT_SETTINGS, ...parsed };
	} catch {
		cached = { ...DEFAULT_SETTINGS };
	}
	// cached 在两个分支里都已被赋值；用非空断言让 TS 收敛 union
	return cached as PetWindowSettingsData;
}

export function updatePetWindowSettings(
	patch: Partial<PetWindowSettingsData>,
): PetWindowSettingsData {
	const current = getPetWindowSettings();
	cached = { ...current, ...patch };
	try {
		fs.writeFileSync(
			getSettingsPath(),
			JSON.stringify(cached, null, 2),
			"utf-8",
		);
	} catch {
		// 写入失败不阻塞运行，下次启动恢复默认
	}
	return cached;
}
