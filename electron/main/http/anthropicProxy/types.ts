export type AnthropicThoughtBlock = {
	type: "thinking" | "reasoning";
	text: string;
	signature?: string;
};

export type AnthropicContentBlock =
	| { type: "text"; text: string }
	| { type: "tool_use"; id: string; name: string; input: unknown }
	| {
			type: "tool_result";
			tool_use_id: string;
			content: unknown;
			is_error?: boolean;
	  }
	| AnthropicThoughtBlock
	| Record<string, unknown>;

export interface AnthropicMessage {
	role: string;
	content: string | AnthropicContentBlock[];
}

export interface AnthropicRequest {
	model: string;
	messages: AnthropicMessage[];
	system?: string | Array<{ type: string; text: string }>;
	tools?: Array<{ name: string; description: string; input_schema?: unknown }>;
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
}

export interface OpenAIResponse {
	choices: Array<{
		delta?: {
			role?: string;
			content?: string;
			tool_calls?: Array<{
				index?: number;
				id?: string;
				type?: string;
				function?: { name?: string; arguments?: string };
			}>;
			function_call?: { name?: string; arguments?: string };
			thinking?: unknown;
			reasoning?: unknown;
			reasoning_content?: unknown;
			reasoning_text?: unknown;
			thought?: unknown;
		};
		message: {
			role: string;
			content: string | null;
			thinking?: unknown;
			reasoning?: unknown;
			reasoning_content?: unknown;
			reasoning_text?: unknown;
			thought?: unknown;
			tool_calls?: Array<{
				id: string;
				type: string;
				function: { name: string; arguments: string };
			}>;
			// Legacy single function call format.
			function_call?: { name: string; arguments: string };
		};
		finish_reason: string;
	}>;
	thinking?: unknown;
	reasoning?: unknown;
	reasoning_content?: unknown;
	reasoning_text?: unknown;
	thought?: unknown;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export type OpenAIToolCall = {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
};

export type OpenAIChatMessage =
	| { role: "system"; content: string }
	| { role: "user"; content: string }
	| { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
	| { role: "tool"; content: string; tool_call_id: string };

export interface AnthropicResponse {
	id: string;
	type: "message";
	role: "assistant";
	content: Array<
		| { type: "text"; text: string }
		| { type: "tool_use"; id: string; name: string; input: unknown }
		| AnthropicThoughtBlock
	>;
	model: string;
	stop_reason: "end_turn" | "tool_use" | "max_tokens";
	usage: { input_tokens: number; output_tokens: number };
}

export type ProviderConfig = {
	id?: string;
	provider_type: string;
	api_key?: string;
	api_base?: string;
	template_id?: string;
	metadata?: Record<string, unknown> | null;
};
