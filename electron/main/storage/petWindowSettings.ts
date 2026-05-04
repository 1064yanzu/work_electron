/**
 * PetWindowSettings — 桌面宠物窗口持久化配置
 *
 * 落地到 app.getPath("userData")/pet-window.json，
 * 主进程启动时读取以决定是否恢复宠物窗口。
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export interface PetWindowSettingsData {
	enabled: boolean;
	x: number;
	y: number;
	throughClicks: boolean;
}

const DEFAULT_SETTINGS: PetWindowSettingsData = {
	enabled: true,
	x: -1, // -1 表示使用默认位置（右下角，由 createPetWindow 计算）
	y: -1,
	throughClicks: false,
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
