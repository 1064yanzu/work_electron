// 输入区密度档位。
//
// 右栏是 react-resizable-panels 的 Panel（minSize 12% / maxSize 50%），
// 1440px 窗口下 ChatInput 实际宽度区间约 150px ~ 700px，视口媒体查询在这里无效，
// 必须按容器自身宽度分档（见 hooks/useContainerBreakpoint）。

/**
 * 阈值按「底栏一行能否完整放下三个带文字的配置项」标定（控件全裸态，无胶囊内距）：
 *
 *   [+]28 + 模式67 + 模型122 + 风格67 + 发送28 + 间隙8 + 内距12 ≈ 332px
 *
 * - `compact`  < 300px —— 三个配置项**一起**收成纯图标 + 状态角标点，chevron 也一起收
 * - `regular`  300–447px —— 全部「图标 + 值 + chevron」，模型名截断到 86px
 * - `wide`     ≥ 448px —— 同上，模型名放宽到 160px
 *
 * 关键：文字的显隐是**整组同进同退**的，不存在「某项有字某项纯图标」。
 */
export type InputDensity = "compact" | "regular" | "wide";

/** 供 useContainerBreakpoint 使用的阈值表（升序）。 */
export const INPUT_DENSITY_STEPS = [
	[0, "compact"],
	[330, "regular"],
	[470, "wide"],
] as const satisfies ReadonlyArray<readonly [number, InputDensity]>;

/** 配置项的值文案最大宽度（只有模型名会长到需要截断）。 */
export const MODEL_VALUE_MAX_WIDTH: Record<InputDensity, number> = {
	compact: 0,
	regular: 86,
	wide: 170,
};

/** textarea 自动增高上限 —— 窄栏把高度让给消息区，宽栏可以多撑几行。 */
export const TEXTAREA_MAX_HEIGHT: Record<InputDensity, number> = {
	compact: 150,
	regular: 190,
	wide: 230,
};

/**
 * 配置项是否展示「值 + chevron」—— 整组同进同退的唯一开关。
 * 所有配置项都必须用它，不允许自己发明显示规则。
 */
export function showsPillValue(density: InputDensity): boolean {
	return density !== "compact";
}
