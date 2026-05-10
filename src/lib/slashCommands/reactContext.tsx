/**
 * Claude Code 风格斜杠命令 —— React 上下文桥接。
 *
 * 任务：T5.6。
 *
 * 背景：
 * - `/model` 等命令需要调用 `ChatInput` 层持有的 `onModelSelect` 闭包，
 *   以走既有的模型切换入口（符合 R4.1 的"不绕过 Model_Selector 回调直改存储"）。
 * - 为避免把组件 props 直接塞进 `CommandContext`（会造成业务 ↔ UI 耦合），
 *   这里用一个**只读** React Context 暴露需要的闭包，由 `ChatInput` 顶层提供。
 *
 * 约束：
 * - 该 Context 只装"桥接闭包"，不放业务状态；
 * - 未被 Provider 包裹时 `useSlashCommandContext()` 返回一个**安全的 no-op 默认值**，
 *   便于纯测试或受控组件在 `CommandContext` 装配时读到稳定的函数引用。
 */

import { createContext, useContext, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// 桥接契约
// ---------------------------------------------------------------------------

/**
 * 斜杠命令的 UI 层桥接值。
 *
 * - `invokeSelectModel(modelId)`：与 `ChatInput` 的 `onModelSelect` 等价的入口，
 *   由 `/model` 子菜单的 `execute` 调用。
 */
export interface SlashCommandBridge {
	invokeSelectModel: (modelId: string) => void;
}

// ---------------------------------------------------------------------------
// Context 定义
// ---------------------------------------------------------------------------

/**
 * 默认实现：无 Provider 时读到的值；保持函数稳定引用，避免在每次 `useContext`
 * 时触发重渲染或闭包地址变化。
 */
const DEFAULT_BRIDGE: SlashCommandBridge = Object.freeze({
	invokeSelectModel: (_modelId: string): void => {
		// no-op：未安装 Provider（典型发生在单元测试或桌宠子窗口中）。
	},
});

/**
 * 斜杠命令与 UI 层的桥接上下文。
 *
 * 注意：`defaultValue` 故意使用 {@link DEFAULT_BRIDGE}，而非 `null`，
 * 这样 `useSlashCommandContext()` 的返回值永远不为 `null`，调用方不需要做
 * 空值分支处理，保持 TS 类型简洁。
 */
export const SlashCommandContext =
	createContext<SlashCommandBridge>(DEFAULT_BRIDGE);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * 读取当前生效的斜杠命令桥接对象。
 *
 * - 有 Provider → 返回 Provider 的 `value`；
 * - 无 Provider → 返回 {@link DEFAULT_BRIDGE}，其 `invokeSelectModel` 为 no-op。
 */
export function useSlashCommandContext(): SlashCommandBridge {
	return useContext(SlashCommandContext);
}

// ---------------------------------------------------------------------------
// Provider（轻量便捷封装，非必需，但能避免调用方写裸 <SlashCommandContext.Provider>）
// ---------------------------------------------------------------------------

interface SlashCommandProviderProps {
	value: SlashCommandBridge;
	children: ReactNode;
}

/**
 * 斜杠命令桥接 Provider；由 `ChatInput` 顶层挂载，`value` 通常为
 * `{ invokeSelectModel: onModelSelect ?? (() => {}) }`。
 */
export function SlashCommandProvider({
	value,
	children,
}: SlashCommandProviderProps) {
	return (
		<SlashCommandContext.Provider value={value}>
			{children}
		</SlashCommandContext.Provider>
	);
}
