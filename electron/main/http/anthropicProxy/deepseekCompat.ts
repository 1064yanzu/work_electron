/**
 * DeepSeek-V4 (pro/flash) 兼容性辅助。
 *
 * 背景：DeepSeek-V4 在思考模式下返回的 `reasoning_content` 字段必须被原样
 * 回传到下一次请求，**即使值是空字符串**。当任务的某一步 tool_call 过于显
 * 而易见时，DeepSeek 返回的 `reasoning_content` 就是空字符串；如果代理或
 * 客户端按"空字段就丢弃"的常规思路过滤掉它，下一轮请求就会触发：
 *
 *   400 "The `reasoning_content` in the thinking mode must be passed back to the API."
 *
 * 实测该空字符串在简单 tool_call 场景下出现概率约 59%，普通重试也救不回来。
 *
 * 我们将兼容行为限定在"模型名包含 deepseek"这一条件下，避免影响其他厂商。
 */
export function isDeepSeekModel(model?: string | null): boolean {
	if (typeof model !== "string") return false;
	return /deepseek/i.test(model);
}
