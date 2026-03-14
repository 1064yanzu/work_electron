/**
 * Claude Code 认证状态检测 + 用户本地 CLI 配置读取
 *
 * 读取用户本机的 CLI 配置信息：
 * - Claude Code: ~/.claude/settings.json (model, mcpServers, permissions)
 * - Codex:       ~/.codex/config.toml   (model, provider, reasoning_effort, approval_policy, sandbox_mode, etc.)
 * - 环境变量 ANTHROPIC_API_KEY / OPENAI_API_KEY
 * - ~/.claude.json 中的 OAuth 账号信息
 */

import fsp from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

// ─── 类型定义 ─────────────────────────────────────────────────────

export interface ClaudeAuthStatus {
	isLoggedIn: boolean;
	authMethod: "oauth" | "api_key" | "env_key" | "none";
	/** OAuth 登录时的邮箱 */
	email?: string;
	/** ~/.claude/settings.json 中配置的 model */
	model?: string;
	/** MCP 服务器列表 */
	mcpServers?: Array<{
		name: string;
		command?: string;
		url?: string;
		type?: string;
	}>;
}

// ─── 内部辅助类型 ─────────────────────────────────────────────────

interface ClaudeJsonFile {
	oauthAccount?: { emailAddress?: string; email?: string };
	primaryAccount?: { emailAddress?: string; email?: string };
	account?: { emailAddress?: string; email?: string };
	/** 直接顶层邮箱（某些版本） */
	emailAddress?: string;
	/** Claude AI OAuth token（某些版本） */
	claudeAiOauth?: { accessToken?: string; expiresAt?: number };
	apiKey?: string;
}

interface ClaudeSettingsFile {
	model?: string;
	mcpServers?: Record<
		string,
		{ type?: string; command?: string; args?: string[]; url?: string }
	>;
}

// ─── 内部读取函数 ─────────────────────────────────────────────────

async function readClaudeSettings(): Promise<ClaudeSettingsFile | null> {
	try {
		const homeDir = app.getPath("home");
		const settingsPath = path.join(homeDir, ".claude", "settings.json");
		const raw = await fsp.readFile(settingsPath, "utf-8");
		return JSON.parse(raw) as ClaudeSettingsFile;
	} catch {
		return null;
	}
}

function buildMcpServers(
	settings: ClaudeSettingsFile | null,
): ClaudeAuthStatus["mcpServers"] {
	if (!settings?.mcpServers) return undefined;
	const entries = Object.entries(settings.mcpServers);
	if (entries.length === 0) return undefined;
	return entries.map(([name, cfg]) => ({
		name,
		command: cfg.command,
		url: cfg.url,
		type: cfg.type,
	}));
}

// ─── 主入口 ───────────────────────────────────────────────────────

export async function getClaudeAuthStatus(): Promise<ClaudeAuthStatus> {
	// 优先级 1：环境变量中的 API Key
	if (process.env.ANTHROPIC_API_KEY?.trim()) {
		const settings = await readClaudeSettings();
		return {
			isLoggedIn: true,
			authMethod: "env_key",
			model: settings?.model,
			mcpServers: buildMcpServers(settings),
		};
	}

	// 优先级 2：读取 ~/.claude.json
	const homeDir = app.getPath("home");
	const claudeJsonPath = path.join(homeDir, ".claude.json");
	let hasOAuth = false;
	let email: string | undefined;

	try {
		const raw = await fsp.readFile(claudeJsonPath, "utf-8");
		const data = JSON.parse(raw) as ClaudeJsonFile;

		// 检查 OAuth Token（活跃 token）
		const oauth = data.claudeAiOauth;
		if (oauth?.accessToken) {
			const nowSeconds = Date.now() / 1000;
			if (
				typeof oauth.expiresAt !== "number" ||
				oauth.expiresAt > nowSeconds
			) {
				hasOAuth = true;
			}
		}

		// 检查账号对象字段
		for (const key of [
			"oauthAccount",
			"primaryAccount",
			"account",
		] as const) {
			const val = data[key];
			if (val && typeof val === "object") {
				hasOAuth = true;
				email = val.emailAddress || val.email;
				break;
			}
		}

		// 检查顶层 emailAddress
		if (!hasOAuth && data.emailAddress) {
			hasOAuth = true;
			email = data.emailAddress;
		}
	} catch {
		// 文件不存在或解析失败，保持 hasOAuth=false
	}

	// 读取 settings.json
	const settings = await readClaudeSettings();

	if (hasOAuth) {
		return {
			isLoggedIn: true,
			authMethod: "oauth",
			email,
			model: settings?.model,
			mcpServers: buildMcpServers(settings),
		};
	}

	return {
		isLoggedIn: false,
		authMethod: "none",
		model: settings?.model,
		mcpServers: buildMcpServers(settings),
	};
}

// ─── 用户本机 CLI 配置读取（增强版） ──────────────────────────────

export interface UserCliConfig {
	claude?: {
		model?: string;
		mcpServers?: Array<{ name: string; command?: string; url?: string; type?: string }>;
		permissions?: string[];
	};
	codex?: {
		model?: string;
		provider?: string;
		/** Codex 思考程度 */
		reasoningEffort?: "low" | "medium" | "high";
		/** 审批策略 */
		approvalPolicy?: string;
		/** 沙盒模式 */
		sandboxMode?: string;
		/** 是否禁用响应存储 */
		disableResponseStorage?: boolean;
		/** 自动审批超时 */
		autoApproveTimeoutMs?: number;
		/** 通知命令 */
		notifyCommand?: string;
	};
}

/**
 * 简单 TOML 键值提取（避免引入第三方 TOML 库）
 * 支持 key = "value" / key = true / key = 123 格式
 */
function extractTomlString(raw: string, key: string): string | undefined {
	const match = raw.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"));
	return match?.[1];
}

function extractTomlBool(raw: string, key: string): boolean | undefined {
	const match = raw.match(new RegExp(`^\\s*${key}\\s*=\\s*(true|false)`, "m"));
	if (!match) return undefined;
	return match[1] === "true";
}

function extractTomlNumber(raw: string, key: string): number | undefined {
	const match = raw.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)`, "m"));
	if (!match) return undefined;
	return Number.parseInt(match[1], 10);
}

/**
 * 读取用户本机 CLI 配置文件，返回可用于同步到 app 设置的偏好数据。
 * - Claude Code: ~/.claude/settings.json (model, mcpServers, permissions)
 * - Codex:       ~/.codex/config.toml   (model, provider, reasoning_effort, approval_policy, ...)
 */
export async function readUserCliConfig(): Promise<UserCliConfig> {
	const homeDir = app.getPath("home");
	const result: UserCliConfig = {};

	// ── Claude Code: ~/.claude/settings.json ──
	try {
		const raw = await fsp.readFile(
			path.join(homeDir, ".claude", "settings.json"),
			"utf-8",
		);
		interface FullClaudeSettings {
			model?: string;
			mcpServers?: Record<string, { type?: string; command?: string; args?: string[]; url?: string }>;
			permissions?: { allow?: string[]; deny?: string[] };
		}
		const data = JSON.parse(raw) as FullClaudeSettings;
		result.claude = {};
		if (data.model) result.claude.model = data.model;
		if (data.mcpServers) {
			result.claude.mcpServers = Object.entries(data.mcpServers).map(
				([name, cfg]) => ({ name, command: cfg.command, url: cfg.url, type: cfg.type }),
			);
		}
		if (data.permissions?.allow?.length) {
			result.claude.permissions = data.permissions.allow;
		}
	} catch {
		// 文件不存在或解析失败时忽略
	}

	// ── Codex: ~/.codex/config.toml ──
	try {
		const raw = await fsp.readFile(
			path.join(homeDir, ".codex", "config.toml"),
			"utf-8",
		);

		const model = extractTomlString(raw, "model");
		const provider = extractTomlString(raw, "provider");
		const reasoningEffort = extractTomlString(raw, "reasoning_effort");
		const approvalPolicy = extractTomlString(raw, "approval_policy");
		const sandboxMode = extractTomlString(raw, "sandbox_mode");
		const disableResponseStorage = extractTomlBool(raw, "disable_response_storage");
		const autoApproveTimeoutMs = extractTomlNumber(raw, "auto_approve_timeout_ms");
		const notifyCommand = extractTomlString(raw, "notify_command");

		if (model ?? provider ?? reasoningEffort ?? approvalPolicy) {
			result.codex = {};
			if (model) result.codex.model = model;
			if (provider) result.codex.provider = provider;
			if (reasoningEffort && ["low", "medium", "high"].includes(reasoningEffort)) {
				result.codex.reasoningEffort = reasoningEffort as "low" | "medium" | "high";
			}
			if (approvalPolicy) result.codex.approvalPolicy = approvalPolicy;
			if (sandboxMode) result.codex.sandboxMode = sandboxMode;
			if (disableResponseStorage != null) result.codex.disableResponseStorage = disableResponseStorage;
			if (autoApproveTimeoutMs != null) result.codex.autoApproveTimeoutMs = autoApproveTimeoutMs;
			if (notifyCommand) result.codex.notifyCommand = notifyCommand;
		}
	} catch {
		// 文件不存在或解析失败时忽略
	}

	return result;
}
