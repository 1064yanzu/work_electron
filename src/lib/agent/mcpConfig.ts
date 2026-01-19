/**
 * MCP Server Configuration
 *
 * MCP (Model Context Protocol) 服务器配置和管理。
 * 支持配置外部 MCP 服务器以扩展 Agent 能力。
 */

/**
 * MCP Server 配置类型
 */
export interface McpServerConfig {
	/** 服务器名称（唯一标识） */
	name: string;
	/** 启动命令 */
	command: string;
	/** 命令参数 */
	args?: string[];
	/** 环境变量 */
	env?: Record<string, string>;
	/** 描述 */
	description?: string;
	/** 是否启用 */
	enabled?: boolean;
}

/**
 * MCP Server 状态
 */
export interface McpServerStatus {
	name: string;
	status: "connected" | "disconnected" | "error";
	tools?: string[];
	error?: string;
}

/**
 * 预置的 MCP 服务器配置
 */
export const PRESET_MCP_SERVERS: Record<
	string,
	Omit<McpServerConfig, "name">
> = {
	playwright: {
		command: "npx",
		args: ["-y", "@playwright/mcp@latest"],
		description: "浏览器自动化（Playwright）",
	},
	github: {
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-github"],
		description: "GitHub API 集成",
		env: {
			GITHUB_TOKEN: "", // 需要用户配置
		},
	},
	postgres: {
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-postgres"],
		description: "PostgreSQL 数据库查询",
	},
	filesystem: {
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-filesystem"],
		description: "文件系统访问",
	},
	memory: {
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-memory"],
		description: "持久化知识图谱",
	},
	"brave-search": {
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-brave-search"],
		description: "Brave 搜索引擎",
		env: {
			BRAVE_API_KEY: "", // 需要用户配置
		},
	},
};

/**
 * MCP Server 配置存储
 */
class McpServerStore {
	private servers = new Map<string, McpServerConfig>();
	private listeners = new Set<() => void>();

	constructor() {
		// 从本地存储加载配置
		this.loadFromStorage();
	}

	/**
	 * 添加或更新服务器配置
	 */
	setServer(config: McpServerConfig): void {
		this.servers.set(config.name, config);
		this.saveToStorage();
		this.notifyListeners();
	}

	/**
	 * 移除服务器配置
	 */
	removeServer(name: string): void {
		this.servers.delete(name);
		this.saveToStorage();
		this.notifyListeners();
	}

	/**
	 * 启用/禁用服务器
	 */
	toggleServer(name: string, enabled: boolean): void {
		const server = this.servers.get(name);
		if (server) {
			server.enabled = enabled;
			this.saveToStorage();
			this.notifyListeners();
		}
	}

	/**
	 * 获取所有服务器配置
	 */
	getAllServers(): McpServerConfig[] {
		return Array.from(this.servers.values());
	}

	/**
	 * 获取已启用的服务器配置
	 */
	getEnabledServers(): McpServerConfig[] {
		return this.getAllServers().filter((s) => s.enabled !== false);
	}

	/**
	 * 获取服务器配置
	 */
	getServer(name: string): McpServerConfig | undefined {
		return this.servers.get(name);
	}

	/**
	 * 转换为 SDK 格式
	 */
	toSdkFormat(): Record<
		string,
		{ command: string; args?: string[]; env?: Record<string, string> }
	> {
		const result: Record<
			string,
			{ command: string; args?: string[]; env?: Record<string, string> }
		> = {};

		for (const server of this.getEnabledServers()) {
			result[server.name] = {
				command: server.command,
				args: server.args,
				env: server.env,
			};
		}

		return result;
	}

	/**
	 * 从预置模板添加服务器
	 */
	addFromPreset(
		presetName: string,
		overrides?: Partial<McpServerConfig>,
	): void {
		const preset = PRESET_MCP_SERVERS[presetName];
		if (!preset) {
			throw new Error(`Unknown preset: ${presetName}`);
		}

		this.setServer({
			name: presetName,
			...preset,
			...overrides,
			enabled: true,
		});
	}

	/**
	 * 保存到本地存储
	 */
	private saveToStorage(): void {
		try {
			const data = Array.from(this.servers.values());
			localStorage.setItem("mcp_servers", JSON.stringify(data));
		} catch (e) {
			console.error("Failed to save MCP servers to storage:", e);
		}
	}

	/**
	 * 从本地存储加载
	 */
	private loadFromStorage(): void {
		try {
			const data = localStorage.getItem("mcp_servers");
			if (data) {
				const servers: McpServerConfig[] = JSON.parse(data);
				for (const server of servers) {
					this.servers.set(server.name, server);
				}
			}
		} catch (e) {
			console.error("Failed to load MCP servers from storage:", e);
		}
	}

	/**
	 * 订阅状态变化
	 */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * 通知监听器
	 */
	private notifyListeners(): void {
		this.listeners.forEach((l) => l());
	}
}

// 单例实例
export const mcpServerStore = new McpServerStore();

/**
 * 获取 MCP 配置用于 SDK
 */
export function getMcpConfigForSdk(): Record<
	string,
	{ command: string; args?: string[]; env?: Record<string, string> }
> {
	return mcpServerStore.toSdkFormat();
}
