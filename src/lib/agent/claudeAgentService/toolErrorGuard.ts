import { extractToolErrorMessageFromUnknown } from "@/lib/agent/runtimeText";

/**
 * 工具失败会持续反馈给模型自行恢复，这里只做死循环保护，不再过早中断任务。
 */
export class ToolErrorLoopGuard {
	private toolUseErrorCount = 0;
	private lastToolUseError: string | null = null;
	private lastToolUseId: string | null = null;
	private toolErrorWarningMilestones = new Set<number>();

	constructor(
		private toolNamesById: Map<string, string>,
		private debug: boolean,
	) {}

	/**
	 * 处理 user 消息中的 tool_use_error 块。
	 * 返回需要提示用户的告警文本（3/8 次里程碑）以及触发保护性终止时的 guidance。
	 */
	recordUserMessage(msgAny: any): {
		warnings: string[];
		abortGuidance: string | null;
	} {
		const blocks = Array.isArray(msgAny?.message?.content)
			? msgAny.message.content
			: [];
		const toolErrorBlocks = blocks.filter(
			(b: any) =>
				b?.type === "tool_result" &&
				typeof b?.content === "string" &&
				String(b.content).includes("<tool_use_error>"),
		);
		const toolErrors = toolErrorBlocks.map((b: any) =>
			typeof b?.content === "string" ? b.content : "",
		);

		const warnings: string[] = [];
		if (toolErrors.length === 0) {
			return { warnings, abortGuidance: null };
		}

		this.toolUseErrorCount += toolErrors.length;
		this.lastToolUseError =
			toolErrors[toolErrors.length - 1] ?? this.lastToolUseError;
		this.lastToolUseId =
			String(toolErrorBlocks[toolErrorBlocks.length - 1]?.tool_use_id || "") ||
			this.lastToolUseId;

		if (this.debug) {
			console.error(
				`[ClaudeAgentService] Tool use error (${this.toolUseErrorCount}/20):`,
				{
					errorCount: toolErrors.length,
					totalErrors: this.toolUseErrorCount,
					lastError: this.lastToolUseError,
					lastToolUseId: this.lastToolUseId,
				},
			);
		}

		const toolName = this.lastToolUseId
			? this.toolNamesById.get(this.lastToolUseId)
			: undefined;
		const errText =
			extractToolErrorMessageFromUnknown(this.lastToolUseError) ||
			"工具调用失败";

		for (const milestone of [3, 8]) {
			if (
				this.toolUseErrorCount >= milestone &&
				!this.toolErrorWarningMilestones.has(milestone)
			) {
				this.toolErrorWarningMilestones.add(milestone);
				warnings.push(
					[
						`检测到工具已连续失败 ${this.toolUseErrorCount} 次，当前不会立即中止任务。`,
						toolName ? `最近失败的工具：${toolName}` : null,
						errText ? `最近错误：${errText}` : null,
						"系统将继续保留当前运行，让 Agent 优先改用列目录、校正路径或切换方案继续处理。",
					]
						.filter(Boolean)
						.join("\n"),
				);
			}
		}

		if (this.toolUseErrorCount >= 20) {
			const errRaw =
				this.lastToolUseError || "Tool call failed repeatedly (20+ errors)";
			const finalError =
				extractToolErrorMessageFromUnknown(errRaw) ||
				"工具调用连续失败，疑似进入死循环。";
			const guidance = [
				"工具调用连续失败过多，任务已被保护性终止。",
				toolName || this.lastToolUseId
					? `最后一次失败的工具：${toolName || "unknown"}（tool_use_id=${this.lastToolUseId || "unknown"}）`
					: null,
				finalError ? `错误信息：${finalError}` : null,
				"建议：请先用 Glob 列出沙盒目录下的实际文件名，再用 Read 读取；或确认引用的文件路径是否在当前沙盒目录内。",
				"你也可以把上面失败的工具卡片展开，查看当时发送的参数。",
			]
				.filter(Boolean)
				.join("\n");
			console.error(
				"[ClaudeAgentService] Aborting due to repeated tool errors:",
				{
					totalErrors: this.toolUseErrorCount,
					lastError: finalError,
					lastToolUseId: this.lastToolUseId,
				},
			);
			return { warnings, abortGuidance: guidance };
		}

		return { warnings, abortGuidance: null };
	}

	reset(): void {
		this.toolUseErrorCount = 0;
		this.lastToolUseError = null;
		this.lastToolUseId = null;
		this.toolErrorWarningMilestones.clear();
	}
}
