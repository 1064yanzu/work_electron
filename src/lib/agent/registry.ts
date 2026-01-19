// 工具注册中心
// 管理所有可用的工具，支持动态注册和调用

import {
	createToolCall,
	type ToolCall,
	type ToolContext,
	type ToolDefinition,
	type ToolResult,
	type ToolType,
} from "./types";

class ToolRegistry {
	private tools: Map<ToolType, ToolDefinition> = new Map();
	private listeners: Set<() => void> = new Set();

	// 注册工具
	register(tool: ToolDefinition): void {
		this.tools.set(tool.type, tool);
		this.emit();
	}

	// 批量注册
	registerAll(tools: ToolDefinition[]): void {
		tools.forEach((tool) => this.tools.set(tool.type, tool));
		this.emit();
	}

	// 注销工具
	unregister(type: ToolType): void {
		this.tools.delete(type);
		this.emit();
	}

	// 获取工具定义
	get(type: ToolType): ToolDefinition | undefined {
		return this.tools.get(type);
	}

	// 获取所有工具
	getAll(): ToolDefinition[] {
		return Array.from(this.tools.values());
	}

	// 检查工具是否存在
	has(type: ToolType): boolean {
		return this.tools.has(type);
	}

	// 执行工具
	async execute(
		type: ToolType,
		input: Record<string, any>,
		context: ToolContext,
	): Promise<ToolResult> {
		const tool = this.tools.get(type);
		if (!tool) {
			return {
				success: false,
				error: `工具 "${type}" 未注册`,
			};
		}

		try {
			return await tool.execute(input, context);
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	// 创建并执行工具调用
	async createAndExecute(
		type: ToolType,
		input: Record<string, any>,
		context: ToolContext,
		onUpdate?: (toolCall: ToolCall) => void,
	): Promise<{ toolCall: ToolCall; result: ToolResult }> {
		const tool = this.tools.get(type);
		const name = tool?.name || type;
		const description = tool?.description;

		// 创建工具调用记录
		const toolCall = createToolCall(type, name, input, description);
		toolCall.status = "running";
		toolCall.startedAt = Date.now();
		onUpdate?.(toolCall);

		// 执行工具
		const result = await this.execute(type, input, {
			...context,
			onProgress: (progress, message) => {
				context.onProgress?.(progress, message);
				onUpdate?.({
					...toolCall,
					metadata: { ...toolCall.metadata, progress, message },
				});
			},
		});

		// 更新工具调用记录
		toolCall.completedAt = Date.now();
		toolCall.duration = toolCall.completedAt - toolCall.startedAt;

		if (result.success) {
			toolCall.status = "completed";
			toolCall.output = result.data;
		} else {
			toolCall.status = "error";
			toolCall.error = result.error;
		}

		onUpdate?.(toolCall);

		return { toolCall, result };
	}

	// 订阅变化
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private emit(): void {
		this.listeners.forEach((l) => l());
	}
}

// 单例导出
export const toolRegistry = new ToolRegistry();

// 便捷的注册函数
export function registerTool(tool: ToolDefinition): void {
	toolRegistry.register(tool);
}

export function registerTools(tools: ToolDefinition[]): void {
	toolRegistry.registerAll(tools);
}
