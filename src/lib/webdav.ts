export interface WebDAVConfig {
	url: string;
	username: string;
	password: string;
	enabled: boolean;
}

class WebDAVSync {
	private config: WebDAVConfig | null = null;

	constructor() {
		this.loadConfig();
	}

	private loadConfig() {
		const saved = localStorage.getItem("webdav_config");
		if (saved) {
			this.config = JSON.parse(saved);
		}
	}

	getConfig(): WebDAVConfig | null {
		return this.config;
	}

	async setConfig(config: WebDAVConfig) {
		this.config = config;
		localStorage.setItem("webdav_config", JSON.stringify(config));
	}

	async testConnection(
		url: string,
		username: string,
		password: string,
	): Promise<boolean> {
		try {
			// 实际实现应调用 WebDAV PROPFIND 请求
			// 这里仅作演示
			const response = await fetch(url, {
				method: "PROPFIND",
				headers: {
					Authorization: `Basic ${btoa(`${username}:${password}`)}`,
					Depth: "0",
				},
			});

			return response.ok;
		} catch (error) {
			console.error("WebDAV connection test failed:", error);
			return false;
		}
	}

	async syncUp(data: string): Promise<void> {
		if (!this.config || !this.config.enabled) {
			throw new Error("WebDAV 未配置或未启用");
		}

		// 实际实现：上传数据到 WebDAV 服务器
		console.log("Syncing up to WebDAV...", data.length, "bytes");
	}

	async syncDown(): Promise<string> {
		if (!this.config || !this.config.enabled) {
			throw new Error("WebDAV 未配置或未启用");
		}

		// 实际实现：从 WebDAV 服务器下载数据
		console.log("Syncing down from WebDAV...");
		return "";
	}

	async autoSync(interval: number = 300000) {
		// 每5分钟自动同步一次
		setInterval(async () => {
			if (this.config?.enabled) {
				try {
					console.log("Auto syncing...");
					// await this.syncUp(data);
				} catch (error) {
					console.error("Auto sync failed:", error);
				}
			}
		}, interval);
	}
}

export const webdavSync = new WebDAVSync();
