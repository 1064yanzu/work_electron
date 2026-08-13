/**
 * Claude Agent SDK Service
 *
 * Wrapper around @anthropic-ai/claude-agent-sdk to integrate with our existing UI.
 * This provides a clean abstraction that converts SDK messages to our internal format.
 *
 * Uses local Anthropic proxy server (port 8765) to support ALL models through SDK.
 */

export { ClaudeAgentService, claudeAgent } from "./claudeAgentService/service";
export type {
	AgentMessage,
	AgentUsageStats,
	ClaudeAgentExecutionOptions,
} from "./claudeAgentService/types";
