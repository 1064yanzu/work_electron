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

	/**
	 * 写一个 DB flag 标记某个 skill 在 UI 上「启用 / 禁用」。
	 *
	 * ⚠️ 语义边界：这个开关**主要影响**：
	 *   - UI 列表的「已启用」过滤
	 *   - 启动 agent 时同步到 `cwd/.claude/skills/` 的 project scope（见
	 *     electron/main/ipc/handlers/agentSdk/configManager.ts:syncSkillsToCwd）
	 *
	 * 但 Claude Agent SDK 的 settingSources 始终包含 `"user"`，意味着 SDK 仍会扫描
	 * `~/.claude/skills/`，被「禁用」的 skill 文件仍存在于 home 目录里。Claude Code
	 * 本身也不能精确控制 skills 启停，这是 SDK 行为约束。
	 *
	 * 如果你**真的不想让某个 skill 被 agent 用**，请直接 `deleteSkill` 物理删除目录。
	 */
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
