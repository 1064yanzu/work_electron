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
				cachedSkills = await listSkills();
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
			cachedSkills = await listSkills();
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

	async setEnabled(skillName: string, enabled: boolean): Promise<void> {
		await setSkillEnabled(skillName, enabled);
		cachedSkills = cachedSkills.map((s) =>
			s.name === skillName ? { ...s, enabled } : s,
		);
		emitChange();
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
