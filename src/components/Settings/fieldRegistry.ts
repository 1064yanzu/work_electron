/**
 * fieldRegistry.ts — 设置字段搜索的数据源汇总
 *
 * 对应 design.md 第 4 节 / Requirement R7.2 / R7.3 / R7.4。
 *
 * 设计要点：
 *   1. `FieldDescriptor` 是搜索索引的最小单元，由各面板**就近**声明自己的
 *      `FIELDS: FieldDescriptor[]` 导出；本文件只做集中汇总，不重复声明。
 *   2. `SETTINGS_FIELD_INDEX` Phase 3 初始为空数组，Phase 4–6 拆分各面板时
 *      把对应的 `FIELDS` 逐步 spread 进来。
 *   3. `searchSettingsFields(query, limit=8)`：大小写不敏感的子串命中，
 *      优先级 `label > keywords > description`；同优先级按「命中位置越靠前
 *      越优先」排序；最多返回 `limit` 条（默认 8，对齐 R7.4）。
 *   4. MVP 不做拼写模糊 / 同义词 / 字段状态过滤（R7.8）。
 */
import { FIELDS as aiModelsFields } from "./panels/ai/models/fields";
import type { SettingsTabId } from "./settingsCatalog";

// ---------- Panel fields imports（Phase 6 起逐步填充） ----------
import { FIELDS as generalFields } from "./panels/general/fields";
import { FIELDS as aiDefaultsFields } from "./panels/ai/fields";
import { FIELDS as workshopLayoutFields } from "./panels/workshop/fields";
import { FIELDS as workshopTerminalFields } from "./panels/workshop/terminalFields";

// ---------- Phase 5 · data.* ----------
import { FIELDS as dataStorageFields } from "./panels/data/storage/fields";
import { FIELDS as dataBackupFields } from "./panels/data/backup/fields";
import { FIELDS as dataDangerFields } from "./panels/data/danger/fields";
import { FIELDS as dataArtifactsFields } from "./panels/data/artifacts/fields";
import { FIELDS as dataPerformanceFields } from "./panels/data/performance/fields";
import { FIELDS as dataStatsFields } from "./panels/data/stats/fields";

// ---------- Phase 8 · 补齐 ai.agent / ai.memory / workshop.* / integrations.* ----------
import { FIELDS as aiAgentFields } from "./panels/agent/fields";
import { FIELDS as aiMemoryFields } from "./panels/memory/fields";
import { FIELDS as workshopReaderFields } from "./panels/reader/fields";
import { FIELDS as workshopTtsFields } from "./panels/tts/fields";
import { FIELDS as workshopMascotFields } from "./panels/mascot/fields";
import { IMAGEGEN_FIELDS as workshopImagegenFields } from "./panels/imagegenFields";
import { INTEGRATIONS_FIELDS as integrationsFields } from "./panels/integrationsFields";
// =====================================================================
// 类型
// =====================================================================

export interface FieldDescriptor {
	/** 字段所属的新 SettingsTabId（归类到哪个二级 Tab）。 */
	tabId: SettingsTabId;
	/**
	 * DOM 锚点 id。面板内实际渲染时对应字段容器上需有
	 * `id={anchorId}` + `data-settings-anchor` 属性，供 SettingsSearch 滚动。
	 */
	anchorId: string;
	/** 用户可见的中文字段名（搜索权重最高）。 */
	label: string;
	/** 可选描述，出现在搜索结果副标题上；也参与搜索命中（权重最低）。 */
	description?: string;
	/**
	 * 英文 / 拼音 / 别名关键词。默认等同 label 的搜索命中权重的二档，
	 * 用来承接像 `api key / apikey / 密钥 / key` 这种多说法的命中。
	 */
	keywords?: string[];
}

// =====================================================================
// 索引汇总
// =====================================================================

/**
 * 所有可搜索字段的只读索引。Phase 3 阶段初始为空，各 Panel 在 Phase 4–6
 * 完成拆分后会通过 import 汇入自己的 `FIELDS`。
 *
 * 维护指引：
 *   - 新增 Panel 时，建议把该 Panel 的 `fields.ts` 放在该 Panel 目录下，
 *     然后在此处 `import { FIELDS as xxxFields } from "./panels/xxx/fields";`
 *     再 spread 进下面的 `SETTINGS_FIELD_INDEX`。
 *   - 禁止直接在本文件里声明字段元数据（保持就近维护）。
 */
export const SETTINGS_FIELD_INDEX: readonly FieldDescriptor[] = [
	// Phase 4 · ai.models
	...aiModelsFields,
	// Phase 6 · general / ai.defaults / workshop.layout
	...generalFields,
	...aiDefaultsFields,
	...workshopLayoutFields,
	...workshopTerminalFields,
	// Phase 5 · data.*
	...dataStorageFields,
	...dataBackupFields,
	...dataDangerFields,
	...dataArtifactsFields,
	...dataPerformanceFields,
	...dataStatsFields,
	// Phase 8 · 补齐其它面板
	...aiAgentFields,
	...aiMemoryFields,
	...workshopReaderFields,
	...workshopTtsFields,
	...workshopMascotFields,
	...workshopImagegenFields,
	...integrationsFields,
] as const;

// =====================================================================
// 搜索实现
// =====================================================================

/** 归一化查询串：去首尾空白 + 全转小写；内部不再 split。 */
function normalize(q: string): string {
	return q.trim().toLowerCase();
}

/**
 * 在一段文本里查询子串位置；返回 `-1` 表示未命中。
 * 查询串已在外部归一为小写，这里只对 haystack 小写化一次。
 */
function findIndex(haystack: string | undefined, needle: string): number {
	if (!haystack) return -1;
	return haystack.toLowerCase().indexOf(needle);
}

interface ScoredHit {
	field: FieldDescriptor;
	/** 主权重：0 = label 命中，1 = keywords 命中，2 = description 命中。 */
	channel: 0 | 1 | 2;
	/** 次权重：命中位置越靠前数值越小。 */
	position: number;
	/** 稳定排序兜底：字段在索引数组里的原始序号。 */
	order: number;
}

/**
 * 按查询串过滤字段并返回命中列表。
 *
 * 排序规则（对齐 R7.4）：
 *   1. 按 channel 升序（label > keywords > description）；
 *   2. 同 channel 内按命中位置升序；
 *   3. 相同位置按 `SETTINGS_FIELD_INDEX` 原始顺序稳定排序。
 *
 * @param query 用户输入（空串 / 纯空白 → 返回空数组）
 * @param limit 最多返回几条（默认 8）
 */
export function searchSettingsFields(
	query: string,
	limit = 8,
): FieldDescriptor[] {
	const q = normalize(query);
	if (!q) return [];
	if (limit <= 0) return [];

	const hits: ScoredHit[] = [];

	for (let i = 0; i < SETTINGS_FIELD_INDEX.length; i++) {
		const field = SETTINGS_FIELD_INDEX[i];
		if (!field) continue;

		// channel 0 — label
		const labelPos = findIndex(field.label, q);
		if (labelPos >= 0) {
			hits.push({ field, channel: 0, position: labelPos, order: i });
			continue;
		}

		// channel 1 — keywords（任意一个命中即算，取最小位置）
		let kwPos = -1;
		if (field.keywords && field.keywords.length > 0) {
			for (const kw of field.keywords) {
				const pos = findIndex(kw, q);
				if (pos >= 0 && (kwPos < 0 || pos < kwPos)) kwPos = pos;
			}
		}
		if (kwPos >= 0) {
			hits.push({ field, channel: 1, position: kwPos, order: i });
			continue;
		}

		// channel 2 — description
		const descPos = findIndex(field.description, q);
		if (descPos >= 0) {
			hits.push({ field, channel: 2, position: descPos, order: i });
		}
	}

	hits.sort((a, b) => {
		if (a.channel !== b.channel) return a.channel - b.channel;
		if (a.position !== b.position) return a.position - b.position;
		return a.order - b.order;
	});

	return hits.slice(0, limit).map((h) => h.field);
}

/**
 * 便捷工具：把 `FieldDescriptor` 暴露给面板渲染时用的「锚点属性对象」。
 * 使用示例：
 *   ```tsx
 *   <section {...settingsAnchorProps("ai.agent.context.toolSearch")}>
 *     ...
 *   </section>
 *   ```
 * Panel 实际渲染的字段容器需要带上 `id` 与 `data-settings-anchor`，
 * `SettingsSearch` 命中后会通过 id 找到节点并滚动 + 高亮。
 */
export function settingsAnchorProps(anchorId: string): {
	id: string;
	"data-settings-anchor": string;
} {
	return { id: anchorId, "data-settings-anchor": anchorId };
}
