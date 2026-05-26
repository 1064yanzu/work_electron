import { useEffect, useState } from "react";
import {
	deleteSkill,
	importSkill,
	listSkills,
	type SkillMetadata,
	setSkillEnabled,
} from "./config";

// Event emitter for store updates
const listeners = new Set<() => void>();
function emitChange() {
	listeners.forEach((fn) => fn());
}

let cachedSkills: SkillMetadata[] = [];
let isInitialized = false;
let initPromise: Promise<void> | null = null;

export const skillsStore = {
	async init() {
		if (isInitialized) return;
		if (initPromise) return initPromise;

		initPromise = (async () => {
			try {
				const skills = await listSkills();
				cachedSkills = skills;
				isInitialized = true;
				emitChange();
			} catch (err) {
				console.error("[skillsStore] 初始化失败:", err);
				isInitialized = true;
			}
		})();

		return initPromise;
	},

	async refresh() {
		try {
			const skills = await listSkills();
			cachedSkills = skills;
			emitChange();
		} catch (err) {
			console.error("[skillsStore] 刷新失败:", err);
		}
	},

	getSkills(): SkillMetadata[] {
		return cachedSkills;
	},

	getEnabledSkills(): SkillMetadata[] {
		return cachedSkills.filter((s) => s.enabled);
	},

	async importSkill(sourcePath: string): Promise<SkillMetadata> {
		const skill = await importSkill(sourcePath);
		cachedSkills = [...cachedSkills, skill];
		emitChange();
		return skill;
	},

	async deleteSkill(skillName: string): Promise<void> {
		await deleteSkill(skillName);
		cachedSkills = cachedSkills.filter((s) => s.name !== skillName);
		emitChange();
	},

	/**
	 * 手动写入一个 skill 的启用状态。
	 *
	 * 调用此方法会写入 app_config 的 override，覆盖默认值。
	 * UI 控件：列表的「已启用」过滤；启动 agent 时同步到 cwd/.claude/skills/。
	 *
	 * SDK 仍会扫描 `~/.claude/skills/`，被禁用的 skill 文件物理还在。彻底屏蔽请删除。
	 */
	async setEnabled(skillName: string, enabled: boolean): Promise<void> {
		await setSkillEnabled(skillName, enabled);
		// 写完直接刷新一次，让后端重新算 effective enabled / userOverride
		await this.refresh();
	},

	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
};

// React hook
export function useSkillsStore() {
	const [skills, setSkills] = useState<SkillMetadata[]>(cachedSkills);

	useEffect(() => {
		skillsStore.init();
		const unsubscribe = skillsStore.subscribe(() => {
			setSkills(skillsStore.getSkills());
		});
		return unsubscribe;
	}, []);

	return {
		skills,
		enabledSkills: skills.filter((s) => s.enabled),
		refresh: skillsStore.refresh,
		importSkill: skillsStore.importSkill,
		deleteSkill: skillsStore.deleteSkill,
		setEnabled: skillsStore.setEnabled,
	};
}
