import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import { startAnthropicProxyServer } from "./startAnthropicProxyServer";
import { startClipServer } from "./startClipServer";
import { startHarnessMcpServer } from "./startHarnessMcpServer";

export type HttpStatus = {
	clip: { port: number; baseUrl: string };
	anthropicProxy: { port: number; baseUrl: string };
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
	const anthropicProxy = await startAnthropicProxyServer({ logger, db });

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

	return { clip, anthropicProxy, aihubMcp } satisfies HttpStatus;
}
