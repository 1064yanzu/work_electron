import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import { startAnthropicProxyServer } from "./startAnthropicProxyServer";
import { startClipServer } from "./startClipServer";

export type HttpStatus = {
	clip: { port: number; baseUrl: string };
	anthropicProxy: { port: number; baseUrl: string };
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

	return { clip, anthropicProxy } satisfies HttpStatus;
}
