/**
 * Claude Code 认证状态检测
 *
 * 读取用户本机的 Claude Code 认证信息，包括：
 * - 环境变量 ANTHROPIC_API_KEY
 * - ~/.claude.json 中的 OAuth 账号信息
 * - ~/.claude/settings.json 中的 model / mcpServers
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

// ─── 用户本机 CLI 配置读取 ─────────────────────────────────────

export interface UserCliConfig {
	claude?: {
		model?: string;
		mcpServers?: Array<{ name: string; command?: string; url?: string; type?: string }>;
		permissions?: string[];
	};
	codex?: {
		model?: string;
		provider?: string;
	};
}

/**
 * 读取用户本机 CLI 配置文件，返回可用于同步到 app 设置的偏好数据。
 * - Claude Code: ~/.claude/settings.json (model, mcpServers, permissions)
 * - Codex:       ~/.codex/config.toml   (model, provider)
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
		// 简单的 TOML key = value 解析（无需第三方库）
		const model = raw.match(/^\s*model\s*=\s*"([^"]+)"/m)?.[1];
		const provider = raw.match(/^\s*provider\s*=\s*"([^"]+)"/m)?.[1];
		if (model ?? provider) {
			result.codex = {};
			if (model) result.codex.model = model;
			if (provider) result.codex.provider = provider;
		}
	} catch {
		// 文件不存在或解析失败时忽略
	}

	return result;
}
