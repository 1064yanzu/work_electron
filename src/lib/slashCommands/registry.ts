
/**
 * Claude Code 风格斜杠命令 —— 注册表（CommandRegistry）。
 *
 * 职责：
 * 1. 维护 `id → SlashCommandDefinition` 的唯一映射；
 * 2. 提供 `register` / `registerAll` / `replaceCustom` / `byId` / `list(ctx)` /
 *    `listIndexed(ctx)` 等最小必要 API；
 * 3. 在 `list(ctx)` / `listIndexed(ctx)` 时应用 `settings.visibility` 与
 *    `availability(ctx)` 过滤，并对 `disabled.reason` 过长发出运行时告警；
 * 4. 维护稳定排序：group 顺序 `session → runtime → inspect → workspace → custom`，
 *    同 group 内按 `priority ?? 0` 升序、再按注册顺序稳定。
 *
 * 性能策略（Task 1.3）：
 * - 在每次写入（`register` / `replaceCustom`）时为条目冻结一份小写索引
 *   `CommandIndex`，只含 `toLowerCase()` 调用，不使用正则；
 * - 过滤热路径（`filter.ts`）通过 `listIndexed(ctx)` 直接读取预计算好的索引，
 *   避免每次键入都对命令数组做 `toLowerCase()` 扫描。
 *
 * 约束：
 * - 零 `any`；需要宽松类型的位置一律使用 `unknown` 再做窄化。
 * - 本文件不持有任何 UI / 副作用依赖；可被纯测试导入。
 * - 与 `types.ts` 的契约完全一一对应，不擅自扩展字段。
 */

import {
	SlashCommandConflictError,
	type CommandAvailability,
	type CommandContext,
	type CommandGroupId,
	type SlashCommandDefinition,
} from "./types";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** `disabled.reason` 的运行时长度上限；超过则截断 + 告警，不抛错。 */
const DISABLED_REASON_MAX_LENGTH = 120;

/**
 * 稳定排序所使用的 group 次序索引；与 `design.md` 约定保持一致。
 *
 * 使用字面量对象而非数组查找，避免 `list()` 热路径上的 `indexOf` 扫描。
 */
const GROUP_ORDER_INDEX: Readonly<Record<CommandGroupId, number>> = Object.freeze({
	session: 0,
	runtime: 1,
	inspect: 2,
	workspace: 3,
	custom: 4,
});

// ---------------------------------------------------------------------------
// 过滤索引（供 filter.ts 使用）
// ---------------------------------------------------------------------------

/**
 * 命令的过滤索引：`id` / `name` / `description` 的小写形式，在注册时计算一次
 * 并 `Object.freeze`，供 `matchFilter` 热路径直接读取。
 *
 * 这里刻意只做 `toLowerCase()`，不做 NFC/NFKC 归一化或正则拆词，
 * 与 `matchFilter(q, defs)` 的实现口径保持一致；
 * 若未来需要更复杂的规范化，应在此处与 `filter.ts` 一并更新。
 */
export interface CommandIndex {
	readonly lowerId: string;
	readonly lowerName: string;
	readonly lowerDesc: string;
}

/** 供 `filter.ts` 消费的条目最小形状：定义 + 已冻结的索引。 */
export interface IndexedCommand {
	readonly definition: SlashCommandDefinition;
	readonly index: CommandIndex;
}

// ---------------------------------------------------------------------------
// 内部数据结构
// ---------------------------------------------------------------------------

/** Registry 内部每条命令的承载记录。 */
interface RegistryEntry {
	readonly definition: SlashCommandDefinition;
	/** 单调递增的注册序号，用于同 group + 同 priority 下的稳定排序。 */
	readonly registrationIndex: number;
	/** 预计算且已冻结的过滤索引，供 `filter.ts` 热路径使用。 */
	readonly index: CommandIndex;
}

/**
 * 为单条定义计算并冻结过滤索引。
 *
 * 故意把它抽成独立函数，保证 `register` 与 `replaceCustom` 走完全相同的口径，
 * 避免出现一边冻结一边不冻结的半一致状态。
 */
function buildIndex(def: SlashCommandDefinition): CommandIndex {
	return Object.freeze({
		lowerId: def.id.toLowerCase(),
		lowerName: def.name.toLowerCase(),
		lowerDesc: def.description.toLowerCase(),
	});
}

// ---------------------------------------------------------------------------
// CommandRegistry
// ---------------------------------------------------------------------------

/**
 * 斜杠命令注册表。
 *
 * - 对外只暴露最小必要 API；内部状态为 `Map<id, RegistryEntry>` + `Set<customId>`。
 * - 所有写入路径（`register` / `registerAll` / `replaceCustom`）都保持注册表内一致性：
 *   若某次写入会破坏唯一性约束，要么回滚已写入项并抛错，要么告警并跳过，
 *   绝不进入"半写入"中间态。
 */
export class CommandRegistry {
	/** id → 注册条目。 */
	private readonly entries: Map<string, RegistryEntry> = new Map();

	/** `group==="custom"` 的命令 id 集合，用于 `replaceCustom` 做整体替换。 */
	private readonly customIds: Set<string> = new Set();

	/** 下一次注册使用的序号；单调递增，永不回退。 */
	private nextRegistrationIndex = 0;

	/** 已告警过的 `disabled.reason` 过长命令 id，用于抑制重复告警。 */
	private readonly warnedReasonOverflow: Set<string> = new Set();

	/**
	 * 注册单条命令。
	 *
	 * - 若 `def.id` 已存在 → 抛 {@link SlashCommandConflictError}，注册表状态不变。
	 * - 返回的 `unregister` 幂等：首次调用移除该条目，后续调用 no-op 且不抛错；
	 *   若同 id 在注销前又被其它路径覆盖注册（索引不匹配），则不会误删新条目。
	 */
	register(def: SlashCommandDefinition): () => void {
		if (this.entries.has(def.id)) {
			throw new SlashCommandConflictError(def.id);
		}

		const entry: RegistryEntry = {
			definition: def,
			registrationIndex: this.nextRegistrationIndex++,
			index: buildIndex(def),
		};
		this.entries.set(def.id, entry);
		if (def.group === "custom") {
			this.customIds.add(def.id);
		}

		// 关闭变量：保证幂等 + 防御性匹配
		let active = true;
		return (): void => {
			if (!active) return;
			active = false;
			const current = this.entries.get(def.id);
			// 若同 id 已被重新注册（registrationIndex 不同），则不触碰新条目
			if (
				current !== undefined &&
				current.registrationIndex === entry.registrationIndex
			) {
				this.entries.delete(def.id);
				this.customIds.delete(def.id);
				this.warnedReasonOverflow.delete(def.id);
			}
		};
	}

	/**
	 * 启动期批量注册（一般用于内置命令）。
	 *
	 * - 若 `defs` 中出现重复 id 或与注册表既有 id 冲突，
	 *   **本次调用已成功注册的条目将被全部回滚**，随后抛 {@link SlashCommandConflictError}。
	 * - 零破坏：失败时注册表恢复到调用前状态。
	 */
	registerAll(defs: readonly SlashCommandDefinition[]): void {
		const rollbacks: Array<() => void> = [];
		try {
			for (const def of defs) {
				rollbacks.push(this.register(def));
			}
		} catch (err) {
			// 回滚：按入栈顺序逆序撤销，保证不会泄漏半写入
			for (let i = rollbacks.length - 1; i >= 0; i--) {
				rollbacks[i]();
			}
			throw err;
		}
	}

	/**
	 * 替换所有 `group==="custom"` 的命令。
	 *
	 * 规则（与 `design.md` 冲突策略保持一致）：
	 * 1. 先 unregister 现有所有 custom 条目；
	 * 2. 逐一处理新 defs：
	 *    - 若与内置（非 custom）命令 id 冲突 → `console.warn` + 跳过（不抛错，避免启动期崩溃）；
	 *    - 若与同批次另一条 custom 冲突 → 保留先来者 + `console.warn`。
	 *
	 * 注意：此方法**不抛错**；当需要启动期批量严格校验时请使用 `registerAll`。
	 */
	replaceCustom(defs: readonly SlashCommandDefinition[]): void {
		// 1. 清空既有 custom 条目
		for (const id of this.customIds) {
			this.entries.delete(id);
			this.warnedReasonOverflow.delete(id);
		}
		this.customIds.clear();

		// 2. 增量写入新 custom 条目
		const seenInBatch = new Set<string>();
		for (const def of defs) {
			if (def.group !== "custom") {
				console.warn(
					`[slashCommands] replaceCustom 收到非 custom 分组的定义 "${def.id}" (group=${def.group})，已忽略。`,
				);
				continue;
			}
			if (seenInBatch.has(def.id)) {
				console.warn(
					`[slashCommands] 自定义命令 "${def.id}" 在同一批次中重复出现，已保留先来者。`,
				);
				continue;
			}
			if (this.entries.has(def.id)) {
				// 此时剩余条目都不是 custom（customIds 已清空），必为内置冲突
				console.warn(
					`[slashCommands] 自定义命令 "${def.id}" 与内置命令 id 冲突，已拒绝覆盖。`,
				);
				continue;
			}
			seenInBatch.add(def.id);
			const entry: RegistryEntry = {
				definition: def,
				registrationIndex: this.nextRegistrationIndex++,
				index: buildIndex(def),
			};
			this.entries.set(def.id, entry);
			this.customIds.add(def.id);
		}
	}

	/**
	 * 按 id 直接取出命令定义（无视可见性与可用性）。
	 *
	 * 用于 Executor 在已知 id 时拿到元数据，不参与过滤。
	 */
	byId(id: string): SlashCommandDefinition | null {
		const entry = this.entries.get(id);
		return entry === undefined ? null : entry.definition;
	}

	/**
	 * 按上下文列出当前应展示的命令。
	 *
	 * 过滤规则：
	 * 1. 若 `settings.visibility[visibilityKey ?? id] === "hide"` → 排除；
	 * 2. 若 `availability(ctx).state === "hidden"` → 排除；
	 * 3. 其余（`available` / `disabled`）保留，按稳定顺序输出。
	 *
	 * 守护：若某条命令返回 `disabled` 且 `reason.length > 120`，记录 `console.warn`
	 * （每个 id 仅告警一次），保持命令可展示，不抛错；调用方渲染 tooltip 时应当自行
	 * 做二次裁剪或使用已知上限。
	 *
	 * 实现上直接复用 {@link listIndexed}，只丢弃 `index` 字段，避免两条口径分叉。
	 */
	list(ctx: CommandContext): SlashCommandDefinition[] {
		return this.listIndexed(ctx).map((e) => e.definition);
	}

	/**
	 * 与 {@link list} 完全相同的过滤 + 排序口径，但额外附带预计算好的
	 * {@link CommandIndex}，供 `filter.ts` 的热路径消费。
	 *
	 * - 返回数组中的 `index` 对象是 {@link register} / {@link replaceCustom}
	 *   写入时 `Object.freeze` 过的同一引用，调用方可安全读取，无需再次拷贝。
	 * - 过滤条件与 {@link list} 保持一致，两者必须同时更新以免菜单与过滤结果不一致。
	 */
	listIndexed(ctx: CommandContext): IndexedCommand[] {
		const visibility = ctx.settings.visibility;
		const visible: RegistryEntry[] = [];

		for (const entry of this.entries.values()) {
			const def = entry.definition;

			// 规则 1：设置面板显式隐藏
			const visKey = def.visibilityKey ?? def.id;
			if (visibility[visKey] === "hide") continue;

			// 规则 2：availability(ctx) 判定；调用失败按 hidden 处理，保持 UI 不崩
			let availability: CommandAvailability;
			try {
				availability = def.availability(ctx);
			} catch (err) {
				console.warn(
					`[slashCommands] 命令 "${def.id}".availability() 抛出异常，按 hidden 处理。`,
					err,
				);
				continue;
			}
			if (availability.state === "hidden") continue;

			// 规则 3：disabled.reason 长度守护（仅告警，不改变返回值）
			if (
				availability.state === "disabled" &&
				availability.reason.length > DISABLED_REASON_MAX_LENGTH &&
				!this.warnedReasonOverflow.has(def.id)
			) {
				this.warnedReasonOverflow.add(def.id);
				console.warn(
					`[slashCommands] 命令 "${def.id}" 的 disabled.reason 长度为 ${availability.reason.length}，超过上限 ${DISABLED_REASON_MAX_LENGTH}，请在定义侧裁剪。`,
				);
			}

			visible.push(entry);
		}

		// 稳定排序：group → priority(升序) → registrationIndex(升序)
		visible.sort((a, b) => {
			const groupDelta =
				GROUP_ORDER_INDEX[a.definition.group] -
				GROUP_ORDER_INDEX[b.definition.group];
			if (groupDelta !== 0) return groupDelta;

			const priorityDelta =
				(a.definition.priority ?? 0) - (b.definition.priority ?? 0);
			if (priorityDelta !== 0) return priorityDelta;

			return a.registrationIndex - b.registrationIndex;
		});

		// 注意：这里只取 `definition` 与 `index` 两个字段，不把内部 `registrationIndex`
		// 透出到外部，避免形成隐式耦合。
		return visible.map<IndexedCommand>((e) => ({
			definition: e.definition,
			index: e.index,
		}));
	}

	// -------------------------------------------------------------------------
	// 测试专用 hook —— 不对外暴露，仅供单元/属性测试 reset
	// -------------------------------------------------------------------------

	/**
	 * @internal 仅供 `__tests__/` 下的测试套件调用，用于在用例之间重置状态。
	 * 生产代码**禁止**调用。
	 */
	__resetForTests(): void {
		this.entries.clear();
		this.customIds.clear();
		this.warnedReasonOverflow.clear();
		this.nextRegistrationIndex = 0;
	}
}

// ---------------------------------------------------------------------------
// 单例导出
// ---------------------------------------------------------------------------

/**
 * 注册表单例：整个渲染进程共享同一份 `CommandRegistry`。
 *
 * - 内置命令在应用启动时通过 `registerAll` 注入；
 * - 自定义命令在扫描/热更新时通过 `replaceCustom` 注入；
 * - UI 层调用 `commandRegistry.list(ctx)` 获取当前可见命令。
 */
export const commandRegistry: CommandRegistry = new CommandRegistry();

