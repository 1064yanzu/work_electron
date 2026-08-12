// 语言风格包的数据与选择逻辑。
//
// 从原 StyleProfilePill 里抽出来 —— 风格包是低频设置，不该在底栏常驻占一格
// （底栏一共只有 336px，多一格就得把所有控件缩小，反而更丑）。
// 现在它作为一个分区活在 `+` 菜单里，逻辑放这里供菜单复用。

import { useCallback, useEffect, useState } from "react";
import type {
	StyleProfile,
	StyleProfileRecipe,
} from "../../../../electron/shared/ipc-schema";
import {
	listStyleProfiles,
	listStyleRecipes,
} from "../../../lib/api/styleProfile";
import { getConfig, setConfig } from "../../../lib/config";

const ACTIVE_PROFILE_KEY = "active_style_profile_id";
const ACTIVE_RECIPE_KEY = "active_style_recipe_id";

export interface StyleProfilesState {
	profiles: StyleProfile[];
	recipes: StyleProfileRecipe[];
	activeId: string | null;
	activeRecipeId: string | null;
	/** 当前是否启用了任一风格包/配方 */
	hasActive: boolean;
	/** 当前生效项的显示名；未启用为 null */
	activeName: string | null;
	/** 选中的是混搭配方（影响强调色：配方 amber / 单包 peach） */
	isRecipe: boolean;
	selectProfile: (id: string | null) => Promise<void>;
	selectRecipe: (id: string | null) => Promise<void>;
}

/**
 * @param refreshKey 变化时重新拉列表（菜单打开时刷新，关着不请求）
 */
export function useStyleProfiles(refreshKey: boolean): StyleProfilesState {
	const [profiles, setProfiles] = useState<StyleProfile[]>([]);
	const [recipes, setRecipes] = useState<StyleProfileRecipe[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);

	// 初次加载：列表 + 当前选中项
	useEffect(() => {
		void (async () => {
			try {
				const [ps, rcs, id, recipeId] = await Promise.all([
					listStyleProfiles(),
					listStyleRecipes(),
					getConfig(ACTIVE_PROFILE_KEY),
					getConfig(ACTIVE_RECIPE_KEY),
				]);
				setProfiles(ps.filter((p) => p.status === "active"));
				setRecipes(rcs);
				setActiveId(id ?? null);
				setActiveRecipeId(recipeId ?? null);
			} catch {
				// 静默失败：风格包不可用不该阻塞输入
			}
		})();
	}, []);

	// 菜单打开时刷新列表（设置面板里可能新建了包）
	useEffect(() => {
		if (!refreshKey) return;
		void (async () => {
			try {
				const [ps, rcs] = await Promise.all([
					listStyleProfiles(),
					listStyleRecipes(),
				]);
				setProfiles(ps.filter((p) => p.status === "active"));
				setRecipes(rcs);
			} catch {
				// 静默失败
			}
		})();
	}, [refreshKey]);

	// 单包与配方互斥：选一个就清另一个
	const selectProfile = useCallback(async (id: string | null) => {
		setActiveId(id);
		setActiveRecipeId(null);
		await Promise.all([
			setConfig(ACTIVE_PROFILE_KEY, id),
			setConfig(ACTIVE_RECIPE_KEY, null),
		]);
	}, []);

	const selectRecipe = useCallback(async (id: string | null) => {
		setActiveRecipeId(id);
		setActiveId(null);
		await Promise.all([
			setConfig(ACTIVE_RECIPE_KEY, id),
			setConfig(ACTIVE_PROFILE_KEY, null),
		]);
	}, []);

	const activeProfile = profiles.find((p) => p.id === activeId) ?? null;
	const activeRecipe = recipes.find((r) => r.id === activeRecipeId) ?? null;

	return {
		profiles,
		recipes,
		activeId,
		activeRecipeId,
		hasActive: activeProfile !== null || activeRecipe !== null,
		activeName: activeRecipe?.name ?? activeProfile?.name ?? null,
		isRecipe: activeRecipe !== null,
		selectProfile,
		selectRecipe,
	};
}
