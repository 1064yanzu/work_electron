import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import {
	type AnthropicProxySupervisor,
	startAnthropicProxySupervisor,
} from "./anthropicProxySupervisor";
import { startClipServer } from "./startClipServer";
import { startHarnessMcpServer } from "./startHarnessMcpServer";

export type HttpStatus = {
	/**
	 * 剪藏服务。`token` 是浏览器扩展/书签脚本调用 `POST /api/clip` 时必须带的凭证
	 * （`x-api-key` 或 `Authorization: Bearer`），设置面板需要把它展示给用户复制。
	 */
	clip: { port: number; baseUrl: string; token: string };
	/**
	 * Anthropic 兼容代理。`token` 由主进程在拉起 Agent SDK 时通过
	 * `ANTHROPIC_API_KEY` 环境变量下发，渲染端通常不需要用它。
	 * 自动重启后端口可能变化，实时值请通过 `anthropicProxySupervisor.getStatus()` 读取。
	 */
	anthropicProxy: { port: number; baseUrl: string };
	/**
	 * 代理健康监督器：周期探活、自动重启、状态广播。
	 * `getStatus()` 返回的 port/baseUrl 永远是当前活跃实例的值。
	 */
	anthropicProxySupervisor: AnthropicProxySupervisor;
	/** AI Hub 反向 MCP Server（外部 CLI 通过它调用本应用） */
	aihubMcp: { port: number; baseUrl: string; endpoint: string } | null;
};

export async function startHttpServers({
	logger,
	db,
}: {
	logger: Logger;
	db: DbContext;
}) {
	const clip = await startClipServer({ logger, db });
	const anthropicProxySupervisor = await startAnthropicProxySupervisor({
		logger,
		db,
	});
	const proxyStatus = anthropicProxySupervisor.getStatus();
	const anthropicProxy = {
		port: proxyStatus.port,
		baseUrl: proxyStatus.baseUrl,
	};

	// 反向 MCP 起不来不能拖垮整个启动链路：它是增值能力，
	// 端口被占 / 权限受限时应用其余部分照常可用。
	let aihubMcp: HttpStatus["aihubMcp"] = null;
	try {
		const started = await startHarnessMcpServer({ logger, db });
		aihubMcp = {
			port: started.port,
			baseUrl: started.baseUrl,
			endpoint: started.endpoint,
		};
	} catch (error) {
		logger.warn({
			msg: "AI Hub MCP server 启动失败，反向调用能力不可用",
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return {
		clip,
		anthropicProxy,
		anthropicProxySupervisor,
		aihubMcp,
	} satisfies HttpStatus;
}
