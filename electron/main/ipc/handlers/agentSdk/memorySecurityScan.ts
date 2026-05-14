/**
 * 写入记忆前的安全扫描 —— 防止 Agent 把恶意内容（指令注入、不可见字符、
 * 隐写 HTML）写入持久化记忆，下次会话时变成"自我越狱"的输入。
 *
 * 检测三类：
 *   1. 指令注入：试图覆盖系统提示、扮演新人格、忽略此前指令
 *   2. 不可见 / 控制字符：零宽、双向重写、BOM 等
 *   3. 危险 HTML / 脚本协议
 */

export interface SecurityScanResult {
	ok: boolean;
	reason?: string;
	matchedPattern?: string;
}

const INJECTION_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
	{
		pattern:
			/\bignore\s+(?:all\s+)?(?:previous|prior|above|the\s+above)\s+(?:instructions?|prompts?|commands?|rules?|messages?)\b/i,
		description: "ignore previous instructions",
	},
	{
		pattern: /\bdisregard\s+(?:the\s+)?(?:above|previous|prior)\b/i,
		description: "disregard above",
	},
	{
		pattern:
			/\b(?:you\s+are|act\s+as|pretend\s+to\s+be)\s+(?:a\s+)?(?:different|new)\s+(?:ai|assistant|model|persona)\b/i,
		description: "persona override",
	},
	{
		pattern: /\bnew\s+(?:system\s+)?(?:prompt|instructions?)\s*[:：]/i,
		description: "new system prompt",
	},
	{
		pattern: /<\s*\/?\s*(?:system|instructions?|assistant)\s*>/i,
		description: "system tag injection",
	},
	{
		pattern:
			/(?:忽略|无视|忘掉)(?:之前|以上|上面|所有)(?:的)?(?:指令|提示|要求|规则|消息|内容)/,
		description: "忽略此前指令",
	},
	{
		pattern: /(?:从现在开始|从此以后)(?:你|您)(?:是|扮演)/,
		description: "人格切换",
	},
	{
		pattern: /系统提示词?\s*[:：]/,
		description: "系统提示词标签",
	},
];

// 零宽空格、零宽连接符、双向重写控制符、不间断空格变体、BOM 等
// 显式 \u 写法避免源码里出现不可见字符
const INVISIBLE_CHAR_PATTERN =
	/[​-‏‪-‮⁠-⁤­﻿]/;

const DANGEROUS_HTML_PATTERNS: Array<{ pattern: RegExp; description: string }> =
	[
		{ pattern: /<\s*script\b/i, description: "<script>" },
		{ pattern: /<\s*iframe\b/i, description: "<iframe>" },
		{ pattern: /<\s*object\b/i, description: "<object>" },
		{ pattern: /<\s*embed\b/i, description: "<embed>" },
		{ pattern: /\bjavascript\s*:/i, description: "javascript: URI" },
		{ pattern: /\bdata\s*:\s*text\/html/i, description: "data:text/html URI" },
		{ pattern: /\bon\w+\s*=\s*["']?\w/i, description: "inline event handler" },
	];

export function scanForInjection(content: string): SecurityScanResult {
	if (typeof content !== "string" || !content) {
		return { ok: true };
	}

	for (const { pattern, description } of INJECTION_PATTERNS) {
		if (pattern.test(content)) {
			return {
				ok: false,
				reason: "INSTRUCTION_INJECTION",
				matchedPattern: description,
			};
		}
	}

	if (INVISIBLE_CHAR_PATTERN.test(content)) {
		return {
			ok: false,
			reason: "INVISIBLE_CHAR",
			matchedPattern: "zero-width or bidi control character",
		};
	}

	for (const { pattern, description } of DANGEROUS_HTML_PATTERNS) {
		if (pattern.test(content)) {
			return {
				ok: false,
				reason: "DANGEROUS_HTML",
				matchedPattern: description,
			};
		}
	}

	return { ok: true };
}
